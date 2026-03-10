'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const core = require('@strapi/core');

const JOURNAL_LETTER_UID = 'api::journal-letter.journal-letter';
const JOURNAL_CHANGE_UID = 'api::journal-letter-change.journal-letter-change';
const USER_UID = 'plugin::users-permissions.user';

const legacyDbPath = path.join(__dirname, '..', '..', 'backend', 'database.db');

const readLegacy = () => {
  const db = new Database(legacyDbPath, { readonly: true });
  const users = db.prepare('SELECT * FROM journal_users').all();
  const letters = db.prepare('SELECT * FROM journal_letters').all();
  const changes = db.prepare('SELECT * FROM journal_letter_changes').all();
  db.close();
  return { users, letters, changes };
};

const run = async () => {
  const appContext = await core.compileStrapi();
  const strapi = await core.createStrapi(appContext).load();

  try {
    const legacy = readLegacy();

    const role = await strapi.db.query('plugin::users-permissions.role').findOne({
      where: { type: 'authenticated' }
    });

    const roleId = role ? role.id : null;

    const userIdMap = new Map();

    for (const u of legacy.users) {
      const existing = await strapi.db.query(USER_UID).findOne({
        where: { username: u.login }
      });

      if (existing) {
        userIdMap.set(u.id, existing.id);
        continue;
      }

      const created = await strapi.db.query(USER_UID).create({
        data: {
          username: u.login,
          email: `${u.login}@local`,
          provider: 'local',
          password: u.password_hash,
          confirmed: true,
          blocked: u.is_active ? false : true,
          role: roleId,
          display_name: u.display_name || null
        }
      });

      userIdMap.set(u.id, created.id);
    }

    const letterIdMap = new Map();

    for (const l of legacy.letters) {
      const created = await strapi.db.query(JOURNAL_LETTER_UID).create({
        data: {
          letter_number: l.letter_number,
          incoming_number: l.incoming_number,
          outgoing_number: l.outgoing_number,
          fio: l.fio,
          region: l.region,
          direction: l.direction || 'incoming',
          arrival_date: l.arrival_date,
          send_date: l.send_date,
          transfer_from: l.transfer_from,
          transfer_to: l.transfer_to,
          transfer_org: l.transfer_org,
          transfer_email: l.transfer_email,
          mkb: l.mkb,
          mkb_other: l.mkb_other,
          operation_code: l.operation_code,
          operation_other: l.operation_other,
          department: l.department,
          department_other: l.department_other,
          incoming_content: l.incoming_content,
          outgoing_content: l.outgoing_content,
          subject: l.subject,
          content: l.content,
          help_type: l.help_type,
          created_by_user: userIdMap.get(l.created_by_user_id) || null,
          updated_by_user: userIdMap.get(l.updated_by_user_id) || null
        }
      });

      letterIdMap.set(l.id, created.id);
    }

    for (const c of legacy.changes) {
      const newLetterId = letterIdMap.get(c.letter_id);
      if (!newLetterId) continue;

      await strapi.db.query(JOURNAL_CHANGE_UID).create({
        data: {
          letter: newLetterId,
          changed_by_user: userIdMap.get(c.changed_by_user_id) || null,
          field_name: c.field_name,
          old_value: c.old_value,
          new_value: c.new_value,
          changed_at: c.changed_at
        }
      });
    }

    strapi.log.info('Legacy migration completed');
  } finally {
    await strapi.destroy();
  }
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
