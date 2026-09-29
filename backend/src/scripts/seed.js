/**
 * backend/src/scripts/seed.js
 *
 * Seed data runner for VahanGrid Phase 2B.
 * Populates realistic development seed data into the database from database/seeds/.
 *
 * Usage:
 *   node src/scripts/seed.js
 *   node src/scripts/seed.js postgresql://postgres:password@localhost:5432/vahangrid
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import config from '../config/env.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.argv[2] || config.database.url;

if (!connectionString) {
  console.error('❌ [seed] Error: No DATABASE_URL provided in .env or arguments.');
  process.exit(1);
}

const seedsDir = path.resolve(__dirname, '../../database/seeds');

async function runSeeds() {
  const client = new Client({ connectionString });
  
  const dbNameMatch = connectionString.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : 'database';

  console.log(`\n🌱 [seed] Connecting to '${dbName}' to run seed data...`);
  await client.connect();

  try {
    const files = fs.readdirSync(seedsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('⚠️  [seed] No .sql seed files found in database/seeds/.');
      return;
    }

    for (const file of files) {
      const filePath = path.join(seedsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`   ⏳ Executing: ${file}...`);
      const start = Date.now();
      await client.query(sql);
      const duration = Date.now() - start;
      console.log(`   ✅ Seeded:    ${file} (${duration}ms)`);
    }

    // Print summary counts of seeded entities
    console.log(`\n📊 [seed] Database Record Counts in [${dbName}]:`);
    const tables = [
      'cpos', 'users', 'vehicles', 'locations', 'evses',
      'connectors', 'wallets', 'wallet_transactions', 'charging_sessions'
    ];

    for (const table of tables) {
      const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table};`);
      console.log(`   • ${table.padEnd(22)} : ${res.rows[0].count} records`);
    }

    // Spatial test query: Find chargers within 50 km of Connaught Place, New Delhi (28.6315, 77.2167)
    console.log(`\n📍 [seed] Spatial Test: Finding locations within 50 km of Connaught Place (New Delhi):`);
    const spatialTest = await client.query(`
      SELECT 
        l.name,
        c.short_code AS cpo,
        l.city,
        ROUND((ST_Distance(l.location, ST_SetSRID(ST_MakePoint(77.2167, 28.6315), 4326)::geography) / 1000.0)::numeric, 1) AS distance_km
      FROM locations l
      JOIN cpos c ON l.cpo_id = c.id
      WHERE ST_DWithin(l.location, ST_SetSRID(ST_MakePoint(77.2167, 28.6315), 4326)::geography, 50000)
      ORDER BY distance_km ASC;
    `);

    spatialTest.rows.forEach(r => {
      console.log(`   ⚡ ${r.name} (${r.cpo}, ${r.city}) — ${r.distance_km} km away`);
    });

    console.log(`\n🎉 [seed] Database seeding completed successfully!\n`);
  } finally {
    await client.end();
  }
}

runSeeds().catch(err => {
  console.error('\n❌ [seed] Seeding failed:', err.message);
  process.exit(1);
});
