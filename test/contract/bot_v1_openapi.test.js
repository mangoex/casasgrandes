'use strict';

// TDD-TC-121 — el contrato CHG-027 es válido y las respuestas reales cumplen el esquema.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-contract-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.SKIP_INIT_SCHEMA = 'true';

const { loadOpenApi, validateResponse, defaultSpecPath } = require('../support/openapiResponse');
const { testBotPepper } = require('../support/botPepper');

const RUTAS = [
  ['GET', '/api/v1/bot/health'],
  ['GET', '/api/v1/bot/inventario/productos'],
  ['GET', '/api/v1/bot/inventario/productos/7'],
  ['GET', '/api/v1/bot/inventario/movimientos'],
  ['GET', '/api/admin/bot/claves'],
  ['POST', '/api/admin/bot/claves'],
  ['POST', '/api/admin/bot/claves/1/revocacion']
];

const RUTAS_DOCUMENTO = [
  '/api/v1/bot/health',
  '/api/v1/bot/inventario/productos',
  '/api/v1/bot/inventario/productos/{productoId}',
  '/api/v1/bot/inventario/movimientos',
  '/api/admin/bot/claves',
  '/api/admin/bot/claves/{claveId}/revocacion'
];

test('TDD-TC-121: bot-v1 describe la lectura de inventario y las claves, sin otros recursos', async () => {
  const { api } = await loadOpenApi(defaultSpecPath);
  assert.equal(api.openapi, '3.1.0');
  assert.equal(api.components.securitySchemes.botApiKey.type, 'apiKey');
  assert.equal(api.components.securitySchemes.botApiKey.in, 'header');
  assert.equal(api.components.securitySchemes.botApiKey.name, 'X-Api-Key');
  assert.equal(api.components.securitySchemes.adminSession.in, 'cookie');
  assert.equal(api.components.securitySchemes.adminSession.name, 'auth_token');
  assert.deepEqual(Object.keys(api.paths).sort(), [...RUTAS_DOCUMENTO].sort());
  assert.deepEqual(api.paths['/api/v1/bot/health'].get.security, []);
  assert.equal(
    api.paths['/api/v1/bot/inventario/productos'].get.security[0].botApiKey !== undefined,
    true
  );

  const textoRutas = Object.keys(api.paths).join(' ');
  assert.equal(textoRutas.includes('/inventario/'), true);
  for (const fragmento of ['/clientes', '/cotizaciones', '/precios', '/asesores']) {
    assert.equal(textoRutas.includes(fragmento), false);
  }
});

