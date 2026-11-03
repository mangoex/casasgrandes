'use strict';

// TDD-TC-121 — el contrato del bot es válido y la ruta placeholder no está montada.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-contract-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.SKIP_INIT_SCHEMA = 'true';

const { loadOpenApi, validateResponse, defaultSpecPath } = require('../support/openapiResponse');

test('TDD-TC-121: bot-v1 es OpenAPI 3.1 con clave en X-Api-Key y sin operaciones de negocio', async () => {
  const { api } = await loadOpenApi(defaultSpecPath);
  assert.equal(api.openapi, '3.1.0');
  assert.equal(api.components.securitySchemes.botApiKey.type, 'apiKey');
  assert.equal(api.components.securitySchemes.botApiKey.in, 'header');
  assert.equal(api.components.securitySchemes.botApiKey.name, 'X-Api-Key');
  assert.deepEqual(Object.keys(api.paths), ['/api/v1/bot/health']);
  const text = JSON.stringify(api.paths);
  for (const word of ['inventario', 'cotizaciones', 'asesores', 'clientes', 'catalogo', 'alertas']) {
    assert.equal(text.toLowerCase().includes(word), false);
  }
});

test('TDD-TC-121: el validador acepta el placeholder y rechaza un cuerpo distinto', async () => {
  const ok = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/health',
    method: 'GET',
    status: 200,
    body: { status: 'ok' }
  });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));

  const wrongStatus = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/health',
    method: 'GET',
    status: 200,
    body: { status: 'alive' }
  });
  assert.equal(wrongStatus.valid, false);

  const extra = await validateResponse({
    specPath: defaultSpecPath,
    requestPath: '/api/v1/bot/health',
    method: 'GET',
    status: 200,
    body: { status: 'ok', detalle: 'no permitido' }
  });
  assert.equal(extra.valid, false);
});

test('TDD-TC-121: Express todavía no publica /api/v1/bot/health', async () => {
  const request = require('supertest');
  const { app } = require('../../server');
  const response = await request(app).get('/api/v1/bot/health');
  assert.equal(response.status, 404);
});
