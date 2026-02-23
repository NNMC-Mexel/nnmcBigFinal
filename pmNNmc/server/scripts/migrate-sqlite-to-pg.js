/**
 * Migrate pmNNmc data from SQLite → PostgreSQL
 * Run: node scripts/migrate-sqlite-to-pg.js
 */

const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');

const SQLITE_PATH = path.join(__dirname, '..', '.tmp', 'data.db');

const PG_CONFIG = {
  host: '127.0.0.1',
  port: 2101,
  database: 'nnmc_board',
  user: 'postgres',        // superuser needed for session_replication_role
  password: 'Naimansuan123!',
};

// Tables to skip (they are recreated fresh by Strapi on startup)
const SKIP_TABLES = new Set([
  'strapi_migrations',
  'strapi_migrations_internal',
  'sqlite_sequence',
]);

// Tables that should be migrated in order (parent before child)
const TABLE_ORDER = [
  // Strapi core
  'strapi_core_store_settings',
  'strapi_webhooks',
  'strapi_history_versions',
  // Admin
  'admin_roles',
  'admin_users',
  'admin_users_roles_lnk',
  'admin_permissions',
  'admin_permissions_role_lnk',
  // Users & permissions
  'up_roles',
  'up_users',
  'up_users_role_lnk',
  'up_permissions',
  'up_permissions_role_lnk',
  // Custom content types
  'departments',
  'board_stages',
  'projects',
  'projects_department_lnk',
  'projects_owner_lnk',
  'projects_supporting_specialists_lnk',
  'projects_responsible_users_lnk',
  'projects_manual_stage_override_lnk',
  'tasks',
  'tasks_project_lnk',
  'tasks_assigned_users_lnk',
  'meeting_notes',
  'meeting_notes_project_lnk',
  'project_documents',
  'project_documents_project_lnk',
  'project_surveys',
  'project_surveys_project_lnk',
  'survey_responses',
  'survey_responses_survey_lnk',
  'service_groups',
  'ticket_categories',
  'ticket_categories_service_group_lnk',
  'tickets',
  'tickets_category_lnk',
  'tickets_service_group_lnk',
  'tickets_assignee_lnk',
  'activity_logs',
  'analytics',
  'admin_users_lnk',
  'news_posts',
  'news_posts_author_lnk',
  // Upload
  'files',
  'files_folder_lnk',
  'files_related_morphs',
  'upload_folders',
  'upload_folders_parent_lnk',
  // I18n
  'i18n_locale',
  // Strapi transfer
  'strapi_transfer_tokens',
  'strapi_transfer_token_permissions',
  'strapi_api_tokens',
  'strapi_api_token_permissions',
  'strapi_release_actions',
  'strapi_releases',
  'strapi_releases_actions_lnk',
];

// Timestamp column names in Strapi
const TIMESTAMP_COLS = new Set([
  'created_at', 'updated_at', 'published_at', 'deleted_at',
  'expires_at', 'last_used_at', 'last_login_at',
  'reset_password_token_sent_at', 'confirmation_token_sent_at',
  'created_by_id', // NOT a timestamp, but check others
]);

const TIMESTAMP_SUFFIXES = ['_at'];

function isTimestampCol(colName) {
  const lower = colName.toLowerCase();
  return TIMESTAMP_SUFFIXES.some((s) => lower.endsWith(s));
}

function convertValue(val, colName) {
  if (val === null || val === undefined) return null;

  // Convert millisecond timestamps to ISO strings for PostgreSQL
  if (isTimestampCol(colName) && typeof val === 'number' && val > 1_000_000_000_000) {
    // Milliseconds Unix timestamp → ISO 8601
    return new Date(val).toISOString();
  }

  return val;
}

async function main() {
  console.log('🔄 Starting SQLite → PostgreSQL migration\n');

  // Open SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  console.log(`✅ Opened SQLite: ${SQLITE_PATH}`);

  // Get all table names from SQLite
  const sqliteTables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  console.log(`📋 Tables in SQLite (${sqliteTables.length}):`, sqliteTables.join(', '), '\n');

  // Connect to PostgreSQL
  const pg = new Client(PG_CONFIG);
  await pg.connect();
  console.log('✅ Connected to PostgreSQL nnmc_board\n');

  // Disable FK checks during migration
  await pg.query('SET session_replication_role = replica');

  // Determine migration order: use TABLE_ORDER first, then any remaining
  const orderedTables = [
    ...TABLE_ORDER.filter((t) => sqliteTables.includes(t)),
    ...sqliteTables.filter((t) => !TABLE_ORDER.includes(t) && !SKIP_TABLES.has(t)),
  ];

  let totalMigrated = 0;
  let totalErrors = 0;

  for (const table of orderedTables) {
    if (SKIP_TABLES.has(table)) continue;

    // Check if table exists in PG
    const pgTableCheck = await pg.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
      [table]
    );
    if (!pgTableCheck.rows[0].exists) {
      console.log(`⏭️  Skipping ${table} (not in PostgreSQL)`);
      continue;
    }

    // Read all rows from SQLite
    let rows;
    try {
      rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    } catch (e) {
      console.log(`❌ Cannot read ${table} from SQLite: ${e.message}`);
      totalErrors++;
      continue;
    }

    if (rows.length === 0) {
      console.log(`⬜ ${table}: empty, skipping`);
      continue;
    }

    // Get columns from first row
    const columns = Object.keys(rows[0]);

    // Clear existing data in PG table (Strapi may have inserted defaults)
    try {
      await pg.query(`DELETE FROM "${table}"`);
    } catch (e) {
      // ignore
    }

    // Insert rows in batches
    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const values = columns.map((c) => convertValue(row[c], c));
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const colList = columns.map((c) => `"${c}"`).join(', ');

      try {
        await pg.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 3) {
          console.log(`  ⚠️  Row insert error in ${table}: ${e.message.substring(0, 120)}`);
        }
      }
    }

    console.log(
      `✅ ${table}: ${inserted}/${rows.length} rows migrated${errors > 0 ? ` (${errors} errors)` : ''}`
    );
    totalMigrated += inserted;
    totalErrors += errors;
  }

  // Reset PostgreSQL sequences so auto-increment works correctly
  console.log('\n🔄 Resetting PostgreSQL sequences...');
  const seqResult = await pg.query(`
    SELECT
      t.table_name,
      c.column_name,
      pg_get_serial_sequence('"' || t.table_name || '"', c.column_name) as seq
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_default LIKE 'nextval%'
  `);

  for (const row of seqResult.rows) {
    if (!row.seq) continue;
    try {
      await pg.query(
        `SELECT setval('${row.seq}', COALESCE((SELECT MAX("${row.column_name}") FROM "${row.table_name}"), 1))`
      );
    } catch (e) {
      // ignore sequence errors
    }
  }
  console.log(`✅ Sequences reset (${seqResult.rows.length} sequences)`);

  // Re-enable FK checks
  await pg.query('SET session_replication_role = DEFAULT');

  await pg.end();
  sqlite.close();

  console.log(`\n🎉 Migration complete!`);
  console.log(`   Total rows migrated: ${totalMigrated}`);
  console.log(`   Total errors: ${totalErrors}`);
  console.log(`\n👉 Now restart Strapi and verify at http://localhost:12005/admin`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
