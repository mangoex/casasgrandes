'use strict';

// TDD-TC-129 — auditoría sin cuerpo, sin clave y sin datos de personas.

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

test('TDD-TC-129: la llamada reconocida guarda la ruta plantilla y no el secreto', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const generated = generateKey();
  fixture.state.keys.push({
    id: 3,
    nombre: 'Bot auditoría',
    prefijo: generated.prefix,
    hash: hashKey(process.env.BOT_API_KEY_PEPPER, generated.clave),
    alcances: JSON.stringify(['inventario:leer']),
    asesor_id: null,
    rol_visibilidad: 'Almacen',
    limite_por_minuto: 60,
    creada_en: new Date().toISOString(),
    revocada_en: null
  });

  const callsBeforeHealth = fixture.state.calls.length;
  const health = await request(app).get('/api/v1/bot/health');
  assert.equal(health.status, 200);
  assert.equal(fixture.state.calls.length, callsBeforeHealth);

  const response = await request(app)
    .get('/api/v1/bot/inventario/productos?q=demo')
    .set('X-Api-Key', generated.clave)
    .set('X-Request-ID', 'prueba-chg027');
  const row = fixture.state.calls.at(-1);
  assert.ok(row);
  assert.equal(row.clave_id, 3);
  assert.equal(row.metodo, 'GET');
  assert.equal(row.ruta_plantilla, '/api/v1/bot/inventario/productos');
  assert.equal(row.codigo_http, response.status);
  assert.equal(row.request_id, 'prueba-chg027');
  const dumped = JSON.stringify(row);
  assert.equal(dumped.includes(generated.clave), false);
  assert.equal(dumped.includes('q=demo'), false);
  assert.equal(dumped.includes('cliente'), false);
  assert.equal(Object.hasOwn(row, 'cuerpo'), false);

  const presented = 'cgbot_abcdef01.secreto-no-guardado';
  const unknown = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', presented);
  assert.equal(unknown.status, 401);
  assert.equal(JSON.stringify(fixture.state.calls).includes(presented), false);
  assert.equal(JSON.stringify(fixture.state.calls).includes('secreto-no-guardado'), false);
});
