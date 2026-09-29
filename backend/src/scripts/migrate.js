/**
 * backend/src/scripts/migrate.js
 *
 * Lightweight, zero-dependency SQL migration runner for VahanGrid.
 * Uses node-postgres (pg) directly to execute numbered SQL files in database/migrations/.
 *
 * Tracks executed migrations in the 'schema_migrations' table to prevent double-execution.
 *
 * Usage:
 *   node src/scripts/migrate.js
 *   node src/scripts/migrate.js postgresql://postgres:password@localhost:5432/vahangrid
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import config from '../config/env.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow passing custom connection URL or fallback to config
const connectionString = process.argv[2] || config.database.url;

if (!connectionString) {
  console.error('❌ [migrate] Error: No DATABASE_URL provided in .env or arguments.');
  process.exit(1);
}

// Directory where migration SQL files live
const migrationsDir = path.resolve(__dirname, '../../database/migrations');

async function runMigrations() {
  const client = new Client({ connectionString });
  
  // Extract database name safely for logging without leaking credentials
  const dbNameMatch = connectionString.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : 'database';

  console.log(`\n🚀 [migrate] Connecting to '${dbName}'...`);
  await client.connect();

  try {
    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Fetch list of previously executed migrations
    const executedRes = await client.query('SELECT name FROM schema_migrations ORDER BY id ASC;');
    const executedSet = new Set(executedRes.rows.map(r => r.name));

    // 3. Read and sort all .sql files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pendingFiles = files.filter(f => !executedSet.has(f));

    if (pendingFiles.length === 0) {
      console.log(`✅ [migrate] All migrations are already up to date (${files.length} applied).\n`);
      return;
    }

    console.log(`📋 [migrate] Found ${pendingFiles.length} pending migration(s) out of ${files.length} total:\n`);

    // 4. Execute each pending migration in a transaction
    for (const file of pendingFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      const start = Date.now();
      console.log(`   ⏳ Applying: ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1);', [file]);
        await client.query('COMMIT');
        const duration = Date.now() - start;
        console.log(`   ✅ Applied:  ${file} (${duration}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n❌ [migrate] Migration failed in ${file}:`);
        console.error(`   ${err.message}`);
        throw err;
      }
    }

    console.log(`\n🎉 [migrate] Successfully applied all ${pendingFiles.length} migration(s)!\n`);
  } finally {
    await client.end();
  }
}

runMigrations().catch(err => {
  console.error('[migrate] Aborting process due to error.\n');
  process.exit(1);
});
