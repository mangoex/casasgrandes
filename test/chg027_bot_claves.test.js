'use strict';

// TDD-TC-124 — hash, alta y revocación. Rojo esperado: la ruta responde 404.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { testBotPepper } = require('./support/botPepper');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-chg027-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.SKIP_INIT_SCHEMA = 'true';
process.env.PGSSL = 'false';
process.env.BOT_API_KEY_PEPPER = testBotPepper();

const crypto = require('node:crypto');
const { app } = require('../server');
const { installBotFixture } = require('./support/botFixture');

function hashEsperado(clave) {
  return crypto.createHash('sha256').update(process.env.BOT_API_KEY_PEPPER).update(clave).digest('hex');
}

const ADMIN = {
  id: 4,
  nombre: 'Admin Ficticio',
  usuario: 'admin.ficticio',
  nivel_rol: 'Administrador',
  email: 'admin.ficticio@example.test',
  telefono: null,
  activo: 1,
  session_version: 1
};

function adminToken() {
  return jwt.sign(
    { id: ADMIN.id, nivel_rol: ADMIN.nivel_rol, session_version: ADMIN.session_version },
    process.env.JWT_SECRET
  );
}

function nuevaClave(extra = {}) {
  return {
    nombre: 'Bot inventario demostración',
    alcances: ['inventario:leer'],
    limite_por_minuto: 60,
    asesor_id: null,
    rol_visibilidad: 'Almacen',
    ...extra
  };
}

test('TDD-TC-124: el alta guarda hash, el listado no trae el secreto y la revocación conserva la fecha', async t => {
  const fixture = installBotFixture({ sessionUser: ADMIN });
  t.after(() => fixture.restore());

  const created = await request(app)
    .post('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send(nuevaClave());
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(typeof created.body.clave, 'string');
  assert.equal(created.body.clave.includes(created.body.prefijo), true);
  assert.equal(created.body.activa, true);
  assert.equal(created.body.revocada_en, null);

  const stored = fixture.state.keys[0];
  assert.equal(stored.hash === created.body.clave, false);
  assert.equal(stored.hash, hashEsperado(created.body.clave));
  assert.equal(JSON.stringify(stored).includes(created.body.clave), false);

  const listed = await request(app)
    .get('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${adminToken()}`);
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.equal(JSON.stringify(listed.body).includes(created.body.clave), false);
  assert.equal(JSON.stringify(listed.body).includes(stored.hash), false);
  assert.equal(fixture.state.sqlLog.some(sql => sql.includes('bot:claves-lista') && sql.includes('hash')), false);

  const first = await request(app)
    .post(`/api/admin/bot/claves/${created.body.id}/revocacion`)
    .set('Authorization', `Bearer ${adminToken()}`);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.activa, false);
  const again = await request(app)
    .post(`/api/admin/bot/claves/${created.body.id}/revocacion`)
    .set('Authorization', `Bearer ${adminToken()}`);
  assert.equal(again.status, 200);
  assert.equal(again.body.revocada_en, first.body.revocada_en);

  const reused = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', created.body.clave);
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error.codigo, 'NO_AUTENTICADO');
});

test('TDD-TC-124: sin pimienta el alta responde 503 y un vínculo inválido responde 400', async t => {
  const fixture = installBotFixture({ sessionUser: ADMIN });
  t.after(() => fixture.restore());
  const previous = process.env.BOT_API_KEY_PEPPER;
  delete process.env.BOT_API_KEY_PEPPER;
  t.after(() => {
    process.env.BOT_API_KEY_PEPPER = previous;
  });

  const missing = await request(app)
    .post('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send(nuevaClave());
  assert.equal(missing.status, 503);
  assert.equal(missing.body.error.codigo, 'SERVICIO_NO_DISPONIBLE');

  process.env.BOT_API_KEY_PEPPER = previous;
  const both = await request(app)
    .post('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send(nuevaClave({ asesor_id: 9, rol_visibilidad: 'Almacen' }));
  assert.equal(both.status, 400);
  assert.equal(both.body.error.codigo, 'VALIDACION');

  const none = await request(app)
    .post('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send(nuevaClave({ asesor_id: null, rol_visibilidad: null }));
  assert.equal(none.status, 400);

  const stranger = await request(app)
    .post('/api/admin/bot/claves')
    .send(nuevaClave());
  assert.equal(stranger.status, 401);
  assert.equal(stranger.body.error.codigo, 'NO_AUTENTICADO');
});

test('TDD-TC-124: un rol que no es administrador no administra claves', async t => {
  const asesor = { ...ADMIN, id: 8, nivel_rol: 'Asesor', email: 'asesor.ficticio@example.test' };
  const fixture = installBotFixture({ sessionUser: asesor });
  t.after(() => fixture.restore());
  const token = jwt.sign(
    { id: asesor.id, nivel_rol: asesor.nivel_rol, session_version: 1 },
    process.env.JWT_SECRET
  );
  const response = await request(app)
    .get('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(response.status, 403);
  assert.equal(response.body.error.codigo, 'ROL_SIN_VISIBILIDAD');
});
