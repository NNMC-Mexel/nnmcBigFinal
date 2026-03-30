/**
 * One-time migration script: updates file URLs in DB from old /uploads/... format
 * to full MinIO URLs (for files physically migrated to MinIO).
 *
 * Usage (from server/ directory):
 *   node scripts/migrate-urls-to-minio.js
 *
 * Or dry-run (no changes, only shows what would be updated):
 *   DRY_RUN=true node scripts/migrate-urls-to-minio.js
 */

require("dotenv").config({ path: ".env" });
const { Client } = require("pg");

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT; // e.g. https://minio.example.com
const MINIO_BUCKET = process.env.MINIO_BUCKET;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!MINIO_ENDPOINT || !MINIO_BUCKET) {
    console.error(
        "ERROR: MINIO_ENDPOINT and MINIO_BUCKET must be set in .env"
    );
    process.exit(1);
}

// Strip trailing slash from endpoint
const endpoint = MINIO_ENDPOINT.replace(/\/$/, "");

async function migrate() {
    const client = new Client({
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432"),
        database: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    await client.connect();
    console.log("Connected to database\n");

    try {
        // Find the correct table name for uploads
        const tablesResult = await client.query(`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name ILIKE '%file%'
            ORDER BY table_name
        `);
        console.log("Tables with 'file' in name:", tablesResult.rows.map(r => r.table_name).join(", "));

        // Try possible table names used by Strapi v4/v5
        const candidates = ["upload_files", "files", "strapi_files", "up_files"];
        let tableName = null;
        for (const t of candidates) {
            const exists = await client.query(
                `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)`,
                [t]
            );
            if (exists.rows[0].exists) {
                tableName = t;
                break;
            }
        }

        if (!tableName) {
            console.error("Could not find upload files table. Available tables with 'file':", tablesResult.rows.map(r => r.table_name));
            return;
        }

        console.log(`Using table: ${tableName}\n`);

        // Find all files with old relative URLs
        const { rows } = await client.query(
            `SELECT id, hash, ext, url, name FROM ${tableName} WHERE url LIKE '/uploads/%'`
        );

        console.log(`Found ${rows.length} file(s) with old /uploads/ URLs`);

        if (rows.length === 0) {
            console.log("Nothing to migrate.");
            return;
        }

        console.log(`\nMode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}\n`);

        let updated = 0;
        for (const file of rows) {
            // Strapi S3 provider stores files as: /{hash}{ext}
            const newUrl = `${endpoint}/${MINIO_BUCKET}/${file.hash}${file.ext}`;
            console.log(`  [${file.id}] ${file.name}`);
            console.log(`    OLD: ${file.url}`);
            console.log(`    NEW: ${newUrl}`);

            if (!DRY_RUN) {
                await client.query(
                    `UPDATE ${tableName} SET url = $1 WHERE id = $2`,
                    [newUrl, file.id]
                );
                updated++;
            }
        }

        console.log(
            DRY_RUN
                ? `\nDry run complete. ${rows.length} file(s) would be updated.`
                : `\nMigration complete. ${updated} file(s) updated.`
        );
    } finally {
        await client.end();
    }
}

migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
});
