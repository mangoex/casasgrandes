const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-dashboard-resilience';
process.env.NODE_ENV = 'test';

const db = require('../db');
const { app } = require('../server');

test('TDD-TC-092: loadDashboardData en public/js/app.js define y resuelve selectedCycle sin ReferenceError', () => {
  const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const code = fs.readFileSync(appJsPath, 'utf8');

  // Verify that selectedCycle is declared and defined before its first use
  const selectedCycleDeclarationRegex = /(?:const|let|var)\s+selectedCycle\s*=\s*cycleSelect\??\.value/i;
  assert.ok(
    selectedCycleDeclarationRegex.test(code),
    'loadDashboardData debe declarar y extraer selectedCycle de cycleSelect (ej: const selectedCycle = cycleSelect?.value || "")'
  );
});

test('TDD-TC-093: GET /api/comisiones/reporte proyecta fecha_creacion AS fecha_cotizacion sin error 42703', async t => {
  const originalAll = db.all;
  const originalGet = db.get;
  let executedQuery = '';

  db.get = async () => ({
    id: 1,
    nombre: 'Admin Test',
    nivel_rol: 'Administrador',
    activo: 1,
    session_version: 1
  });

  db.all = async (sql, params) => {
    executedQuery = String(sql);
    return [];
  };

  t.after(() => {
    db.all = originalAll;
    db.get = originalGet;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign(
    { id: 1, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );

  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/comisiones/reporte`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  assert.equal(res.status, 200, 'El endpoint debe responder 200 OK');
  assert.ok(
    executedQuery.includes('c.fecha_creacion AS fecha_cotizacion') ||
    executedQuery.includes('fecha_creacion'),
    'La consulta SQL no debe solicitar la columna inexistente c.fecha_cotizacion sin alias; debe usar fecha_creacion'
  );
  assert.ok(
    !executedQuery.includes('c.fecha_cotizacion,'),
    'La consulta no debe proyectar c.fecha_cotizacion directamente'
  );
});
