/**
 * scratch/check_db.js
 *
 * Script de diagnóstico para verificar que las tablas críticas existen en
 * la base de datos PostgreSQL y tienen datos cargados.
 *
 * Uso:
 *   node scratch/check_db.js
 *
 * Notas:
 *   - Reemplaza las queries SQLite (sqlite_master + PRAGMA table_info) con
 *     sus equivalentes PostgreSQL (information_schema.tables + information_schema.columns).
 *   - Compatible con el módulo de DB (db.js) que usa pg bajo el hood.
 */
const db = require('../db');

async function check() {
  try {
    console.log('Checking database tables (PostgreSQL)...');

    // List all tables in the public schema
    const tableRows = await db.all(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type  = 'BASE TABLE'
       ORDER BY table_name`
    );
    console.log('Tables in database:', tableRows.map(t => t.name).join(', '));

    for (const tableName of ['metas_ventas', 'planificacion_semanal']) {
      const exists = tableRows.some(t => t.name === tableName);
      if (exists) {
        console.log(`\nSchema for ${tableName}:`);

        // PostgreSQL equivalent of PRAGMA table_info()
        const schema = await db.all(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name   = $1
           ORDER BY ordinal_position`,
          [tableName]
        );
        console.table(schema);

        const countResult = await db.get(`SELECT COUNT(*) AS count FROM ${tableName}`);
        console.log(`Number of records in ${tableName}:`, countResult.count);
      } else {
        console.log(`\nTable ${tableName} does NOT exist!`);
      }
    }
  } catch (err) {
    console.error('Error checking database:', err);
  } finally {
    // Allow the process to exit cleanly if the db driver keeps an open pool
    if (db.end) await db.end();
  }
}

check();
