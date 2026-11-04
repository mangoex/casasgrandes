'use strict';

// TDD-TC-124 y TDD-TC-129 contra PostgreSQL aislado. No llama a migrate_pg.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePostgresUrl, withIsolatedSchema } = require('../support/isolatedPostgres');

const postgresUrl = resolvePostgresUrl();

test('TDD-TC-124: la migración de bots es idempotente y la base guarda el hash', {
  skip: postgresUrl ? false : 'Requiere TEST_POSTGRES_URL o CHG025_TEST_POSTGRES_URL apuntando a PostgreSQL aislado.'
}, async () => {
  await withIsolatedSchema(async ({ admin, schema, connectionString }) => {
    await admin.query(`
      CREATE TABLE "${schema}".asesores (
        id SERIAL PRIMARY KEY,
        nombre TEXT,
        usuario TEXT,
        nivel_rol TEXT,
        email TEXT,
        telefono TEXT,
        activo INTEGER DEFAULT 1,
        session_version INTEGER NOT NULL DEFAULT 1
      )
    `);
    await admin.query(`
      INSERT INTO "${schema}".asesores (nombre, usuario, nivel_rol, email, activo, session_version)
      VALUES ('Admin Ficticio', 'admin.ficticio', 'Administrador', 'admin.ficticio@example.test', 1, 1)
    `);

    process.env.JWT_SECRET = 'test-only-chg027-postgres-secret-at-least-32';
    process.env.NODE_ENV = 'test';
    process.env.PGSSL = 'false';
    process.env.SKIP_INIT_SCHEMA = 'true';
    process.env.BOT_API_KEY_PEPPER = 'pimienta-de-prueba-chg027';
    process.env.DATABASE_URL = connectionString;

    const db = require('../../db');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const { app } = require('../../server');
    try {
      await db.ensureBotSchema();
      await db.ensureBotSchema();
      const version = await admin.query(`
        SELECT version FROM "${schema}".schema_migrations WHERE version = '027_bot_api'
      `);
      assert.equal(version.rows.length, 1);

      const token = jwt.sign(
        { id: 1, nivel_rol: 'Administrador', session_version: 1 },
        process.env.JWT_SECRET
      );
      const created = await request(app)
        .post('/api/admin/bot/claves')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Request-ID', 'pg-chg027')
        .send({
          nombre: 'Bot inventario demostración',
          alcances: ['inventario:leer'],
          limite_por_minuto: 60,
          asesor_id: null,
          rol_visibilidad: 'Almacen'
        });
      assert.equal(created.status, 201, JSON.stringify(created.body));

      const stored = await admin.query(`
        SELECT prefijo, hash, alcances FROM "${schema}".bot_claves WHERE id = $1
      `, [created.body.id]);
      assert.equal(stored.rows[0].prefijo, created.body.prefijo);
      assert.notEqual(stored.rows[0].hash, created.body.clave);
      assert.equal(stored.rows[0].hash.includes(created.body.clave), false);

      const columns = await admin.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'bot_llamadas'
      `, [schema]);
      const names = columns.rows.map(row => row.column_name);
      for (const forbidden of ['clave', 'cuerpo', 'ip', 'consulta', 'cliente']) {
        assert.equal(names.includes(forbidden), false, forbidden);
      }
    } finally {
      await db.close();
    }
  });
});
