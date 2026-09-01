const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function section(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `No se encontró inicio: ${start}`);
  assert.notEqual(endIndex, -1, `No se encontró fin: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('TDD-TC-046: creación de cotización persiste todos los efectos mediante un tx', () => {
  const route = section('// CREATE QUOTATION / ORDER', 'async function getAttachmentQuoteAccess');
  assert.match(route, /await db\.transaction\(async tx =>/);
  assert.match(route, /SELECT[\s\S]*FROM planificacion_semanal[\s\S]*FOR UPDATE/);
  assert.match(route, /SELECT[\s\S]*FROM crm_prospectos[\s\S]*FOR UPDATE/);
  assert.match(route, /await tx\.run\(`[\s\S]*INSERT INTO cotizaciones/);
  assert.match(route, /await tx\.run\(`[\s\S]*INSERT INTO cotizacion_detalles/);
  assert.doesNotMatch(route, /await db\.run\(/);
});

test('TDD-TC-047: conversión bloquea y reutiliza prospecto confirmado', () => {
  const route = section(
    "app.post('/api/planificacion/:id/convertir-prospecto'",
    "app.get('/api/prospectos'"
  );
  assert.match(route, /await db\.transaction\(async tx =>/);
  assert.match(route, /FROM planificacion_semanal WHERE id = \? FOR UPDATE/);
  assert.match(route, /FROM crm_prospectos WHERE planificacion_id = \? FOR UPDATE/);
  assert.match(route, /existing[\s\S]*message: 'Prospect already exists'/);
  assert.doesNotMatch(route, /await db\.run\(/);
});

test('TDD-TC-048: edición bloquea cotización y productos en orden estable', () => {
  const route = section('// EDIT QUOTATION (HEADER & DETAILS)', '// WAREHOUSE & INVENTORY ENDPOINTS');
  assert.match(route, /await db\.transaction\(async tx =>/);
  assert.match(route, /FROM cotizaciones WHERE id = \? FOR UPDATE/);
  assert.match(route, /productIdsToLock[\s\S]*\.sort\(\(a, b\) => a - b\)/);
  assert.match(route, /FROM productos WHERE id = \? FOR UPDATE/);
  assert.match(route, /Insufficient inventory/);
  assert.doesNotMatch(route, /await db\.run\(/);
});

test('TDD-TC-048: cantidades comerciales inválidas fallan antes de escribir', () => {
  const { normalizeQuoteItems } = require('../utils/quoteValidation');
  assert.throws(() => normalizeQuoteItems([]), /at least one/i);
  assert.throws(
    () => normalizeQuoteItems([{ producto_id: 1, cantidad: -2 }]),
    /positive/i
  );
  assert.throws(
    () => normalizeQuoteItems([{ producto_id: 'x', cantidad: 2 }]),
    /product/i
  );
  assert.deepEqual(
    normalizeQuoteItems([{ producto_id: '4', cantidad: '2.5', descuento_aplicado: '3' }]),
    [{ producto_id: 4, cantidad: 2.5, descuento_aplicado: 3 }]
  );
});
