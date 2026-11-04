'use strict';

// TDD-TC-134 — cursor de la página siguiente en productos y movimientos.
// Rojo esperado antes de importar encodeCursor: 500 ERROR_INTERNO cuando hay más filas que limite.

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
const { foldText } = require('../utils/botHttp');

function seedKey(state) {
  const generated = generateKey();
  state.keys.push({
    id: state.nextKeyId,
    nombre: 'Bot Almacen',
    prefijo: generated.prefix,
    hash: hashKey(process.env.BOT_API_KEY_PEPPER, generated.clave),
    alcances: JSON.stringify(['inventario:leer']),
    asesor_id: null,
    rol_visibilidad: 'Almacen',
    limite_por_minuto: 60,
    creada_en: new Date().toISOString(),
    revocada_en: null
  });
  state.nextKeyId += 1;
  return generated.clave;
}

function product(id) {
  const nombre = `Semilla Demo ${id}`;
  const clave = `SEM-${id}`;
  return {
    id,
    nombre,
    clave,
    categoria: 'Semilla',
    existencia_fisica: 10,
    reservado: 0,
    _foldedNombre: foldText(nombre),
    _foldedClave: foldText(clave),
    _foldedCategoria: foldText('Semilla')
  };
}

function movement(id) {
  return {
    id,
    fecha_movimiento: '2026-11-03T15:00:00.000Z',
    tipo_movimiento: 'Entrada',
    producto_id: 11,
    producto_nombre: 'Semilla Demo 11',
    cantidad_entrante: 1,
    cantidad_saliente: 0,
    existencias_resultantes: id,
    ciclo_agricola: 'OI-DEMO',
    lote: `LOTE-${id}`,
    tamano: 'BT1'
  };
}

function pagedState() {
  return {
    products: [11, 12, 13, 14].map(product),
    movements: [801, 802, 803, 804].map(movement)
  };
}

test('TDD-TC-134: productos y movimientos con limite menor al total devuelven cursor y la página siguiente', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture(pagedState());
  t.after(() => fixture.restore());
  const clave = seedKey(fixture.state);
  const auth = { 'X-Api-Key': clave };

  const products = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .query({ limite: 3 })
    .set(auth);
  assert.equal(products.status, 200, JSON.stringify(products.body));
  assert.equal(products.body.paginacion.limite, 3);
  assert.equal(typeof products.body.paginacion.siguiente, 'string');
  assert.ok(products.body.paginacion.siguiente);
  assert.deepEqual(products.body.datos.map(row => row.id), [11, 12, 13]);

  const nextProducts = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .query({ limite: 3, cursor: products.body.paginacion.siguiente })
    .set(auth);
  assert.equal(nextProducts.status, 200, JSON.stringify(nextProducts.body));
  assert.deepEqual(nextProducts.body.datos.map(row => row.id), [14]);
  assert.equal(nextProducts.body.paginacion.siguiente, null);

  const moves = await request(app)
    .get('/api/v1/bot/inventario/movimientos')
    .query({ limite: 3 })
    .set(auth);
  assert.equal(moves.status, 200, JSON.stringify(moves.body));
  assert.equal(moves.body.paginacion.limite, 3);
  assert.equal(typeof moves.body.paginacion.siguiente, 'string');
  assert.ok(moves.body.paginacion.siguiente);
  assert.deepEqual(moves.body.datos.map(row => row.id), [804, 803, 802]);

  const nextMoves = await request(app)
    .get('/api/v1/bot/inventario/movimientos')
    .query({ limite: 3, cursor: moves.body.paginacion.siguiente })
    .set(auth);
  assert.equal(nextMoves.status, 200, JSON.stringify(nextMoves.body));
  assert.deepEqual(nextMoves.body.datos.map(row => row.id), [801]);
  assert.equal(nextMoves.body.paginacion.siguiente, null);
});
