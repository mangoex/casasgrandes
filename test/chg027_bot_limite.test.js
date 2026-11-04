'use strict';

// TDD-TC-128 — límite por clave.

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
const { createRateLimiter, resetBotRateLimit } = require('../utils/botRateLimit');

function seed(state, limite, rol = 'Almacen') {
  const generated = generateKey();
  state.keys.push({
    id: state.nextKeyId,
    nombre: 'Bot con límite',
    prefijo: generated.prefix,
    hash: hashKey(process.env.BOT_API_KEY_PEPPER, generated.clave),
    alcances: JSON.stringify(['inventario:leer']),
    asesor_id: null,
    rol_visibilidad: rol,
    limite_por_minuto: limite,
    creada_en: new Date().toISOString(),
    revocada_en: null
  });
  state.nextKeyId += 1;
  return generated.clave;
}

test('TDD-TC-128: la tercera lectura de una clave con límite 2 responde 429', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const clave = seed(fixture.state, 2);
  let last;
  for (let index = 0; index < 3; index += 1) {
    last = await request(app).get('/api/v1/bot/inventario/productos').set('X-Api-Key', clave);
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error.codigo, 'LIMITE_EXCEDIDO');
  assert.equal(Number(last.headers['retry-after']) >= 1, true);
  assert.equal(last.headers['ratelimit-remaining'], '0');
});

test('TDD-TC-128: un 403 también consume la ventana y la clave desconocida usa otro cubo', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const clave = seed(fixture.state, 1, 'Observador');
  const first = await request(app).get('/api/v1/bot/inventario/productos').set('X-Api-Key', clave);
  const second = await request(app).get('/api/v1/bot/inventario/productos').set('X-Api-Key', clave);
  assert.equal(first.status, 403);
  assert.equal(second.status, 429);

  const limiter = createRateLimiter({ now: () => 1_700_000_000_000 });
  assert.equal(limiter.consume('desconocida:10.0.0.8', 2).allowed, true);
  assert.equal(limiter.consume('desconocida:10.0.0.8', 2).allowed, true);
  const blocked = limiter.consume('desconocida:10.0.0.8', 2);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(limiter.consume('clave:99', 2).allowed, true);
});
