/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

const DOC_UID = "api::document.document";

const PEOPLE = [
  {
    fullName: "Тасеменова Дарига Кошкарбаевна",
    email: "d.tassemenova@nnmc.kz",
  },
  {
    fullName: "Талкымбаева Айгуль Барамбаевна",
    email: "a.talkymbayeva@nnmc.kz",
    department: "Отдел бухгалтерского учета и отчетности",
    position: "Специалист-бухгалтер",
  },
  {
    fullName: "Мусабаева Айна Муратовна",
    email: "musabaeva.000@mail.ru",
    department: "Администрация",
    position: "руководитель сестринской службы",
  },
  {
    fullName: "Кушенова Сауле Жолдасбековна",
    email: "kushenova.s@mail.ru",
  },
  {
    fullName: "Жаркинбекова Дамира Ибрагимовна",
    email: "d.zharkinbekova@nnmc.kz",
    department: "Отдел экономического анализа и планирования",
    position: "ведующий специалист",
  },
  {
    fullName: "Гульназ Ахметжанова",
    email: "gulnazahmetzanova7@gmail.com",
    department: "Клинико-фармакологический отдела",
    position: "старшая медсестра",
  },
].map((person) => ({ ...person, email: normalizeEmail(person.email) }));

const TARGET_EMAILS = new Set(PEOPLE.map((person) => person.email));

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function defaultMigrationDir() {
  return path.resolve(__dirname, "..", "..", "migration-input", "signdocwithesp");
}

function prefixed(env, prefix, key) {
  return env[`${prefix}_${key}`] || env[key];
}

function dbConfig(env, prefix) {
  const connectionString = prefixed(env, prefix, "DATABASE_URL");
  if (connectionString) {
    return {
      connectionString,
      ssl: boolValue(prefixed(env, prefix, "DATABASE_SSL"))
        ? { rejectUnauthorized: false }
        : false,
    };
  }
  return {
    host: prefixed(env, prefix, "DATABASE_HOST"),
    port: Number(prefixed(env, prefix, "DATABASE_PORT") || 5432),
    database: prefixed(env, prefix, "DATABASE_NAME"),
    user: prefixed(env, prefix, "DATABASE_USERNAME"),
    password: prefixed(env, prefix, "DATABASE_PASSWORD"),
    ssl: boolValue(prefixed(env, prefix, "DATABASE_SSL"))
      ? { rejectUnauthorized: false }
      : false,
  };
}

function minioConfig(env, prefix) {
  return {
    endpoint: prefixed(env, prefix, "MINIO_ENDPOINT"),
    bucket: prefixed(env, prefix, "MINIO_BUCKET"),
    accessKeyId: prefixed(env, prefix, "MINIO_ACCESS_KEY"),
    secretAccessKey: prefixed(env, prefix, "MINIO_SECRET_KEY"),
    publicUrl: prefixed(env, prefix, "MINIO_PUBLIC_URL"),
  };
}

function boolValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function qIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function jsonValue(value, fallback) {
  if (value == null) return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowValue(row, names, fallback = null) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return fallback;
}

async function connectClient(label, config) {
  const missing = [];
  for (const key of ["host", "database", "user"]) {
    if (!config.connectionString && !config[key]) missing.push(key);
  }
  if (missing.length > 0) {
    throw new Error(`${label} database config is missing: ${missing.join(", ")}`);
  }
  const client = new Client(config);
  await client.connect();
  return client;
}

async function listTables(client, schema = "public") {
  const result = await client.query(
    `select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by table_name`,
    [schema]
  );
  return result.rows.map((row) => row.table_name);
}

async function listColumns(client, table, schema = "public") {
  const result = await client.query(
    `select column_name from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`,
    [schema, table]
  );
  return result.rows.map((row) => row.column_name);
}

async function loadTableMetadata(client) {
  const tables = await listTables(client);
  const columns = {};
  for (const table of tables) {
    columns[table] = await listColumns(client, table);
  }
  return { tables, columns };
}

function tableWithColumns(metadata, predicate) {
  return metadata.tables.find((table) => predicate(table, new Set(metadata.columns[table] || [])));
}

