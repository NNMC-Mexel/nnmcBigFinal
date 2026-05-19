/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const DOC_UID = "api::document.document";
const NOW = () => new Date();

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

function boolValue(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
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

function migrationDir() {
  return path.resolve(__dirname, "..", "..", "migration-input", "signdocwithesp");
}

function prefixed(env, prefix, key) {
  return prefix ? env[`${prefix}_${key}`] : env[key];
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
  };
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

function unique(values) {
  return Array.from(new Set(values));
}

function randomDocumentId() {
  return crypto.randomBytes(12).toString("base64url").toLowerCase();
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

async function listTables(client) {
  const result = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`
  );
  return result.rows.map((row) => row.table_name);
}

async function listColumns(client, table) {
  const result = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [table]
  );
  return result.rows.map((row) => row.column_name);
}

async function loadMetadata(client) {
  const tables = await listTables(client);
  const columns = {};
  for (const table of tables) columns[table] = await listColumns(client, table);
  return { tables, columns };
}

function colSet(metadata, table) {
  return new Set(metadata.columns[table] || []);
}

function firstTable(metadata, names, predicate) {
  for (const name of names) {
    if (metadata.columns[name]) return name;
  }
  return metadata.tables.find((table) => predicate(table, colSet(metadata, table)));
}

function usersTable(metadata) {
  if (metadata.columns.up_users) return "up_users";
  if (metadata.columns.users) return "users";
  throw new Error("Could not find users table");
}

function rolesTable(metadata) {
  if (metadata.columns.up_roles) return "up_roles";
  if (metadata.columns.roles) return "roles";
  throw new Error("Could not find users-permissions roles table");
}

function uploadFilesTable(metadata) {
  const table = firstTable(
    metadata,
    ["files", "upload_files", "strapi_files", "up_files"],
    (name, cols) =>
      name.includes("file") &&
      cols.has("id") &&
      cols.has("hash") &&
      cols.has("ext") &&
      cols.has("url")
  );
  if (!table) throw new Error("Could not find upload files table");
  return table;
}

function filesMorphTable(metadata) {
  const table = firstTable(
    metadata,
    ["files_related_mph", "files_related_morphs", "upload_files_related_mph"],
    (name, cols) =>
      name.includes("file") &&
      cols.has("file_id") &&
      cols.has("field") &&
      (cols.has("related_id") || cols.has("document_id"))
  );
  if (!table) throw new Error("Could not find files morph table");
  return table;
}

function creatorLinkTable(metadata) {
  return firstTable(
    metadata,
    ["documents_creator_lnk", "documents_creator_links"],
    (name, cols) =>
      name.includes("document") &&
      name.includes("creator") &&
      cols.has("document_id") &&
      cols.has("user_id")
  );
}

function assignedUsersLinkTable(metadata) {
  return firstTable(
    metadata,
    ["documents_assigned_users_lnk", "documents_assigned_users_links"],
    (name, cols) =>
      name.includes("document") &&
      name.includes("assigned") &&
      cols.has("document_id") &&
      cols.has("user_id")
  );
}

function userRoleLinkTable(metadata) {
  return firstTable(
    metadata,
    ["up_users_role_lnk", "up_users_role_links"],
    (name, cols) =>
      name.includes("user") && name.includes("role") && cols.has("user_id") && cols.has("role_id")
  );
}

function userDepartmentLinkTable(metadata) {
  return firstTable(
    metadata,
    ["up_users_department_lnk", "up_users_department_links"],
    (name, cols) =>
      name.includes("user") &&
      name.includes("department") &&
      cols.has("user_id") &&
      cols.has("department_id")
  );
}

function documentTypeLinkTable(metadata) {
  return firstTable(
    metadata,
    ["documents_document_type_lnk", "documents_document_type_links"],
    (name, cols) =>
      name.includes("document") &&
      name.includes("type") &&
      cols.has("document_id") &&
      cols.has("document_type_id")
  );
}

function subdivisionLinkTable(metadata) {
  return firstTable(
    metadata,
    ["documents_subdivision_lnk", "documents_subdivision_links"],
    (name, cols) =>
      name.includes("document") &&
      name.includes("subdivision") &&
      cols.has("document_id") &&
      cols.has("subdivision_id")
  );
}

async function loadUsersByEmail(client, metadata, emails) {
  const table = usersTable(metadata);
  const result = await client.query(
    `select * from ${qIdent(table)} where lower(email) = any($1::text[])`,
    [emails.map(normalizeEmail)]
  );
  const map = new Map();
  for (const row of result.rows) map.set(normalizeEmail(row.email), row);
  return map;
}

async function loadAllUsersById(client, metadata) {
  const table = usersTable(metadata);
  const result = await client.query(`select * from ${qIdent(table)}`);
  return new Map(result.rows.map((row) => [Number(row.id), row]));
}

async function loadDocuments(client) {
  const result = await client.query(`select * from documents order by id`);
  return result.rows;
}

async function loadCreatorLinks(client, metadata) {
  const table = creatorLinkTable(metadata);
  if (!table) return new Map();
  const result = await client.query(`select * from ${qIdent(table)}`);
  const map = new Map();
  for (const row of result.rows) map.set(Number(row.document_id), Number(row.user_id));
  return map;
}

async function loadFileRelations(client, metadata) {
  const filesTable = uploadFilesTable(metadata);
  const morphTable = filesMorphTable(metadata);
  const fileRows = await client.query(`select * from ${qIdent(filesTable)}`);
  const filesById = new Map(fileRows.rows.map((row) => [Number(row.id), row]));
  const morphRows = await client.query(`select * from ${qIdent(morphTable)}`);
  const byDocument = new Map();
  for (const row of morphRows.rows) {
    if (!["originalFile", "currentFile"].includes(row.field)) continue;
    if (row.related_type && row.related_type !== DOC_UID) continue;
    const documentId = Number(row.related_id || row.document_id);
    const fileId = Number(row.file_id);
    if (!documentId || !fileId) continue;
    const item = byDocument.get(documentId) || {};
    item[row.field] = filesById.get(fileId) || { id: fileId };
    byDocument.set(documentId, item);
  }
  return { filesTable, morphTable, filesById, byDocument };
}

async function loadDocumentTypeMap(client, metadata) {
  const link = documentTypeLinkTable(metadata);
  if (!link || !metadata.columns.document_types) return new Map();
  const result = await client.query(
    `select l.document_id, t.name
     from ${qIdent(link)} l
     join document_types t on t.id = l.document_type_id`
  );
  return new Map(result.rows.map((row) => [Number(row.document_id), row.name]));
}

async function loadSubdivisionMap(client, metadata) {
  const link = subdivisionLinkTable(metadata);
  if (!link || !metadata.columns.subdivisions) return new Map();
  const result = await client.query(
    `select l.document_id, s.name
     from ${qIdent(link)} l
     join subdivisions s on s.id = l.subdivision_id`
  );
  return new Map(result.rows.map((row) => [Number(row.document_id), row.name]));
}

function signerEmails(document) {
  const signers = jsonValue(rowValue(document, ["signers"], []), []);
  if (!Array.isArray(signers)) return [];
  return signers
    .map((signer) => normalizeEmail(signer.userEmail || signer.email))
    .filter(Boolean);
}

function signatureHistory(document) {
  const value = rowValue(document, ["signature_history", "signatureHistory"], []);
  const history = jsonValue(value, []);
  return Array.isArray(history) ? history : [];
}

function normalizeStatus(status) {
  const value = String(status || "").trim();
  if (["pending", "in_progress", "completed", "cancelled", "revision", "revoked"].includes(value)) {
    return value;
  }
  return "pending";
}

function normalizeSigners(signers, targetUsersByEmail) {
  const items = jsonValue(signers, []);
  if (!Array.isArray(items)) return [];
  return items.map((signer, index) => {
    const email = normalizeEmail(signer.userEmail || signer.email);
    const targetUser = targetUsersByEmail.get(email);
    return {
      ...signer,
      userId: targetUser?.id || signer.userId,
      userName: signer.userName || targetUser?.full_name || targetUser?.username || email,
      userEmail: email,
      email,
      order: Number(signer.order || index + 1),
      status: ["pending", "signed", "rejected"].includes(String(signer.status))
        ? signer.status
        : "pending",
    };
  });
}

function normalizeHistory(history, targetUsersByEmail, sourceUsersById) {
  const items = jsonValue(history, []);
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const sourceUser = sourceUsersById.get(Number(item.userId));
    const email = normalizeEmail(item.email || item.userEmail || sourceUser?.email);
    const targetUser = email ? targetUsersByEmail.get(email) : null;
    return {
      ...item,
      userId: targetUser?.id || item.userId,
      userEmail: email || item.userEmail || null,
      email: email || item.email || null,
    };
  });
}

function fileKeyFromUpload(file) {
  if (!file) return null;
  const hash = String(file.hash || "").trim();
  const ext = String(file.ext || "").trim();
  if (hash && ext) return `${hash}${ext}`;
  return extractObjectKey(file.url);
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
    if (parts.length > 1) return parts.slice(1).join("/");
    return parts[0];
  } catch {
    return raw.replace(/^\/+/, "");
  }
}

function collectFilesForDocument(document, fileRelations, sourceBucket) {
  const relation = fileRelations.byDocument.get(Number(document.id)) || {};
  const files = [];
  for (const field of ["originalFile", "currentFile"]) {
    const file = relation[field];
    const key = fileKeyFromUpload(file);
    if (key) files.push({ kind: field, key, sourceFile: file });
  }
  for (const item of signatureHistory(document)) {
    const key = extractObjectKey(item.cmsFileUrl, sourceBucket);
    if (key) files.push({ kind: "cms", key, sourceFile: null });
  }
  return files;
}

function s3Client(config) {
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

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObject({ sourceS3, targetS3, sourceBucket, targetBucket, key, dryRun }) {
  const exists = await objectExists(targetS3, targetBucket, key);
  if (exists) return { key, copied: false, reason: "already_exists" };
  const sourceExists = await objectExists(sourceS3, sourceBucket, key);
  if (!sourceExists) return { key, copied: false, missing: true };
  if (dryRun) return { key, copied: false, reason: "dry_run" };

  const source = await sourceS3.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
  await targetS3.send(
    new PutObjectCommand({
      Bucket: targetBucket,
      Key: key,
      Body: source.Body,
      ContentType: source.ContentType,
      Metadata: source.Metadata,
    })
  );
  return { key, copied: true };
}

async function insertRow(client, table, data, returning = "id") {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  const values = keys.map((key) => data[key]);
  const placeholders = keys.map((_, index) => `$${index + 1}`);
  const result = await client.query(
    `insert into ${qIdent(table)} (${keys.map(qIdent).join(", ")})
     values (${placeholders.join(", ")})
     returning ${qIdent(returning)}`,
    values
  );
  return result.rows[0]?.[returning];
}

async function updateRow(client, table, id, data) {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((key, index) => `${qIdent(key)} = $${index + 1}`);
  await client.query(
    `update ${qIdent(table)} set ${sets.join(", ")} where id = $${keys.length + 1}`,
    [...keys.map((key) => data[key]), id]
  );
}

function dataForColumns(metadata, table, source, overrides = {}) {
  const columns = colSet(metadata, table);
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (columns.has(key)) out[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (columns.has(key)) out[key] = value;
  }
  return out;
}

async function ensureDepartment(client, metadata, name, dryRun, report) {
  const clean = String(name || "").trim();
  if (!clean || !metadata.columns.departments) return null;
  const found = await client.query(`select * from departments where lower(name) = lower($1) limit 1`, [clean]);
  if (found.rows[0]) return found.rows[0].id;
  report.departmentsToCreate.add(clean);
  if (dryRun) return null;
  return insertRow(
    client,
    "departments",
    dataForColumns(metadata, "departments", {
      name: clean,
      key: null,
      created_at: NOW(),
      updated_at: NOW(),
      published_at: NOW(),
    })
  );
}

async function ensureDocumentType(client, metadata, name, dryRun, report) {
  const clean = String(name || "").trim();
  if (!clean || !metadata.columns.document_types) return null;
  const found = await client.query(`select * from document_types where lower(name) = lower($1) limit 1`, [clean]);
  if (found.rows[0]) return found.rows[0].id;
  report.documentTypesToCreate.add(clean);
  if (dryRun) return null;
  return insertRow(
    client,
    "document_types",
    dataForColumns(metadata, "document_types", {
      document_id: randomDocumentId(),
      name: clean,
      created_at: NOW(),
      updated_at: NOW(),
      published_at: NOW(),
    })
  );
}

async function ensureSubdivision(client, metadata, name, dryRun, report) {
  const clean = String(name || "").trim();
  if (!clean || !metadata.columns.subdivisions) return null;
  const found = await client.query(`select * from subdivisions where lower(name) = lower($1) limit 1`, [clean]);
  if (found.rows[0]) return found.rows[0].id;
  report.subdivisionsToCreate.add(clean);
  if (dryRun) return null;
  return insertRow(
    client,
    "subdivisions",
    dataForColumns(metadata, "subdivisions", {
      document_id: randomDocumentId(),
      name: clean,
      created_at: NOW(),
      updated_at: NOW(),
      published_at: NOW(),
    })
  );
}

async function ensureUsers(client, metadata, dryRun, report) {
  const table = usersTable(metadata);
  const roleTable = rolesTable(metadata);
  const roleLink = userRoleLinkTable(metadata);
  const deptLink = userDepartmentLinkTable(metadata);
  const roleResult = await client.query(
    `select id from ${qIdent(roleTable)}
     where type = 'authenticated' or name in ('Authenticated', 'Member')
     order by case when type = 'authenticated' then 0 when name = 'Member' then 1 else 2 end
     limit 1`
  );
  const roleId = roleResult.rows[0]?.id || null;
  if (!roleId) throw new Error("Could not find authenticated users-permissions role");

  for (const person of PEOPLE) {
    const existing = await client.query(`select * from ${qIdent(table)} where lower(email) = lower($1) limit 1`, [
      person.email,
    ]);
    const departmentId = await ensureDepartment(client, metadata, person.department, dryRun, report);
    if (!existing.rows[0]) {
      report.usersToCreate.push(person.email);
      if (!dryRun) {
        const password = bcrypt.hashSync(`migrated-${crypto.randomBytes(24).toString("hex")}`, 10);
        const userId = await insertRow(
          client,
          table,
          dataForColumns(metadata, table, {
            document_id: randomDocumentId(),
            username: person.fullName,
            email: person.email,
            provider: "local",
            password,
            confirmed: true,
            blocked: false,
            full_name: person.fullName,
            position: person.position || null,
            signdoc_access: true,
            is_kpi_responsible: false,
            is_super_admin: false,
            created_at: NOW(),
            updated_at: NOW(),
            published_at: NOW(),
          })
        );
        if (roleLink) await insertGenericLink(client, metadata, roleLink, { user_id: userId, role_id: roleId });
        if (deptLink && departmentId) {
          await insertGenericLink(client, metadata, deptLink, { user_id: userId, department_id: departmentId });
        }
      }
      continue;
    }

    const user = existing.rows[0];
    const patch = {};
    if (person.fullName && user.full_name !== person.fullName) patch.full_name = person.fullName;
    if (person.position && user.position !== person.position) patch.position = person.position;
    if (colSet(metadata, table).has("signdoc_access") && user.signdoc_access !== true) {
      patch.signdoc_access = true;
    }
    if (Object.keys(patch).length > 0) {
      report.usersToUpdate.push(person.email);
      if (!dryRun) await updateRow(client, table, user.id, { ...patch, updated_at: NOW() });
    }
    if (!dryRun && roleLink) {
      await ensureGenericLink(client, metadata, roleLink, { user_id: user.id, role_id: roleId });
    }
    if (!dryRun && deptLink && departmentId) {
      await ensureGenericLink(client, metadata, deptLink, { user_id: user.id, department_id: departmentId });
    }
  }
}

async function ensureGenericLink(client, metadata, table, values) {
  const keys = Object.keys(values);
  const where = keys.map((key, index) => `${qIdent(key)} = $${index + 1}`).join(" and ");
  const found = await client.query(`select id from ${qIdent(table)} where ${where} limit 1`, keys.map((key) => values[key]));
  if (found.rows[0]) return found.rows[0].id;
  return insertGenericLink(client, metadata, table, values);
}

async function insertGenericLink(client, metadata, table, values) {
  const cols = colSet(metadata, table);
  const data = {};
  for (const [key, value] of Object.entries(values)) {
    if (cols.has(key)) data[key] = value;
  }
  for (const key of cols) {
    if (key.endsWith("_ord") && data[key] === undefined) data[key] = 1;
    if (key === "order" && data[key] === undefined) data[key] = 1;
  }
  return insertRow(client, table, data);
}

async function ensureTargetFile(client, metadata, sourceFile, dryRun, report) {
  if (!sourceFile?.id) return null;
  const table = uploadFilesTable(metadata);
  const key = fileKeyFromUpload(sourceFile);
  const found = await client.query(
    `select * from ${qIdent(table)} where hash = $1 and ext = $2 limit 1`,
    [sourceFile.hash, sourceFile.ext]
  );
  if (found.rows[0]) return found.rows[0].id;
  report.fileRowsToCreate += 1;
  if (dryRun) return null;

  const data = dataForColumns(
    metadata,
    table,
    sourceFile,
    {
      document_id: randomDocumentId(),
      url: key ? `/uploads/${key}` : sourceFile.url,
      provider: "aws-s3",
      created_at: sourceFile.created_at || NOW(),
      updated_at: sourceFile.updated_at || NOW(),
      published_at: sourceFile.published_at || NOW(),
    }
  );
  delete data.id;
  return insertRow(client, table, data);
}

async function targetDocumentExists(client, document) {
  const documentId = rowValue(document, ["document_id", "documentId"]);
  const uid = document.uid;
  const found = await client.query(
    `select id from documents where document_id = $1 or ($2::text is not null and uid = $2) limit 1`,
    [documentId, uid || null]
  );
  return found.rows[0]?.id || null;
}

async function createTargetDocument({
  client,
  metadata,
  sourceDocument,
  sourceCreator,
  targetUsersByEmail,
  sourceUsersById,
  fileIds,
  documentTypeId,
  subdivisionId,
  dryRun,
  report,
}) {
  const existingId = await targetDocumentExists(client, sourceDocument);
  if (existingId) {
    report.documentsSkippedExisting += 1;
    return existingId;
  }

  const sourceDocumentId = rowValue(sourceDocument, ["document_id", "documentId"]);
  const sourceSigners = rowValue(sourceDocument, ["signers"], []);
  const sourceHistory = rowValue(sourceDocument, ["signature_history", "signatureHistory"], []);
  const signers = normalizeSigners(sourceSigners, targetUsersByEmail);
  const history = normalizeHistory(sourceHistory, targetUsersByEmail, sourceUsersById);
  const metadataValue = {
    migratedFrom: {
      service: "signdocwithesp",
      sourceNumericId: sourceDocument.id,
      sourceDocumentId,
      migratedAt: new Date().toISOString(),
    },
  };

  report.documentsToCreate += 1;
  if (dryRun) return null;

  const docData = dataForColumns(metadata, "documents", sourceDocument, {
    document_id: sourceDocumentId || randomDocumentId(),
    title: sourceDocument.title,
    uid: sourceDocument.uid || null,
    status: normalizeStatus(sourceDocument.status),
    signature_type: rowValue(sourceDocument, ["signature_type", "signatureType"], null),
    signature_sequential: Boolean(rowValue(sourceDocument, ["signature_sequential", "signatureSequential"], false)),
    signers,
    signature_history: history,
    metadata: metadataValue,
    created_at: sourceDocument.created_at || NOW(),
    updated_at: sourceDocument.updated_at || NOW(),
    published_at: sourceDocument.published_at || NOW(),
  });
  delete docData.id;

  const documentId = await insertRow(client, "documents", docData);

  const creatorEmail = normalizeEmail(sourceCreator?.email) || "gulnazahmetzanova7@gmail.com";
  const creator = targetUsersByEmail.get(creatorEmail) || targetUsersByEmail.get("gulnazahmetzanova7@gmail.com");
  const creatorLink = creatorLinkTable(metadata);
  if (creatorLink && creator?.id) {
    await insertGenericLink(client, metadata, creatorLink, { document_id: documentId, user_id: creator.id });
  }

  const assignedLink = assignedUsersLinkTable(metadata);
  if (assignedLink) {
    for (const userId of unique(signers.map((signer) => Number(signer.userId)).filter(Boolean))) {
      if (creator?.id && Number(creator.id) === Number(userId)) continue;
      await insertGenericLink(client, metadata, assignedLink, { document_id: documentId, user_id: userId });
    }
  }

  const morphTable = filesMorphTable(metadata);
  for (const field of ["originalFile", "currentFile"]) {
    const fileId = fileIds[field];
    if (!fileId) continue;
    await insertGenericLink(client, metadata, morphTable, {
      file_id: fileId,
      related_id: documentId,
      related_type: DOC_UID,
      field,
    });
  }

  const docTypeLink = documentTypeLinkTable(metadata);
  if (docTypeLink && documentTypeId) {
    await insertGenericLink(client, metadata, docTypeLink, {
      document_id: documentId,
      document_type_id: documentTypeId,
    });
  }

  const subdivisionLink = subdivisionLinkTable(metadata);
  if (subdivisionLink && subdivisionId) {
    await insertGenericLink(client, metadata, subdivisionLink, {
      document_id: documentId,
      subdivision_id: subdivisionId,
    });
  }

  return documentId;
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = args["migration-dir"] || migrationDir();
  const sourceEnvPath = args["source-env"] || path.join(dir, "source.env");
  const targetEnvPath = args["target-env"] || path.join(dir, "target.env");
  const sourceFileEnv = parseEnvFile(sourceEnvPath);
  const targetFileEnv = parseEnvFile(targetEnvPath);
  const sourceEnv = { ...process.env, ...sourceFileEnv };
  const targetEnv = { ...process.env, ...targetFileEnv };
  const apply = boolValue(args.apply || process.env.APPLY);
  const dryRun = !apply;
  const checkMinio = apply || boolValue(args["check-minio"] || process.env.CHECK_MINIO || "true");

  const sourceDb = await connectClient("source", dbConfig(sourceEnv, "SOURCE"));
  const targetDb = await connectClient("target", dbConfig(targetEnv, ""));
  const sourceMinio = minioConfig(sourceEnv, "SOURCE");
  const targetMinio = minioConfig(targetEnv, "");
  const sourceS3 = s3Client(sourceMinio);
  const targetS3 = s3Client(targetMinio);

  const report = {
    mode: dryRun ? "dry-run" : "apply",
    startedAt: new Date().toISOString(),
    usersToCreate: [],
    usersToUpdate: [],
    departmentsToCreate: new Set(),
    documentTypesToCreate: new Set(),
    subdivisionsToCreate: new Set(),
    documentsToCreate: 0,
    documentsSkippedExisting: 0,
    fileRowsToCreate: 0,
    objectsToCopy: 0,
    objectsCopied: 0,
    objectsAlreadyInTarget: 0,
    missingSourceObjects: [],
    rejectedByForeignSigner: [],
  };

  try {
    const [sourceMeta, targetMeta] = await Promise.all([loadMetadata(sourceDb), loadMetadata(targetDb)]);
    const sourceUsersById = await loadAllUsersById(sourceDb, sourceMeta);
    const creatorLinks = await loadCreatorLinks(sourceDb, sourceMeta);
    const fileRelations = await loadFileRelations(sourceDb, sourceMeta);
    const sourceDocTypes = await loadDocumentTypeMap(sourceDb, sourceMeta);
    const sourceSubdivisions = await loadSubdivisionMap(sourceDb, sourceMeta);
    const documents = await loadDocuments(sourceDb);

    const eligible = [];
    for (const document of documents) {
      const emails = signerEmails(document);
      if (!emails.some((email) => TARGET_EMAILS.has(email))) continue;
      const foreign = emails.filter((email) => !TARGET_EMAILS.has(email));
      if (foreign.length > 0) {
        report.rejectedByForeignSigner.push({
          id: document.id,
          documentId: rowValue(document, ["document_id", "documentId"]),
          title: document.title,
          foreign,
        });
        continue;
      }
      eligible.push(document);
    }

    if (report.rejectedByForeignSigner.length > 0) {
      throw new Error(`Found ${report.rejectedByForeignSigner.length} documents with foreign signers`);
    }

    await ensureUsers(targetDb, targetMeta, dryRun, report);
    const targetUsersByEmail = await loadUsersByEmail(targetDb, targetMeta, Array.from(TARGET_EMAILS));

    const allFiles = [];
    for (const document of eligible) {
      allFiles.push(...collectFilesForDocument(document, fileRelations, sourceMinio.bucket));
    }
    const uniqueKeys = unique(allFiles.map((item) => item.key).filter(Boolean));

    for (const key of uniqueKeys) {
      if (!checkMinio) continue;
      const copy = await copyObject({
        sourceS3,
        targetS3,
        sourceBucket: sourceMinio.bucket,
        targetBucket: targetMinio.bucket,
        key,
        dryRun,
      });
      if (copy.missing) report.missingSourceObjects.push(key);
      else if (copy.reason === "already_exists") report.objectsAlreadyInTarget += 1;
      else if (copy.reason === "dry_run") report.objectsToCopy += 1;
      else if (copy.copied) {
        report.objectsToCopy += 1;
        report.objectsCopied += 1;
      }
    }

    if (report.missingSourceObjects.length > 0) {
      throw new Error(`Missing ${report.missingSourceObjects.length} source MinIO objects`);
    }

    const sourceToTargetFileId = new Map();

    for (const document of eligible) {
      const fields = fileRelations.byDocument.get(Number(document.id)) || {};
      const fileIds = {};
      for (const field of ["originalFile", "currentFile"]) {
        const sourceFile = fields[field];
        if (!sourceFile?.id) continue;
        if (!sourceToTargetFileId.has(sourceFile.id)) {
          const targetFileId = await ensureTargetFile(targetDb, targetMeta, sourceFile, dryRun, report);
          sourceToTargetFileId.set(sourceFile.id, targetFileId);
        }
        fileIds[field] = sourceToTargetFileId.get(sourceFile.id);
      }

      const typeName = sourceDocTypes.get(Number(document.id));
      const subdivisionName = sourceSubdivisions.get(Number(document.id));
      const documentTypeId = await ensureDocumentType(targetDb, targetMeta, typeName, dryRun, report);
      const subdivisionId = await ensureSubdivision(targetDb, targetMeta, subdivisionName, dryRun, report);
      const sourceCreator = sourceUsersById.get(creatorLinks.get(Number(document.id)));

      await createTargetDocument({
        client: targetDb,
        metadata: targetMeta,
        sourceDocument: document,
        sourceCreator,
        targetUsersByEmail,
        sourceUsersById,
        fileIds,
        documentTypeId,
        subdivisionId,
        dryRun,
        report,
      });
    }

    const output = {
      ...report,
      departmentsToCreate: Array.from(report.departmentsToCreate),
      documentTypesToCreate: Array.from(report.documentTypesToCreate),
      subdivisionsToCreate: Array.from(report.subdivisionsToCreate),
      eligibleDocuments: eligible.length,
      uniqueObjectKeys: uniqueKeys.length,
      finishedAt: new Date().toISOString(),
    };

    const reportPath =
      args.report || path.join(dir, `signdocwithesp-migration-${dryRun ? "dry-run" : "apply"}-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(output, null, 2));

    console.log("SignDocWithEsp migration");
    console.log("------------------------");
    console.log(`Mode: ${output.mode}`);
    console.log(`Eligible documents: ${output.eligibleDocuments}`);
    console.log(`Users to create: ${output.usersToCreate.length}`);
    console.log(`Users to update: ${output.usersToUpdate.length}`);
    console.log(`Departments to create: ${output.departmentsToCreate.length}`);
    console.log(`Document types to create: ${output.documentTypesToCreate.length}`);
    console.log(`Subdivisions to create: ${output.subdivisionsToCreate.length}`);
    console.log(`Documents to create: ${output.documentsToCreate}`);
    console.log(`Documents skipped existing: ${output.documentsSkippedExisting}`);
    console.log(`File rows to create: ${output.fileRowsToCreate}`);
    console.log(`Unique object keys: ${output.uniqueObjectKeys}`);
    console.log(`Objects to copy: ${output.objectsToCopy}`);
    console.log(`Objects already in target: ${output.objectsAlreadyInTarget}`);
    console.log(`Missing source objects: ${output.missingSourceObjects.length}`);
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
