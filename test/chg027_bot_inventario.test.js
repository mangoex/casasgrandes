'use strict';

// TDD-TC-126 y TDD-TC-127 — disponible, lotes, tamaños y movimientos.
// Rojo esperado antes del corte de lectura: 404.

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { validateResponse, defaultSpecPath } = require('./support/openapiResponse');
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

function seedKey(state, rol) {
  const generated = generateKey();
  state.keys.push({
    id: state.nextKeyId,
    nombre: `Bot ${rol}`,
    prefijo: generated.prefix,
    hash: hashKey(process.env.BOT_API_KEY_PEPPER, generated.clave),
    alcances: JSON.stringify(['inventario:leer']),
    asesor_id: null,
    rol_visibilidad: rol,
    limite_por_minuto: 60,
    creada_en: new Date().toISOString(),
    revocada_en: null
  });
  state.nextKeyId += 1;
  return generated.clave;
}

function demoState() {
  return {
    products: [
      {
        id: 7,
        nombre: 'Híbrido Demostración',
        clave: 'HIB-DEMO',
        categoria: 'Híbrido',
        existencia_fisica: 140,
        reservado: 40,
        _foldedNombre: foldText('Híbrido Demostración'),
        _foldedClave: foldText('HIB-DEMO'),
        _foldedCategoria: foldText('Híbrido')
      },
      {
        id: 8,
        nombre: 'Agro Demo',
        clave: 'AGR-1',
        categoria: 'Agroquímicos',
        existencia_fisica: 10,
        reservado: 15,
        _foldedNombre: foldText('Agro Demo'),
        _foldedClave: foldText('AGR-1'),
        _foldedCategoria: foldText('Agroquímicos')
      }
    ],
    lots: [
      { producto_id: 7, lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90 }
    ],
    sizesPhysical: [
      { producto_id: 7, tamano: 'BT1', existencia_fisica: 90 }
    ],
    sizesReserved: [
      { producto_id: 7, tamano: 'BT1', reservado: 30 }
    ],
    movements: [
      {
        id: 501,
        fecha_movimiento: '2026-11-03T15:00:00.000Z',
        tipo_movimiento: 'Entrada',
        producto_id: 7,
        producto_nombre: 'Híbrido Demostración',
        cantidad_entrante: 90,
        cantidad_saliente: 0,
        existencias_resultantes: 140,
        ciclo_agricola: 'OI-DEMO',
        lote: 'LOTE-DEMO-1',
        tamano: 'BT1'
      }
    ]
  };
}

function auth(clave) {
  return { 'X-Api-Key': clave };
}

test('TDD-TC-126: el disponible resta reservas y el almacén ve tamaño y lote', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture(demoState());
  t.after(() => fixture.restore());
  const clave = seedKey(fixture.state, 'Almacen');
  const list = await request(app).get('/api/v1/bot/inventario/productos').set(auth(clave));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const demo = list.body.datos.find(row => row.id === 7);
  assert.equal(demo.disponible, 100);
  assert.equal(demo.existencia_fisica, 140);
  assert.equal(list.body.datos.find(row => row.id === 8).disponible, -5);
  assert.equal(Object.hasOwn(demo, 'lotes'), false);

  const detail = await request(app).get('/api/v1/bot/inventario/productos/7').set(auth(clave));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.vista, 'almacen');
  assert.equal(detail.body.disponible, 100);
  assert.equal(detail.body.existencia_fisica, 140);
  assert.deepEqual(detail.body.lotes, [{ lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90 }]);
  assert.deepEqual(detail.body.tamanos, [{ tamano: 'BT1', existencia_fisica: 90, reservado: 30, disponible: 60 }]);
  const schema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: detail.body
  });
  assert.equal(schema.valid, true, JSON.stringify(schema.errors));
});

test('TDD-TC-126: el administrador ve lotes y no el libro de tamaños; la búsqueda ignora diacríticos', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture(demoState());
  t.after(() => fixture.restore());
  const clave = seedKey(fixture.state, 'Administrador');
  const detail = await request(app).get('/api/v1/bot/inventario/productos/7').set(auth(clave));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.vista, 'administrador');
  assert.equal(detail.body.lotes[0].lote, 'LOTE-DEMO-1');
  assert.equal(Object.hasOwn(detail.body, 'tamanos'), false);
  const adminSchema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: detail.body
  });
  assert.equal(adminSchema.valid, true, JSON.stringify(adminSchema.errors));

  const found = await request(app)
    .get('/api/v1/bot/inventario/productos')
    .query({ q: 'Hibrido', categoria: 'Hibrido' })
    .set(auth(clave));
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.deepEqual(found.body.datos.map(row => row.id), [7]);
  assert.equal(found.body.datos[0].categoria, 'Híbrido');

  const missing = await request(app).get('/api/v1/bot/inventario/productos/99').set(auth(clave));
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.codigo, 'NO_ENCONTRADO');
});

test('TDD-TC-127: los movimientos ocultan datos de personas y el tamaño fuera de almacén', async t => {
  resetBotRateLimit();
  const fixture = installBotFixture(demoState());
  t.after(() => fixture.restore());
  const almacen = seedKey(fixture.state, 'Almacen');
  const warehouse = await request(app).get('/api/v1/bot/inventario/movimientos').set(auth(almacen));
  assert.equal(warehouse.status, 200, JSON.stringify(warehouse.body));
  assert.equal(warehouse.body.vista, 'almacen');
  assert.equal(warehouse.body.datos[0].tipo, 'Entrada');
  assert.equal(warehouse.body.datos[0].lote, 'LOTE-DEMO-1');
  assert.equal(warehouse.body.datos[0].tamano, 'BT1');
  const dumped = JSON.stringify(warehouse.body);
  for (const fragment of ['cliente', 'precio', 'factura', 'folio', 'notas', 'correo']) {
    assert.equal(dumped.includes(fragment), false, fragment);
  }
  const movementSchema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/movimientos',
    method: 'GET',
    status: 200,
    body: warehouse.body
  });
  assert.equal(movementSchema.valid, true, JSON.stringify(movementSchema.errors));

  const admin = seedKey(fixture.state, 'Administrador');
  const operative = await request(app).get('/api/v1/bot/inventario/movimientos').set(auth(admin));
  assert.equal(operative.status, 200, JSON.stringify(operative.body));
  assert.equal(operative.body.vista, 'operativo');
  assert.equal(operative.body.datos[0].lote, 'LOTE-DEMO-1');
  assert.equal(Object.hasOwn(operative.body.datos[0], 'tamano'), false);

  const asesor = seedKey(fixture.state, 'Asesor');
  const detail = await request(app).get('/api/v1/bot/inventario/productos/7').set(auth(asesor));
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.vista, 'asesor');
  assert.equal(detail.body.disponible, 100);
  assert.equal(JSON.stringify(detail.body).includes('lote'), false);
  assert.equal(JSON.stringify(detail.body).includes('existencia_fisica'), false);
  const moves = await request(app).get('/api/v1/bot/inventario/movimientos').set(auth(asesor));
  assert.equal(moves.status, 403);
  assert.equal(moves.body.error.codigo, 'ROL_SIN_VISIBILIDAD');

  const invalid = await request(app)
    .get('/api/v1/bot/inventario/movimientos')
    .query({ cliente_id: 1 })
    .set(auth(almacen));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.codigo, 'VALIDACION');
});
