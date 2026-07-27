const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'test-only-authorization-secret';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const clientesRouter = require('../routes/clientes');
const fs = require('node:fs');
const path = require('node:path');

function invokeMiddleware(middleware, req) {
  return new Promise(resolve => {
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ nextCalled: false, response: this });
      }
    };
    middleware(req, response, () => resolve({ nextCalled: true, response, req }));
  });
}

test('TDD-TC-024: autenticación usa cuenta activa, versión y rol vigentes', async t => {
  const originalGet = db.get;
  t.after(() => {
    db.get = originalGet;
  });

  const token = jwt.sign(
    { id: 11, nivel_rol: 'Administrador', session_version: 4 },
    process.env.JWT_SECRET
  );
  const request = { headers: { authorization: `Bearer ${token}` } };

  db.get = async () => ({
    id: 11,
    nombre: 'Cuenta Vigente',
    usuario: 'vigente',
    nivel_rol: 'Asesor',
    email: 'vigente@example.test',
    activo: 1,
    session_version: 4
  });
  const accepted = await invokeMiddleware(authenticateToken, request);
  assert.equal(accepted.nextCalled, true);
  assert.equal(accepted.req.user.nivel_rol, 'Asesor');

  db.get = async () => ({ id: 11, activo: 0, session_version: 4 });
  const inactive = await invokeMiddleware(authenticateToken, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(inactive.nextCalled, false);
  assert.equal(inactive.response.statusCode, 403);

  db.get = async () => ({ id: 11, activo: 1, session_version: 5 });
  const revoked = await invokeMiddleware(authenticateToken, {
    headers: { authorization: `Bearer ${token}` }
  });
  assert.equal(revoked.nextCalled, false);
  assert.equal(revoked.response.statusCode, 403);
});

test('TDD-TC-025: política de rol y propiedad falla cerrada', () => {
  const { requireRoles, canAccessOwnedResource } = require('../middleware/authorization');
  assert.equal(canAccessOwnedResource({ id: 3, nivel_rol: 'Asesor' }, 3), true);
  assert.equal(canAccessOwnedResource({ id: 3, nivel_rol: 'Asesor' }, 4), false);
  assert.equal(canAccessOwnedResource({ id: 8, nivel_rol: 'Coordinador' }, 4), true);
  assert.equal(canAccessOwnedResource({ id: 9, nivel_rol: 'Almacen' }, 9), false);

  const policy = requireRoles('Administrador', 'Coordinador');
  let continued = false;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    }
  };
  policy({ user: { nivel_rol: 'Almacen' } }, response, () => {
    continued = true;
  });
  assert.equal(continued, false);
  assert.equal(response.statusCode, 403);
});

test('TDD-TC-026/027/029: cartera deniega lectura y asociación ajenas y bloquea Almacén', async t => {
  const originalGet = db.get;
  const originalRun = db.run;
  let runCalled = false;
  let activeRole = 'Asesor';
  let clientRecord = { id: 99, asesor_id: 77, activo: 1, nombre: 'Cartera ajena' };

  db.get = async query => {
    if (String(query).includes('FROM asesores')) {
      return {
        id: 21,
        nombre: 'Actor',
        usuario: 'actor',
        nivel_rol: activeRole,
        email: 'actor@example.test',
        activo: 1,
        session_version: 1
      };
    }
    if (String(query).includes('FROM clientes')) {
      return clientRecord;
    }
    return null;
  };
  db.run = async () => {
    runCalled = true;
    return { changes: 1 };
  };
  t.after(() => {
    db.get = originalGet;
    db.run = originalRun;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/clientes', clientesRouter);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign(
    { id: 21, nivel_rol: 'Asesor', session_version: 1 },
    process.env.JWT_SECRET
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/clientes`;

  const foreignRead = await fetch(`${baseUrl}/99`, { headers });
  assert.equal(foreignRead.status, 403);
  assert.doesNotMatch(JSON.stringify(await foreignRead.json()), /Cartera ajena/);

  const foreignMutation = await fetch(`${baseUrl}/desasociar`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ cliente_id: 99 })
  });
  assert.equal(foreignMutation.status, 403);
  assert.equal(runCalled, false);

  const foreignDisband = await fetch(`${baseUrl}/disolver-grupo`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ principal_id: 99 })
  });
  assert.equal(foreignDisband.status, 403);
  assert.equal(runCalled, false);

  clientRecord = { id: 99, asesor_id: 77, activo: 0, nombre: 'Cartera inactiva ajena' };
  const foreignReactivation = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ nombre: 'Cartera inactiva ajena' })
  });
  assert.equal(foreignReactivation.status, 403);
  assert.equal(runCalled, false);
  clientRecord = { id: 99, asesor_id: 77, activo: 1, nombre: 'Cartera ajena' };

  activeRole = 'Administrador';
  const adminToken = jwt.sign(
    { id: 21, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );
  const adminRead = await fetch(`${baseUrl}/99`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminRead.status, 200);

  activeRole = 'Coordinador';
  const coordinatorToken = jwt.sign(
    { id: 21, nivel_rol: 'Coordinador', session_version: 1 },
    process.env.JWT_SECRET
  );
  const coordinatorRead = await fetch(`${baseUrl}/99`, {
    headers: { Authorization: `Bearer ${coordinatorToken}` }
  });
  assert.equal(coordinatorRead.status, 200);

  activeRole = 'Almacen';
  const warehouseToken = jwt.sign(
    { id: 21, nivel_rol: 'Almacen', session_version: 1 },
    process.env.JWT_SECRET
  );
  const warehouseRead = await fetch(`${baseUrl}/99`, {
    headers: { Authorization: `Bearer ${warehouseToken}` }
  });
  assert.equal(warehouseRead.status, 403);
});

test('TDD-TC-029: superficies comerciales e inventario declaran política central', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const frontendSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');
  for (const prefix of [
    '/api/asesores',
    '/api/asignacion',
    '/api/cotizaciones',
    '/api/cuentas-clave',
    '/api/dashboard',
    '/api/metas',
    '/api/planificacion',
    '/api/programacion',
    '/api/reportes-etapa'
  ]) {
    assert.match(source, new RegExp(`['"]${prefix.replaceAll('/', '\\/')}['"]`));
  }
  assert.match(source, /app\.use\('\/api\/almacen', authenticateToken, requireRoles\(INVENTORY_ROLES\)\)/);
  assert.match(frontendSource, /['"]Session revoked['"]/);
});
