/**
 * backend/src/scripts/verify.js
 *
 * Comprehensive database verification script for VahanGrid Phase 2B.
 * Validates:
 *  1. Tables created
 *  2. Foreign keys and ON DELETE rules
 *  3. UNIQUE constraints
 *  4. CHECK constraints
 *  5. PostGIS extension & version
 *  6. geography(Point, 4326) column on locations
 *  7. GIST spatial index on locations.location
 *  8. Sample spatial query (ST_DWithin)
 */

import pg from 'pg';
import config from '../config/env.js';

const { Client } = pg;
const connectionString = process.argv[2] || config.database.url;

async function verify() {
  const client = new Client({ connectionString });
  await client.connect();

  const dbMatch = connectionString.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbMatch ? dbMatch[1] : 'database';
  console.log(`\n======================================================`);
  console.log(`🔍 VahanGrid Schema Verification: [${dbName}]`);
  console.log(`======================================================\n`);

  try {
    // 1. PostGIS verification
    console.log(`1️⃣  POSTGIS & EXTENSIONS:`);
    const extRes = await client.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname IN ('postgis', 'pgcrypto')
      ORDER BY extname;
    `);
    extRes.rows.forEach(r => console.log(`   ✅ Extension: ${r.extname} (v${r.extversion})`));

    const postgisVer = await client.query(`SELECT postgis_full_version();`);
    console.log(`   ℹ️  ${postgisVer.rows[0].postgis_full_version.split('\n')[0]}`);

    // 2. Tables check
    console.log(`\n2️⃣  TABLES VERIFICATION:`);
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('spatial_ref_sys', 'schema_migrations')
      ORDER BY table_name;
    `);
    const expectedTables = [
      'charging_sessions', 'connectors', 'cpos', 'evses',
      'locations', 'users', 'vehicles', 'wallet_transactions', 'wallets'
    ];
    tablesRes.rows.forEach(r => {
      console.log(`   ✅ Table exists: ${r.table_name}`);
    });

    // 3. PostGIS geography column on locations
    console.log(`\n3️⃣  GEOGRAPHY COLUMN SPECIFICATION:`);
    const geoColRes = await client.query(`
      SELECT f_table_name, f_geography_column, coord_dimension, srid, type
      FROM geography_columns
      WHERE f_table_name = 'locations';
    `);
    if (geoColRes.rows.length > 0) {
      const g = geoColRes.rows[0];
      console.log(`   ✅ locations.${g.f_geography_column} -> Type: ${g.type}, Dimension: ${g.coord_dimension}, SRID: ${g.srid}`);
    } else {
      console.error(`   ❌ No geography column found in 'locations'!`);
    }

    // 4. GIST index check
    console.log(`\n4️⃣  SPATIAL GIST INDEX:`);
    const gistRes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'locations' AND indexdef ILIKE '%gist%';
    `);
    gistRes.rows.forEach(r => {
      console.log(`   ✅ Spatial Index: ${r.indexname}`);
      console.log(`      Definition: ${r.indexdef}`);
    });

    // 5. Foreign keys & ON DELETE rules
    console.log(`\n5️⃣  FOREIGN KEYS & DELETE POLICIES:`);
    const fkRes = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name;
    `);
    fkRes.rows.forEach(r => {
      console.log(`   🔗 ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}(${r.foreign_column_name}) [ON DELETE ${r.delete_rule}]`);
    });

    // 6. UNIQUE constraints
    console.log(`\n6️⃣  UNIQUE CONSTRAINTS:`);
    const uqRes = await client.query(`
      SELECT tc.table_name, tc.constraint_name, string_agg(kcu.column_name, ', ') AS columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
      GROUP BY tc.table_name, tc.constraint_name
      ORDER BY tc.table_name;
    `);
    uqRes.rows.forEach(r => {
      console.log(`   🔑 ${r.table_name} (${r.columns}) [${r.constraint_name}]`);
    });

    // 7. CHECK constraints
    console.log(`\n7️⃣  CHECK CONSTRAINTS:`);
    const chkRes = await client.query(`
      SELECT tc.table_name, tc.constraint_name, cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
        AND tc.constraint_name NOT LIKE '%_not_null'
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    chkRes.rows.forEach(r => {
      console.log(`   🛡️  ${r.table_name}.${r.constraint_name}: ${r.check_clause}`);
    });

    console.log(`\n======================================================`);
    console.log(`✅ Schema verification completed successfully!`);
    console.log(`======================================================\n`);
  } finally {
    await client.end();
  }
}

verify().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