test('TDD-TC-121: los ejemplos del contrato cumplen y un campo de más no cumple', async () => {
  const salud = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/health',
    method: 'GET',
    status: 200,
    body: { status: 'ok' }
  });
  assert.equal(salud.valid, true, JSON.stringify(salud.errors));

  const asesor = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'asesor',
      datos: [{
        id: 7,
        nombre: 'Híbrido Demostración',
        clave: 'HIB-DEMO',
        categoria: 'Híbrido',
        disponible: 100
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(asesor.valid, true, JSON.stringify(asesor.errors));

  const asesorConFisico = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'asesor',
      datos: [{
        id: 7,
        nombre: 'Híbrido Demostración',
        clave: 'HIB-DEMO',
        categoria: 'Híbrido',
        disponible: 100,
        existencia_fisica: 140
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(asesorConFisico.valid, false);

  const operativo = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'operativo',
      datos: [{
        id: 7,
        nombre: 'Híbrido Demostración',
        clave: 'HIB-DEMO',
        categoria: 'Híbrido',
        existencia_fisica: 140,
        reservado: 40,
        disponible: 100
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(operativo.valid, true, JSON.stringify(operativo.errors));

  const detalle = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: {
      vista: 'almacen',
      id: 7,
      nombre: 'Híbrido Demostración',
      clave: 'HIB-DEMO',
      categoria: 'Híbrido',
      existencia_fisica: 140,
      reservado: 40,
      disponible: 100,
      tamanos: [{ tamano: 'BT1', existencia_fisica: 90, reservado: 30, disponible: 60 }],
      lotes: [{ lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90 }]
    }
  });
  assert.equal(detalle.valid, true, JSON.stringify(detalle.errors));

  const detalleAdministrador = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: {
      vista: 'administrador',
      id: 7,
      nombre: 'Híbrido Demostración',
      clave: 'HIB-DEMO',
      categoria: 'Híbrido',
      existencia_fisica: 140,
      reservado: 40,
      disponible: 100,
      lotes: [{ lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90 }]
    }
  });
  assert.equal(detalleAdministrador.valid, true, JSON.stringify(detalleAdministrador.errors));

  const administradorConTamanos = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: {
      vista: 'administrador',
      id: 7,
      nombre: 'Híbrido Demostración',
      clave: 'HIB-DEMO',
      categoria: 'Híbrido',
      existencia_fisica: 140,
      reservado: 40,
      disponible: 100,
      tamanos: [{ tamano: 'BT1', existencia_fisica: 90, reservado: 30, disponible: 60 }],
      lotes: [{ lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90 }]
    }
  });
  assert.equal(administradorConTamanos.valid, false);

  const loteConReservado = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos/{productoId}',
    method: 'GET',
    status: 200,
    body: {
      vista: 'almacen',
      id: 7,
      nombre: 'Híbrido Demostración',
      clave: 'HIB-DEMO',
      categoria: 'Híbrido',
      existencia_fisica: 140,
      reservado: 40,
      disponible: 100,
      tamanos: [],
      lotes: [{ lote: 'LOTE-DEMO-1', tamano: 'BT1', existencia_fisica: 90, reservado: 1 }]
    }
  });
  assert.equal(loteConReservado.valid, false);

  const movimiento = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/movimientos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'almacen',
      datos: [{
        id: 501,
        fecha: '2026-11-03T15:00:00Z',
        tipo: 'Entrada de demostración',
        producto_id: 7,
        producto_nombre: 'Híbrido Demostración',
        cantidad_entrante: 90,
        cantidad_saliente: 0,
        existencias_resultantes: 140,
        ciclo_agricola: 'OI-DEMO',
        lote: 'LOTE-DEMO-1',
        tamano: 'BT1'
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(movimiento.valid, true, JSON.stringify(movimiento.errors));

  const movimientoOperativo = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/movimientos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'operativo',
      datos: [{
        id: 501,
        fecha: '2026-11-03T15:00:00Z',
        tipo: 'Entrada',
        producto_id: 7,
        producto_nombre: 'Híbrido Demostración',
        cantidad_entrante: 90,
        cantidad_saliente: 0,
        existencias_resultantes: 140,
        ciclo_agricola: 'OI-DEMO',
        lote: 'LOTE-DEMO-1'
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(movimientoOperativo.valid, true, JSON.stringify(movimientoOperativo.errors));

  const operativoConTamano = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/movimientos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'operativo',
      datos: [{
        id: 501,
        fecha: '2026-11-03T15:00:00Z',
        tipo: 'Entrada',
        producto_id: 7,
        producto_nombre: 'Híbrido Demostración',
        cantidad_entrante: 90,
        cantidad_saliente: 0,
        existencias_resultantes: 140,
        ciclo_agricola: null,
        lote: 'LOTE-DEMO-1',
        tamano: 'BT1'
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(operativoConTamano.valid, false);

  const movimientoConCliente = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/movimientos',
    method: 'GET',
    status: 200,
    body: {
      vista: 'operativo',
      datos: [{
        id: 501,
        fecha: '2026-11-03T15:00:00Z',
        tipo: 'Entrada de demostración',
        producto_id: 7,
        producto_nombre: 'Híbrido Demostración',
        cantidad_entrante: 90,
        cantidad_saliente: 0,
        existencias_resultantes: 140,
        ciclo_agricola: null,
        lote: null,
        cliente_nombre: 'Persona Demostración'
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(movimientoConCliente.valid, false);

  const clave = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/admin/bot/claves',
    method: 'POST',
    status: 201,
    body: {
      id: 1,
      nombre: 'Bot inventario demostración',
      prefijo: 'cgbot_demo',
      clave: 'EJEMPLO-NO-ES-SECRETO',
      alcances: ['inventario:leer'],
      asesor_id: null,
      rol_visibilidad: 'Almacen',
      limite_por_minuto: 60,
      activa: true,
      creada_en: '2026-11-03T15:00:00Z',
      revocada_en: null
    }
  });
  assert.equal(clave.valid, true, JSON.stringify(clave.errors));

  const listado = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/admin/bot/claves',
    method: 'GET',
    status: 200,
    body: {
      datos: [{
        id: 1,
        nombre: 'Bot inventario demostración',
        prefijo: 'cgbot_demo',
        clave: 'EJEMPLO-NO-ES-SECRETO',
        alcances: ['inventario:leer'],
        asesor_id: null,
        rol_visibilidad: 'Almacen',
        limite_por_minuto: 60,
        activa: true,
        creada_en: '2026-11-03T15:00:00Z',
        revocada_en: null
      }],
      paginacion: { limite: 50, siguiente: null }
    }
  });
  assert.equal(listado.valid, false);
});

test('TDD-TC-121: cada ejemplo publicado cumple su esquema', async () => {
  const { dereferenced } = await loadOpenApi(defaultSpecPath);
  for (const [requestPath, pathItem] of Object.entries(dereferenced.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem[method];
      if (!operation?.responses) continue;
      for (const [status, response] of Object.entries(operation.responses)) {
        const example = response.content?.['application/json']?.example;
        if (example === undefined) continue;
        const result = await validateResponse({
          specPath: defaultSpecPath,
          requestPath,
          method: method.toUpperCase(),
          status: Number(status),
          body: example
        });
        assert.equal(
          result.valid,
          true,
          `${method.toUpperCase()} ${requestPath} ${status} ${JSON.stringify(result.errors)}`
        );
      }
    }
  }
});

test('TDD-TC-121: las respuestas reales de salud y de clave ausente cumplen el contrato', async t => {
  process.env.BOT_API_KEY_PEPPER = testBotPepper();
  const request = require('supertest');
  const { app } = require('../../server');
  const { installBotFixture } = require('../support/botFixture');
  const fixture = installBotFixture();
  t.after(() => fixture.restore());
  const health = await request(app).get('/api/v1/bot/health');
  assert.equal(health.status, 200, JSON.stringify(health.body));
  const healthSchema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/health',
    method: 'GET',
    status: 200,
    body: health.body
  });
  assert.equal(healthSchema.valid, true, JSON.stringify(healthSchema.errors));
  assert.deepEqual(Object.keys(health.body), ['status']);

  const missing = await request(app).get('/api/v1/bot/inventario/productos');
  assert.equal(missing.status, 401, JSON.stringify(missing.body));
  const missingSchema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/inventario/productos',
    method: 'GET',
    status: 401,
    body: missing.body
  });
  assert.equal(missingSchema.valid, true, JSON.stringify(missingSchema.errors));

  const admin = await request(app).post('/api/admin/bot/claves').send({});
  assert.equal(admin.status, 401, JSON.stringify(admin.body));
  const adminSchema = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/admin/bot/claves',
    method: 'POST',
    status: 401,
    body: admin.body
  });
  assert.equal(adminSchema.valid, true, JSON.stringify(adminSchema.errors));
});
