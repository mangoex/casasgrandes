'use strict';

// TDD-TC-124 y TDD-TC-129 contra PostgreSQL aislado. No llama a migrate_pg.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePostgresUrl, withIsolatedSchema } = require('../support/isolatedPostgres');
const { testBotPepper } = require('../support/botPepper');

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
    await admin.query(`
      CREATE TABLE "${schema}".productos (
        id SERIAL PRIMARY KEY,
        producto TEXT NOT NULL,
        tipo_categoria TEXT,
        clave TEXT,
        activo INTEGER DEFAULT 1
      )
    `);
    await admin.query(`
      CREATE TABLE "${schema}".almacen_movimientos (
        id SERIAL PRIMARY KEY,
        fecha_movimiento TEXT NOT NULL,
        tipo_movimiento TEXT NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad_entrante REAL DEFAULT 0,
        cantidad_saliente REAL DEFAULT 0,
        existencias_resultantes REAL NOT NULL,
        lote TEXT,
        tamano TEXT,
        ciclo_agricola TEXT,
        notas TEXT,
        precio_venta REAL,
        referencia_factura TEXT
      )
    `);
    await admin.query(`
      CREATE TABLE "${schema}".cotizacion_reservas (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL,
        tamano TEXT,
        cantidad NUMERIC NOT NULL,
        estado TEXT NOT NULL
      )
    `);
    await admin.query(`
      INSERT INTO "${schema}".productos (id, producto, tipo_categoria, clave, activo)
      VALUES (7, 'Híbrido Demostración', 'Híbrido', 'HIB-DEMO', 1)
    `);
    await admin.query(`
      INSERT INTO "${schema}".almacen_movimientos
        (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente,
         existencias_resultantes, lote, tamano, ciclo_agricola, notas, precio_venta, referencia_factura)
      VALUES
        ('2026-11-03T15:00:00.000Z', 'Entrada', 7, 90, 0, 90, 'LOTE-DEMO-1', 'BT1', 'OI-DEMO', 'NOTA-SECRETA', 999, 'FAC-1'),
        ('2026-11-03T16:00:00.000Z', 'Entrada', 7, 50, 0, 140, NULL, NULL, 'OI-DEMO', NULL, 0, NULL)
    `);
    await admin.query(`
      INSERT INTO "${schema}".cotizacion_reservas (producto_id, tamano, cantidad, estado)
      VALUES (7, 'BT1', 30, 'ACTIVA'), (7, NULL, 10, 'ACTIVA')
    `);

    process.env.JWT_SECRET = 'test-only-chg027-postgres-secret-at-least-32';
    process.env.NODE_ENV = 'test';
    process.env.PGSSL = 'false';
    process.env.SKIP_INIT_SCHEMA = 'true';
    process.env.BOT_API_KEY_PEPPER = testBotPepper();
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

      const stock = await request(app)
        .get('/api/v1/bot/inventario/productos')
        .query({ q: 'Hibrido' })
        .set('X-Api-Key', created.body.clave);
      assert.equal(stock.status, 200, JSON.stringify(stock.body));
      assert.equal(stock.body.datos[0].disponible, 100);
      assert.equal(stock.body.datos[0].existencia_fisica, 140);
      assert.equal(stock.body.datos[0].categoria, 'Híbrido');

      const detail = await request(app)
        .get('/api/v1/bot/inventario/productos/7')
        .set('X-Api-Key', created.body.clave);
      assert.equal(detail.status, 200, JSON.stringify(detail.body));
      assert.equal(detail.body.vista, 'almacen');
      assert.equal(detail.body.lotes[0].existencia_fisica, 90);
      assert.equal(detail.body.tamanos[0].disponible, 60);
      assert.equal(JSON.stringify(detail.body).includes('NOTA-SECRETA'), false);

      const moves = await request(app)
        .get('/api/v1/bot/inventario/movimientos')
        .set('X-Api-Key', created.body.clave);
      assert.equal(moves.status, 200, JSON.stringify(moves.body));
      assert.equal(moves.body.datos[0].existencias_resultantes, 140);
      assert.equal(JSON.stringify(moves.body).includes('NOTA-SECRETA'), false);
      assert.equal(JSON.stringify(moves.body).includes('999'), false);
      assert.equal(JSON.stringify(moves.body).includes('FAC-1'), false);

      const audited = await admin.query(`
        SELECT ruta_plantilla, codigo_http, request_id
        FROM "${schema}".bot_llamadas
        WHERE clave_id = $1
        ORDER BY id DESC
        LIMIT 1
      `, [created.body.id]);
      assert.equal(audited.rows[0].ruta_plantilla, '/api/v1/bot/inventario/movimientos');
      assert.equal(Number(audited.rows[0].codigo_http), 200);
    } finally {
      await db.close();
    }
  });
});
