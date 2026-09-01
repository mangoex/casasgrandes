const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

test('TDD-TC-042: ventana limita, expira y acota cardinalidad', () => {
  const { createFixedWindowStore } = require('../utils/rateLimiter');
  let now = 1_000;
  const store = createFixedWindowStore({
    windowMs: 10_000,
    maxAttempts: 2,
    maxEntries: 2,
    now: () => now
  });

  assert.equal(store.consume('actor-a').allowed, true);
  assert.equal(store.consume('actor-a').allowed, true);
  const blocked = store.consume('actor-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 10);

  now = 11_001;
  assert.equal(store.consume('actor-a').allowed, true);
  store.consume('actor-b');
  assert.equal(store.consume('actor-c').allowed, false);
  assert.equal(store.size, 2);
});

test('TDD-TC-043: identificadores de login se seudonimizan', () => {
  const { hashRateLimitKey } = require('../utils/rateLimiter');
  const identifier = 'Persona.Real@Example.test';
  const first = hashRateLimitKey(identifier);
  const second = hashRateLimitKey(identifier.toLowerCase());

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /persona|example/i);
});

test('TDD-TC-044: parser grande requiere autenticación y el general usa 1 MiB', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(
    source,
    /app\.use\(\s*['"]\/api\/cotizaciones\/:id\/adjuntos['"],\s*authenticateToken,\s*express\.json\(\{\s*limit:\s*['"]12mb['"]/
  );
  assert.match(source, /app\.use\(express\.json\(\{\s*limit:\s*['"]1mb['"]\s*\}\)\)/);
  assert.match(source, /err\.type === ['"]entity\.too\.large['"][\s\S]{0,180}status\(413\)\.json/);
});

test('TDD-TC-045: CSP, HSTS, aislamiento y proxy son explícitos', () => {
  const { buildSecurityHeaders, parseTrustProxyHops } = require('../utils/httpSecurity');
  const production = buildSecurityHeaders({ production: true });
  const development = buildSecurityHeaders({ production: false });

  assert.match(production['Content-Security-Policy'], /script-src 'self';/);
  assert.match(production['Content-Security-Policy'], /script-src-attr 'unsafe-inline'/);
  assert.doesNotMatch(production['Content-Security-Policy'], /script-src 'self' 'unsafe-inline'/);
  assert.equal(production['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(development['Strict-Transport-Security'], undefined);
  assert.equal(production['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(production['Cross-Origin-Resource-Policy'], 'same-origin');

  assert.equal(parseTrustProxyHops(undefined), 0);
  assert.equal(parseTrustProxyHops('2'), 2);
  assert.equal(parseTrustProxyHops('true'), 0);
  assert.equal(parseTrustProxyHops('6'), 0);
});

test('TDD-TC-045: login conecta ambos límites productivos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  assert.match(source, /router\.post\(['"]\/login['"],\s*loginIpLimiter,\s*loginAccountLimiter/);
  assert.match(source, /identifier\.length > 254/);
  assert.match(source, /password\.length > 256/);
});

test('TDD-TC-042: login productivo responde 429 antes de consultar nuevamente la cuenta', async t => {
  process.env.JWT_SECRET = 'test-only-secret-with-sufficient-length';
  const express = require('express');
  const bcrypt = require('bcryptjs');
  const db = require('../db');
  const authRouter = require('../routes/auth');
  const originalGet = db.get;
  const passwordHash = await bcrypt.hash('Credencial-correcta-2026', 4);
  let accountLookups = 0;
  db.get = async () => {
    accountLookups += 1;
    return {
      id: 91,
      password_hash: passwordHash,
      activo: 1,
      session_version: 1
    };
  };
  t.after(() => {
    db.get = originalGet;
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

  const endpoint = `http://127.0.0.1:${server.address().port}/api/auth/login`;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'rate-limit@example.test',
        password: 'incorrecta'
      })
    });
    assert.equal(response.status, 401);
  }

  const blocked = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernameOrEmail: 'rate-limit@example.test',
      password: 'incorrecta'
    })
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get('retry-after'), /^\d+$/);
  assert.equal(accountLookups, 10);
});
