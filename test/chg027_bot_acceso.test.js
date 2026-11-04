'use strict';

// TDD-TC-125 — alcance y rol. La vista del asesor se completa en el corte de lectura.

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { testBotPepper } = require('./support/botPepper');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-chg027-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.SKIP_INIT_SCHEMA = 'true';
process.env.PGSSL = 'false';
process.env.BOT_API_KEY_PEPPER = testBotPepper();

const { app } = require('../server');
const { installBotFixture } = require('./support/botFixture');
const { generateKey, hashKey } = require('../utils/botKeys');
const { resetBotRateLimit } = require('../utils/botRateLimit');

function seed(state, { alcance = 'inventario:leer', rol = 'Almacen', revoked = false, asesorId = null, limite = 60 } = {}) {
  const generated = generateKey();
  state.keys.push({
    id: state.nextKeyId,
    nombre: 'Bot ficticio',
    prefijo: generated.prefix,
    hash: hashKey(process.env.BOT_API_KEY_PEPPER, generated.clave),
    alcances: JSON.stringify([alcance]),
    asesor_id: asesorId,
    rol_visibilidad: asesorId ? null : rol,
    limite_por_minuto: limite,
    creada_en: new Date().toISOString(),
    revocada_en: revoked ? new Date().toISOString() : null
  });
  state.nextKeyId += 1;
  return generated.clave;
}

test('TDD-TC-125: un alcance ajeno y un observador reciben 403 sin leer inventario', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const ajeno = seed(fixture.state, { alcance: 'otro:leer' });
  const denied = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', ajeno);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.codigo, 'ALCANCE_DENEGADO');
  assert.equal(fixture.state.sqlLog.some(sql => sql.includes('bot:productos')), false);

  const observador = seed(fixture.state, { rol: 'Observador' });
  const hidden = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', observador);
  assert.equal(hidden.status, 403);
  assert.equal(hidden.body.error.codigo, 'ROL_SIN_VISIBILIDAD');
});

test('TDD-TC-125: la clave revocada y la desconocida comparten el cuerpo 401', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const revokedKey = seed(fixture.state, { revoked: true });
  const revoked = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', revokedKey);
  const unknown = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', 'cgbot_abcdef01.clave-desconocida');
  assert.equal(revoked.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(revoked.body, unknown.body);
  assert.equal(revoked.body.error.codigo, 'NO_AUTENTICADO');
  assert.equal(JSON.stringify(fixture.state.calls).includes(revokedKey), false);
  assert.equal(JSON.stringify(fixture.state.calls).includes('clave-desconocida'), false);
});

test('TDD-TC-125: el rol se lee en vivo y una persona inactiva no entra', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture({
    people: [
      { id: 21, nivel_rol: 'Asesor', activo: 1 },
      { id: 22, nivel_rol: 'Almacen', activo: 0 }
    ]
  });
  t.after(() => fixture.restore());
  const asesor = seed(fixture.state, { asesorId: 21 });
  const moves = await request(app)
    .get('/api/v1/bot/inventario/movimientos')
    .set('X-Api-Key', asesor);
  assert.equal(moves.status, 403);
  assert.equal(moves.body.error.codigo, 'ROL_SIN_VISIBILIDAD');

  const inactive = seed(fixture.state, { asesorId: 22 });
  const blocked = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', inactive);
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.error.codigo, 'NO_AUTENTICADO');
});
