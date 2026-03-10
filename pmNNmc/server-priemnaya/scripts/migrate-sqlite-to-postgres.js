'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const core = require('@strapi/core');

const ROLE_UID = 'plugin::users-permissions.role';
const USER_UID = 'plugin::users-permissions.user';
const LETTER_UID = 'api::journal-letter.journal-letter';
const CHANGE_UID = 'api::journal-letter-change.journal-letter-change';
const MKB_UID = 'api::mkb-code.mkb-code';
const OP_UID = 'api::operation-code.operation-code';
const ORG_UID = 'api::organization.organization';
const REGION_UID = 'api::region.region';
const HELP_UID = 'api::help-type.help-type';
const DEPARTMENT_UID = 'api::department.department';

const toNull = (value) => (value === undefined || value === '' ? null : value);
const toBool = (value, fallback = false) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.toLowerCase());
  return fallback;
};

const parseJsonArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const pickSqliteSource = () => {
  const candidates = [
    process.env.SQLITE_SOURCE,
    '/app/.tmp/data.backup.db',
    '/app/.tmp/data.db',
    path.join(__dirname, '..', '.tmp', 'data.backup.db'),
    path.join(__dirname, '..', '.tmp', 'data.db'),
  ].filter(Boolean);

  const source = candidates.find((filePath) => fs.existsSync(filePath));
  if (!source) {
    throw new Error(
      `SQLite source not found. Checked: ${candidates.join(', ')}. ` +
        'Set SQLITE_SOURCE env explicitly.'
    );
  }
  return source;
};

const loadSourceData = (sourcePath) => {
  const db = new Database(sourcePath, { readonly: true });
  const hasTableStmt = db.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?"
  );
  const hasTable = (tableName) => Boolean(hasTableStmt.get(tableName));
  const rows = (tableName) => (hasTable(tableName) ? db.prepare(`SELECT * FROM ${tableName}`).all() : []);

  const data = {
    users: rows('up_users'),
    userRoles: rows('up_users_role_lnk'),
    letters: rows('journal_letters'),
    changes: rows('journal_letter_changes'),
    letterCreatedBy: rows('journal_letters_created_by_user_lnk'),
    letterUpdatedBy: rows('journal_letters_updated_by_user_lnk'),
    changeByUser: rows('journal_letter_changes_changed_by_user_lnk'),
    changeToLetter: rows('journal_letter_changes_letter_lnk'),
    mkbCodes: rows('mkb_codes'),
    operationCodes: rows('operation_codes'),
    organizations: rows('organizations'),
    regions: rows('regions'),
    helpTypes: rows('help_types'),
    departments: rows('departments'),
  };

  db.close();
  return data;
};

const mapBy = (rows, keyField, valueField) => {
  const map = new Map();
  for (const row of rows) {
    if (row[keyField] !== undefined && row[valueField] !== undefined) {
      map.set(row[keyField], row[valueField]);
    }
  }
  return map;
};

const ensureLookupRows = async (strapi, uid, keyField, sourceRows, toData) => {
  if (!Array.isArray(sourceRows) || sourceRows.length === 0) return 0;
  const existing = await strapi.db.query(uid).findMany();
  const existingKeys = new Set(
    existing
      .map((row) => row[keyField])
      .filter((key) => key !== null && key !== undefined && String(key).trim() !== '')
      .map((key) => String(key))
  );

  let created = 0;
  for (const row of sourceRows) {
    const data = toData(row);
    const key = data[keyField];
    if (key === null || key === undefined || String(key).trim() === '') continue;
    if (existingKeys.has(String(key))) continue;
    await strapi.db.query(uid).create({ data });
    existingKeys.add(String(key));
    created += 1;
  }
  return created;
};

