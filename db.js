const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const connectionString = process.env.DATABASE_URL;

// SSL is usually required in production, but not for localhost
const isLocal = !connectionString || connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'casas_grandes',
      ssl: (process.env.PGHOST === 'localhost' || !process.env.PGHOST) ? false : { rejectUnauthorized: false }
    });

pool.on('connect', () => {
  console.log('Successfully connected to PostgreSQL pool.');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Helper function to translate SQLite query syntax to PostgreSQL
function rewriteQuery(sql) {
  let index = 1;
  let rewritten = sql.replace(/\?/g, () => `$${index++}`);
  
  // Auto-append RETURNING id for standard insert queries so they return the generated primary key
  if (/^\s*insert\s+into/i.test(rewritten) && !/returning/i.test(rewritten)) {
    rewritten = rewritten.trim().replace(/;+$/, '').trim();
    rewritten += ' RETURNING id';
  }
  
  return rewritten;
}

module.exports = {
  get: async (sql, params = []) => {
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      return result.rows[0]; // Returns the single row or undefined if none found
    } catch (err) {
      console.error(`PostgreSQL query error (get) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  all: async (sql, params = []) => {
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      return result.rows; // Returns array of rows
    } catch (err) {
      console.error(`PostgreSQL query error (all) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  run: async (sql, params = []) => {
    const rewritten = rewriteQuery(sql);
    try {
      const result = await pool.query(rewritten, params);
      const id = result.rows[0]?.id || null;
      return { id, changes: result.rowCount }; // Returns object matching SQLite's interface
    } catch (err) {
      console.error(`PostgreSQL query error (run) for: "${sql}"`, err.message);
      throw err;
    }
  },
  
  pool // Expose raw pool in case direct operations are needed
};