function findUploadFilesTable(metadata) {
  const candidates = ["files", "upload_files", "strapi_files", "up_files"];
  for (const table of candidates) {
    const cols = new Set(metadata.columns[table] || []);
    if (cols.has("hash") && cols.has("ext") && cols.has("url")) return table;
  }
  return tableWithColumns(metadata, (table, cols) => {
    return (
      table.includes("file") &&
      cols.has("id") &&
      cols.has("hash") &&
      cols.has("ext") &&
      cols.has("url")
    );
  });
}

function findFilesMorphTable(metadata) {
  const candidates = ["files_related_mph", "files_related_morphs", "upload_files_related_mph"];
  for (const table of candidates) {
    const cols = new Set(metadata.columns[table] || []);
    if (cols.has("file_id") && cols.has("field")) return table;
  }
  return tableWithColumns(metadata, (table, cols) => {
    return (
      table.includes("file") &&
      cols.has("file_id") &&
      cols.has("field") &&
      (cols.has("related_id") || cols.has("document_id"))
    );
  });
}

function findCreatorLinkTable(metadata) {
  const preferred = ["documents_creator_lnk", "documents_creator_links"];
  for (const table of preferred) {
    const cols = new Set(metadata.columns[table] || []);
    if (cols.has("document_id") && cols.has("user_id")) return table;
  }
  return tableWithColumns(metadata, (table, cols) => {
    return table.includes("document") && table.includes("creator") && cols.has("document_id") && cols.has("user_id");
  });
}

function findUserDepartmentLinkTable(metadata) {
  return tableWithColumns(metadata, (table, cols) => {
    return table.includes("department") && cols.has("user_id") && cols.has("department_id");
  });
}

async function loadUsersByEmail(client, metadata, emails) {
  const usersTable = metadata.columns.up_users ? "up_users" : "users";
  const deptLink = findUserDepartmentLinkTable(metadata);
  const hasDepartments = Boolean(metadata.columns.departments);
  const params = emails.map(normalizeEmail);

  let query = `
    select u.*
    from ${qIdent(usersTable)} u
    where lower(u.email) = any($1::text[])
  `;
  if (deptLink && hasDepartments) {
    query = `
      select u.*, d.id as department_id, d.name as department_name, d.key as department_key
      from ${qIdent(usersTable)} u
      left join ${qIdent(deptLink)} ud on ud.user_id = u.id
      left join departments d on d.id = ud.department_id
      where lower(u.email) = any($1::text[])
    `;
  }

  const result = await client.query(query, [params]);
  const map = new Map();
  for (const row of result.rows) {
    map.set(normalizeEmail(row.email), row);
  }
  return map;
}

async function loadDepartmentsByName(client, metadata, names) {
  if (!metadata.columns.departments) return new Map();
  const clean = Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
  if (clean.length === 0) return new Map();
  const result = await client.query(
    `select id, name, key from departments where lower(name) = any($1::text[])`,
    [clean.map((name) => name.toLowerCase())]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.name || "").trim().toLowerCase(), row);
  }
  return map;
}

async function loadDocuments(client) {
  const result = await client.query(`select * from documents order by id`);
  return result.rows;
}

async function loadCreatorLinks(client, metadata) {
  const table = findCreatorLinkTable(metadata);
  if (!table) return { table: null, links: new Map() };
  const result = await client.query(`select * from ${qIdent(table)}`);
  const links = new Map();
  for (const row of result.rows) {
    links.set(Number(row.document_id), Number(row.user_id));
  }
  return { table, links };
}

async function loadFileRelations(client, metadata) {
  const filesTable = findUploadFilesTable(metadata);
  const morphTable = findFilesMorphTable(metadata);
  if (!filesTable || !morphTable) {
    return { filesTable, morphTable, byDocument: new Map(), filesById: new Map() };
  }

  const fileRows = await client.query(`select * from ${qIdent(filesTable)}`);
  const filesById = new Map(fileRows.rows.map((row) => [Number(row.id), row]));

  const morphCols = new Set(metadata.columns[morphTable] || []);
  const rows = await client.query(`select * from ${qIdent(morphTable)}`);
  const byDocument = new Map();
  for (const row of rows.rows) {
    const field = row.field;
    if (!["originalFile", "currentFile"].includes(field)) continue;
    if (morphCols.has("related_type") && row.related_type && row.related_type !== DOC_UID) continue;
    const documentId = Number(row.related_id || row.document_id);
    const fileId = Number(row.file_id);
    if (!documentId || !fileId) continue;
    const item = byDocument.get(documentId) || {};
    item[field] = filesById.get(fileId) || { id: fileId };
    byDocument.set(documentId, item);
  }
  return { filesTable, morphTable, byDocument, filesById };
}

