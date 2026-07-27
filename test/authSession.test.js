const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'test-only-secret-with-sufficient-length';
process.env.NODE_ENV = 'test';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const authRouter = require('../routes/auth');

test('TDD-TC-019/020/028: login, cookie, logout revocable y Bearer funcionan por HTTP', async t => {
  const originalGet = db.get;
  const originalRun = db.run;
  let sessionVersion = 1;
  const password = 'Unica-y-segura-2026';
  const passwordHash = await bcrypt.hash(password, 4);
  db.get = async () => ({
    id: 7,
    nombre: 'Asesora Prueba',
    usuario: 'asesora.prueba',
    nivel_rol: 'Asesor',
    email: 'asesora@example.test',
    telefono: null,
    password_hash: passwordHash,
    activo: 1,
    session_version: sessionVersion
  });
  db.run = async query => {
    if (String(query).includes('session_version')) sessionVersion += 1;
    return { changes: 1 };
  };
  t.after(() => {
    db.get = originalGet;
    db.run = originalRun;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail: 'asesora.prueba', password })
  });

  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json();
  assert.equal(loginBody.user.id, 7);
  assert.equal(Object.hasOwn(loginBody, 'token'), false);

  const setCookie = loginResponse.headers.get('set-cookie');
  assert.match(setCookie, /^auth_token=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);

  const cookie = setCookie.split(';', 1)[0];
  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie }
  });
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).user.id, 7);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(logoutResponse.status, 204);
  assert.match(logoutResponse.headers.get('set-cookie'), /^auth_token=;/);

  const revokedResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: cookie }
  });
  assert.equal(revokedResponse.status, 403);

  const bearerResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'bearer'
    },
    body: JSON.stringify({ usernameOrEmail: 'asesora.prueba', password })
  });
  const bearerBody = await bearerResponse.json();
  assert.equal(bearerResponse.status, 200);
  assert.equal(typeof bearerBody.token, 'string');
  assert.equal(bearerResponse.headers.get('set-cookie'), null);
});
