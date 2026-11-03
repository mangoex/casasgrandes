'use strict';

// TDD-TC-123 — BDD-SC-104 contra PostgreSQL aislado. No llama a migrate_pg.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePostgresUrl, withIsolatedSchema } = require('../support/isolatedPostgres');
const { applyReservationFixture, FAKE_WAREHOUSE } = require('../support/fakeReservationSeed');

const postgresUrl = resolvePostgresUrl();

test('TDD-TC-123: una reserva 60/40 no mueve la existencia física y solo usa datos ficticios', {
  skip: postgresUrl ? false : 'Requiere TEST_POSTGRES_URL o CHG025_TEST_POSTGRES_URL apuntando a PostgreSQL aislado.'
}, async () => {
  await withIsolatedSchema(async ({ schema, admin, connectionString }) => {
    const client = await admin.connect();
    try {
      await client.query(`SET search_path TO "${schema}"`);
      await applyReservationFixture(client);
    } finally {
      client.release();
    }

    process.env.JWT_SECRET = 'test-only-chg026-postgres-secret-at-least-32-chars';
    process.env.NODE_ENV = 'test';
    process.env.PGSSL = 'false';
    process.env.SKIP_INIT_SCHEMA = 'true';
    process.env.DATABASE_URL = connectionString;

    const db = require('../../db');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const { app } = require('../../server');
    try {
      const token = jwt.sign(
        { id: FAKE_WAREHOUSE.id, nivel_rol: FAKE_WAREHOUSE.nivelRol, session_version: 1 },
        process.env.JWT_SECRET
      );
      const response = await request(app)
        .post('/api/almacen/solicitudes/101/asignaciones')
        .set('Authorization', `Bearer ${token}`)
        .send({
          detalles: [{
            cotizacion_detalle_id: 201,
            asignaciones: [
              { producto_id: 7, tamano: 'BT1', cantidad: 60 },
              { producto_id: 7, tamano: 'BT2', cantidad: 40 }
            ]
          }]
        });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.success, true);

      const reservations = await admin.query(`
        SELECT tamano, cantidad::float8 AS cantidad, estado
        FROM "${schema}".cotizacion_reservas
        ORDER BY tamano
      `);
      assert.deepEqual(reservations.rows, [
        { tamano: 'BT1', cantidad: 60, estado: 'ACTIVA' },
        { tamano: 'BT2', cantidad: 40, estado: 'ACTIVA' }
      ]);

      const physical = await admin.query(`
        SELECT COALESCE(SUM(cantidad_entrante - cantidad_saliente), 0)::float8 AS cantidad
        FROM "${schema}".almacen_movimientos
      `);
      assert.equal(physical.rows[0].cantidad, 140);

      const emails = await admin.query(`SELECT email FROM "${schema}".asesores`);
      assert.ok(emails.rows.length > 0);
      for (const row of emails.rows) {
        assert.match(row.email, /@example\.test$/);
      }

      const quote = await admin.query(`
        SELECT almacen_estado FROM "${schema}".cotizaciones WHERE id = 101
      `);
      assert.equal(quote.rows[0].almacen_estado, 'RESERVADA');
    } finally {
      await db.close();
    }
  });
});