function signerEmails(document) {
  const signers = jsonValue(rowValue(document, ["signers"], []), []);
  if (!Array.isArray(signers)) return [];
  return signers
    .map((signer) => normalizeEmail(signer.userEmail || signer.email))
    .filter(Boolean);
}

function signatureHistory(document) {
  const history = jsonValue(rowValue(document, ["signature_history", "signatureHistory"], []), []);
  return Array.isArray(history) ? history : [];
}

function fileKeyFromUpload(file) {
  if (!file) return null;
  const hash = String(file.hash || "").trim();
  const ext = String(file.ext || "").trim();
  if (hash && ext) return `${hash}${ext}`;
  const url = String(file.url || "").trim();
  return extractObjectKey(url);
}

function extractObjectKey(value, bucket) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw.replace(/^\/uploads\//, "");
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    if (bucket && parts[0] === bucket) return parts.slice(1).join("/");
    return parts.join("/");
  } catch {
    return raw.replace(/^\/+/, "");
  }
}

function collectDocumentFiles(document, fileRelations, sourceBucket) {
  const fields = fileRelations.byDocument.get(Number(document.id)) || {};
  const files = [];
  for (const field of ["originalFile", "currentFile"]) {
    const file = fields[field];
    const key = fileKeyFromUpload(file);
    if (key) {
      files.push({
        kind: field,
        key,
        fileId: file.id,
        name: file.name || null,
        url: file.url || null,
      });
    }
  }
  for (const item of signatureHistory(document)) {
    const key = extractObjectKey(item.cmsFileUrl, sourceBucket);
    if (key) {
      files.push({
        kind: "cms",
        key,
        fileId: null,
        name: item.cmsFileName || null,
        url: item.cmsFileUrl || null,
      });
    }
  }
  return files;
}

function s3Client(config) {
  if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey) return null;
  return new S3Client({
    endpoint: config.endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

async function headObjects(client, bucket, keys) {
  const out = new Map();
  if (!client || !bucket) return out;
  for (const key of keys) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      out.set(key, true);
    } catch (error) {
      out.set(key, false);
    }
  }
  return out;
}

