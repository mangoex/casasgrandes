const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function endpointSource(source, start, next) {
  const from = source.indexOf(start);
  const to = source.indexOf(next, from + start.length);
  assert.notEqual(from, -1, `Missing endpoint ${start}`);
  assert.notEqual(to, -1, `Missing endpoint boundary ${next}`);
  return source.slice(from, to);
}

test('TDD-TC-030/031: runner confirma, revierte y libera una sola conexión', async () => {
  const { createTransactionRunner } = require('../utils/databaseTransaction');
  const events = [];
  const client = {
    async query(sql, params) {
      events.push({ sql, params });
      if (sql === 'FAIL') throw new Error('simulated failure');
      return { rows: [{ id: 7 }], rowCount: 1 };
    },
    release() {
      events.push({ sql: 'RELEASE' });
    }
  };
  const pool = { connect: async () => client };
  const transaction = createTransactionRunner(pool, sql => sql);

  const result = await transaction(async tx => {
    assert.equal((await tx.get('SELECT ONE')).id, 7);
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.deepEqual(events.map(event => event.sql), ['BEGIN', 'SELECT ONE', 'COMMIT', 'RELEASE']);

  events.length = 0;
  await assert.rejects(
    transaction(async tx => {
      await tx.run('WRITE ONE');
      await tx.run('FAIL');
    }),
    /simulated failure/
  );
  assert.deepEqual(events.map(event => event.sql), ['BEGIN', 'WRITE ONE', 'FAIL', 'ROLLBACK', 'RELEASE']);
});

test('TDD-TC-032: movimientos y producción bloquean inventario dentro de transacción', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
  const movement = endpointSource(
    source,
    "app.post('/api/almacen/movimientos'",
    '// INTERNAL UAN-32 PRODUCTION'
  );
  const production = endpointSource(
    source,
    "app.post('/api/almacen/produccion-uan32'",
    '// -------------------------------------------------------------\n// DASHBOARD'
  );

  for (const block of [movement, production]) {
    assert.match(block, /db\.transaction/);
    assert.match(block, /FOR UPDATE/);
  }
});

test('TDD-TC-033: cotización y puja bloquean y revalidan estado en transacción', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const quoteStatus = endpointSource(
    source,
    "app.put('/api/cotizaciones/:id/status'",
    '// DELETE QUOTATION'
  );
  const bidDecision = endpointSource(
    source,
    "app.post('/api/asignacion/pujas/:id/decision'",
    '// Fetch AI matching metrics'
  );

  for (const block of [quoteStatus, bidDecision]) {
    assert.match(block, /db\.transaction/);
    assert.match(block, /FOR UPDATE/);
  }
});
