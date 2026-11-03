'use strict';

const { Pool } = require('pg');

function resolvePostgresUrl() {
  return String(process.env.TEST_POSTGRES_URL || process.env.CHG025_TEST_POSTGRES_URL || '').trim();
}

function assertSafeTestDatabase(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('La URL de PostgreSQL de prueba no es válida.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
  if (!allowedHosts.has(host)) {
    throw new Error(`Host de base de prueba no permitido (${host}). Usa localhost o el servicio postgres de CI.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/(test|ci|local)/i.test(database)) {
    throw new Error(`La base "${database}" no parece aislada. El nombre debe incluir test, ci o local.`);
  }
  return url;
}

function poolOptions(connectionString) {
  const local = /localhost|127\.0\.0\.1|sslmode=disable/.test(connectionString);
  return {
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false }
  };
}

function scopedConnectionString(baseUrl, schema) {
  const url = assertSafeTestDatabase(baseUrl);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  url.searchParams.set('application_name', 'chg026-harness');
  return url.toString();
}

async function withIsolatedSchema(run) {
  const baseUrl = resolvePostgresUrl();
  if (!baseUrl) {
    return { skipped: true, reason: 'Define TEST_POSTGRES_URL con un PostgreSQL 16 aislado.' };
  }
  assertSafeTestDatabase(baseUrl);
  const schema = `chg026_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  if (!/^[a-z0-9_]+$/.test(schema)) {
    throw new Error('Nombre de esquema inseguro.');
  }
  const admin = new Pool(poolOptions(baseUrl));
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    try {
      return await run({
        schema,
        admin,
        connectionString: scopedConnectionString(baseUrl, schema)
      });
    } finally {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  } finally {
    await admin.end();
  }
}

module.exports = {
  resolvePostgresUrl,
  assertSafeTestDatabase,
  withIsolatedSchema
};