function summarizeDocument(document) {
  return {
    id: document.id,
    documentId: rowValue(document, ["document_id", "documentId"]),
    uid: document.uid || null,
    title: document.title,
    status: document.status,
    signerEmails: signerEmails(document),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const migrationDir = args["migration-dir"] || defaultMigrationDir();
  const sourceEnvPath = args["source-env"] || path.join(migrationDir, "source.env");
  const targetEnvPath = args["target-env"] || path.join(migrationDir, "target.env");
  const checkMinio = boolValue(args["check-minio"] || process.env.CHECK_MINIO);

  const sourceFileEnv = parseEnvFile(sourceEnvPath);
  const targetFileEnv = parseEnvFile(targetEnvPath);
  const sourceEnv = { ...process.env, ...sourceFileEnv };
  const targetEnv = { ...process.env, ...targetFileEnv };
  const sourceDb = await connectClient("source", dbConfig(sourceEnv, ""));
  const targetDb = await connectClient("target", dbConfig(targetEnv, ""));

  try {
    const [sourceMeta, targetMeta] = await Promise.all([
      loadTableMetadata(sourceDb),
      loadTableMetadata(targetDb),
    ]);
    const sourceUsers = await loadUsersByEmail(sourceDb, sourceMeta, Array.from(TARGET_EMAILS));
    const targetUsers = await loadUsersByEmail(targetDb, targetMeta, Array.from(TARGET_EMAILS));
    const targetDepartments = await loadDepartmentsByName(
      targetDb,
      targetMeta,
      PEOPLE.map((person) => person.department)
    );
    const documents = await loadDocuments(sourceDb);
    const creatorLinks = await loadCreatorLinks(sourceDb, sourceMeta);
    const fileRelations = await loadFileRelations(sourceDb, sourceMeta);

    const relevant = [];
    const rejectedByForeignSigner = [];

    for (const document of documents) {
      const emails = signerEmails(document);
      const hasTargetSigner = emails.some((email) => TARGET_EMAILS.has(email));
      if (!hasTargetSigner) continue;
      const foreign = emails.filter((email) => !TARGET_EMAILS.has(email));
      if (foreign.length > 0) {
        rejectedByForeignSigner.push({ ...summarizeDocument(document), foreignSignerEmails: foreign });
        continue;
      }
      relevant.push(document);
    }

    const sourceMinio = minioConfig(sourceEnv, "");
    const targetMinio = minioConfig(targetEnv, "");
    const fileItems = [];
    for (const document of relevant) {
      for (const file of collectDocumentFiles(document, fileRelations, sourceMinio.bucket)) {
        fileItems.push({
          documentId: document.id,
          documentTitle: document.title,
          ...file,
        });
      }
    }
    const uniqueKeys = Array.from(new Set(fileItems.map((item) => item.key).filter(Boolean)));

    const sourceHead = checkMinio
      ? await headObjects(s3Client(sourceMinio), sourceMinio.bucket, uniqueKeys)
      : new Map();
    const targetHead = checkMinio
      ? await headObjects(s3Client(targetMinio), targetMinio.bucket, uniqueKeys)
      : new Map();

    const userReport = PEOPLE.map((person) => {
      const source = sourceUsers.get(person.email);
      const target = targetUsers.get(person.email);
      return {
        email: person.email,
        fullName: person.fullName,
        sourceUserId: source?.id || null,
        targetUserId: target?.id || null,
        targetExists: Boolean(target),
        department: person.department || source?.department_name || null,
        targetDepartmentExists: person.department
          ? targetDepartments.has(person.department.toLowerCase())
          : null,
        position: person.position || source?.position || null,
      };
    });

    const missingSourceObjects = checkMinio
      ? uniqueKeys.filter((key) => sourceHead.get(key) === false)
      : [];
    const existingTargetObjects = checkMinio
      ? uniqueKeys.filter((key) => targetHead.get(key) === true)
      : [];

    const creatorIds = Array.from(new Set(relevant.map((doc) => creatorLinks.links.get(Number(doc.id))).filter(Boolean)));

    const report = {
      mode: "dry-run-read-only",
      checkedAt: new Date().toISOString(),
      source: {
        documentsTotal: documents.length,
        uploadFilesTable: fileRelations.filesTable,
        filesMorphTable: fileRelations.morphTable,
        creatorLinkTable: creatorLinks.table,
        minioBucket: sourceMinio.bucket || null,
      },
      target: {
        minioBucket: targetMinio.bucket || null,
      },
      users: userReport,
      documents: {
        eligible: relevant.map(summarizeDocument),
        eligibleCount: relevant.length,
        rejectedByForeignSigner,
        rejectedByForeignSignerCount: rejectedByForeignSigner.length,
        sourceCreatorIds: creatorIds,
      },
      files: {
        totalReferences: fileItems.length,
        uniqueKeys: uniqueKeys.length,
        missingSourceObjects,
        existingTargetObjects,
        minioChecked: checkMinio,
      },
    };

    const reportPath =
      args.report ||
      path.join(migrationDir, `signdocwithesp-dry-run-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log("SignDocWithEsp migration dry-run");
    console.log("--------------------------------");
    console.log(`Source documents total: ${report.source.documentsTotal}`);
    console.log(`Eligible documents: ${report.documents.eligibleCount}`);
    console.log(`Rejected by foreign signer: ${report.documents.rejectedByForeignSignerCount}`);
    console.log(`Target users missing: ${userReport.filter((u) => !u.targetExists).length}`);
    console.log(`File references: ${report.files.totalReferences}`);
    console.log(`Unique object keys: ${report.files.uniqueKeys}`);
    if (checkMinio) {
      console.log(`Missing source objects: ${missingSourceObjects.length}`);
      console.log(`Existing target objects: ${existingTargetObjects.length}`);
    } else {
      console.log("MinIO HEAD checks: skipped (pass --check-minio true to enable)");
    }
    console.log(`Report: ${reportPath}`);
  } finally {
    await sourceDb.end().catch(() => {});
    await targetDb.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