const run = async () => {
  const sourcePath = pickSqliteSource();
  // eslint-disable-next-line no-console
  console.log(`[migrate] Using SQLite source: ${sourcePath}`);
  const source = loadSourceData(sourcePath);

  const appContext = await core.compileStrapi();
  const strapi = await core.createStrapi(appContext).load();

  try {
    const existingLetters = await strapi.db.query(LETTER_UID).findMany();
    if (existingLetters.length > 0 && process.env.FORCE_RESET !== 'true') {
      throw new Error(
        `[migrate] Target PostgreSQL already has ${existingLetters.length} letters. ` +
          'Set FORCE_RESET=true only if you want to clear target letter data first.'
      );
    }

    if (existingLetters.length > 0 && process.env.FORCE_RESET === 'true') {
      await strapi.db.query(CHANGE_UID).deleteMany({});
      await strapi.db.query(LETTER_UID).deleteMany({});
      // eslint-disable-next-line no-console
      console.log('[migrate] Existing letters/changes removed because FORCE_RESET=true');
    }

    const authenticatedRole = await strapi.db.query(ROLE_UID).findOne({
      where: { type: 'authenticated' },
    });
    if (!authenticatedRole) {
      throw new Error('[migrate] Authenticated role not found in target DB.');
    }

    const userIdMap = new Map();
    for (const srcUser of source.users) {
      const username = srcUser.username;
      if (!username) continue;

      const existing = await strapi.db.query(USER_UID).findOne({ where: { username } });
      if (existing) {
        userIdMap.set(srcUser.id, existing.id);
        continue;
      }

      const created = await strapi.db.query(USER_UID).create({
        data: {
          username,
          email: srcUser.email || `${username}@local`,
          provider: srcUser.provider || 'local',
          password: srcUser.password,
          confirmed: toBool(srcUser.confirmed, true),
          blocked: toBool(srcUser.blocked, false),
          role: authenticatedRole.id,
          display_name: toNull(srcUser.display_name),
        },
      });

      userIdMap.set(srcUser.id, created.id);
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] Users mapped: ${userIdMap.size}`);

    const createdLookups = {
      mkb: await ensureLookupRows(strapi, MKB_UID, 'code', source.mkbCodes, (row) => ({
        code: row.code,
        sort: row.sort ?? null,
      })),
      operations: await ensureLookupRows(strapi, OP_UID, 'code', source.operationCodes, (row) => ({
        code: row.code,
        sort: row.sort ?? null,
      })),
      organizations: await ensureLookupRows(strapi, ORG_UID, 'name', source.organizations, (row) => ({
        name: row.name,
        primary_email: toNull(row.primary_email),
        emails: parseJsonArray(row.emails),
        sort: row.sort ?? null,
      })),
      regions: await ensureLookupRows(strapi, REGION_UID, 'name', source.regions, (row) => ({
        name: row.name,
        sort: row.sort ?? null,
      })),
      helpTypes: await ensureLookupRows(strapi, HELP_UID, 'name', source.helpTypes, (row) => ({
        name: row.name,
        sort: row.sort ?? null,
      })),
      departments: await ensureLookupRows(
        strapi,
        DEPARTMENT_UID,
        'name',
        source.departments,
        (row) => ({
          name: row.name,
          sort: row.sort ?? null,
        })
      ),
    };
    // eslint-disable-next-line no-console
    console.log('[migrate] Lookups created:', createdLookups);

    const letterCreatedByMap = mapBy(
      source.letterCreatedBy,
      'journal_letter_id',
      'user_id'
    );
    const letterUpdatedByMap = mapBy(
      source.letterUpdatedBy,
      'journal_letter_id',
      'user_id'
    );
    const changeByUserMap = mapBy(
      source.changeByUser,
      'journal_letter_change_id',
      'user_id'
    );
    const changeLetterMap = mapBy(
      source.changeToLetter,
      'journal_letter_change_id',
      'journal_letter_id'
    );

    const letterIdMap = new Map();
    for (const srcLetter of source.letters) {
      const createdBySourceUser = letterCreatedByMap.get(srcLetter.id);
      const updatedBySourceUser = letterUpdatedByMap.get(srcLetter.id);

      const created = await strapi.db.query(LETTER_UID).create({
        data: {
          letter_number:
            toNull(srcLetter.letter_number) ||
            toNull(srcLetter.incoming_number) ||
            toNull(srcLetter.outgoing_number) ||
            `legacy-${srcLetter.id}`,
          incoming_number: toNull(srcLetter.incoming_number),
          outgoing_number: toNull(srcLetter.outgoing_number),
          fio: srcLetter.fio || 'Без ФИО',
          region: toNull(srcLetter.region),
          direction: toNull(srcLetter.direction) || 'incoming',
          arrival_date: toNull(srcLetter.arrival_date),
          send_date: toNull(srcLetter.send_date),
          transfer_from: toNull(srcLetter.transfer_from),
          transfer_to: toNull(srcLetter.transfer_to),
          transfer_org: toNull(srcLetter.transfer_org),
          transfer_email: toNull(srcLetter.transfer_email),
          mkb: toNull(srcLetter.mkb),
          mkb_other: toNull(srcLetter.mkb_other),
          operation_code: toNull(srcLetter.operation_code),
          operation_other: toNull(srcLetter.operation_other),
          department: toNull(srcLetter.department),
          department_other: toNull(srcLetter.department_other),
          incoming_content: toNull(srcLetter.incoming_content),
          outgoing_content: toNull(srcLetter.outgoing_content),
          subject: toNull(srcLetter.subject),
          content: toNull(srcLetter.content),
          help_type: toNull(srcLetter.help_type),
          created_by_user: userIdMap.get(createdBySourceUser) || null,
          updated_by_user: userIdMap.get(updatedBySourceUser) || null,
        },
      });

      letterIdMap.set(srcLetter.id, created.id);
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] Letters migrated: ${letterIdMap.size}`);

    let migratedChanges = 0;
    for (const srcChange of source.changes) {
      const srcLetterId = changeLetterMap.get(srcChange.id);
      const targetLetterId = letterIdMap.get(srcLetterId);
      if (!targetLetterId) continue;

      const srcUserId = changeByUserMap.get(srcChange.id);

      await strapi.db.query(CHANGE_UID).create({
        data: {
          field_name: srcChange.field_name || 'unknown',
          old_value: toNull(srcChange.old_value),
          new_value: toNull(srcChange.new_value),
          changed_at: toNull(srcChange.changed_at) || new Date().toISOString(),
          letter: targetLetterId,
          changed_by_user: userIdMap.get(srcUserId) || null,
        },
      });
      migratedChanges += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`[migrate] Changes migrated: ${migratedChanges}`);
    // eslint-disable-next-line no-console
    console.log('[migrate] Done.');
  } finally {
    await strapi.destroy();
  }
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
