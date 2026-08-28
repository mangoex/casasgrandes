const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const {
  createHealthHandlers,
  createReadinessCheck,
  requestContextMiddleware
} = require('../utils/observability');
const { createGracefulShutdown } = require('../utils/serverLifecycle');

function createResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.setHeader = (name, value) => {
    response.headers[name.toLowerCase()] = value;
  };
  response.status = statusCode => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = body => {
    response.body = body;
    return response;
  };
  return response;
}

test('TDD-TC-050: liveness no consulta DB y readiness no divulga fallos', async () => {
  let readinessCalls = 0;
  const healthy = createHealthHandlers({
    checkReadiness: async () => {
      readinessCalls += 1;
      return true;
    }
  });
  const liveResponse = createResponse();
  healthy.live({}, liveResponse);
  assert.equal(liveResponse.statusCode, 200);
  assert.deepEqual(liveResponse.body, { status: 'alive' });
  assert.equal(liveResponse.headers['cache-control'], 'no-store');
  assert.equal(readinessCalls, 0);

  const readyResponse = createResponse();
  await healthy.ready({}, readyResponse);
  assert.equal(readyResponse.statusCode, 200);
  assert.deepEqual(readyResponse.body, { status: 'ready' });
  assert.equal(readyResponse.headers['cache-control'], 'no-store');

  const degraded = createHealthHandlers({
    checkReadiness: async () => {
      throw new Error('postgres://secret@internal/database');
    }
  });
  const degradedResponse = createResponse();
  await degraded.ready({}, degradedResponse);
  assert.equal(degradedResponse.statusCode, 503);
  assert.deepEqual(degradedResponse.body, { status: 'degraded' });
  assert.doesNotMatch(JSON.stringify(degradedResponse.body), /secret|postgres/i);
});

test('TDD-TC-051: readiness falla dentro del timeout', async () => {
  const checkReadiness = createReadinessCheck({
    query: () => new Promise(() => {}),
    timeoutMs: 20
  });
  const startedAt = Date.now();

  await assert.rejects(checkReadiness(), /timed out/i);
  assert.ok(Date.now() - startedAt < 250);
});

test('TDD-TC-050: las sondas productivas responden por HTTP real', async t => {
  process.env.JWT_SECRET = 'test-only-secret-with-sufficient-length';
  const db = require('../db');
  const originalCheckReadiness = db.checkReadiness;
  let databaseReady = false;
  db.checkReadiness = async () => {
    if (!databaseReady) throw new Error('internal database detail');
    return true;
  };
  t.after(() => {
    db.checkReadiness = originalCheckReadiness;
  });

  const { app } = require('../server');
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const live = await fetch(`${baseUrl}/health/live`, {
    headers: { 'X-Request-ID': 'probe-live-001' }
  });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-request-id'), 'probe-live-001');
  assert.deepEqual(await live.json(), { status: 'alive' });

  const degraded = await fetch(`${baseUrl}/health/ready`);
  assert.equal(degraded.status, 503);
  assert.deepEqual(await degraded.json(), { status: 'degraded' });

  databaseReady = true;
  const ready = await fetch(`${baseUrl}/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready' });
});

test('TDD-TC-052: correlación valida el ID y excluye query y PII', () => {
  const messages = [];
  const middleware = requestContextMiddleware({
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    now: (() => {
      let value = 100;
      return () => (value += 7);
    })(),
    logger: { info: message => messages.push(message) }
  });

  const maliciousRequest = {
    method: 'GET',
    path: '/api/clientes',
    originalUrl: '/api/clientes?email=persona@example.test',
    get: name => name.toLowerCase() === 'x-request-id' ? 'bad id\ninjected' : undefined
  };
  const response = createResponse();
  middleware(maliciousRequest, response, () => {});
  response.statusCode = 204;
  response.emit('finish');

  assert.equal(response.headers['x-request-id'], '00000000-0000-4000-8000-000000000001');
  assert.equal(maliciousRequest.requestId, response.headers['x-request-id']);
  assert.equal(messages.length, 1);
  const event = JSON.parse(messages[0]);
  assert.deepEqual(event, {
    event: 'http_request_completed',
    request_id: '00000000-0000-4000-8000-000000000001',
    method: 'GET',
    path: '/api/clientes',
    status: 204,
    duration_ms: 7
  });
  assert.doesNotMatch(messages[0], /email|persona|injected/i);
});

test('TDD-TC-053: cierre repetido drena cada recurso una sola vez', async () => {
  const calls = [];
  const server = {
    close(callback) {
      calls.push('server.close');
      setImmediate(callback);
    },
    closeIdleConnections() {
      calls.push('server.closeIdleConnections');
    }
  };
  const shutdown = createGracefulShutdown({
    server,
    stopScheduler: async () => calls.push('scheduler.stop'),
    closeDatabase: async () => calls.push('database.close'),
    timeoutMs: 200,
    logger: { info() {}, error() {} }
  });

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(first, second);
  await first;

  assert.equal(calls.filter(value => value === 'server.close').length, 1);
  assert.equal(calls.filter(value => value === 'scheduler.stop').length, 1);
  assert.equal(calls.filter(value => value === 'database.close').length, 1);
  assert.ok(calls.indexOf('database.close') > calls.indexOf('server.close'));
  assert.ok(calls.indexOf('database.close') > calls.indexOf('scheduler.stop'));
});

test('TDD-TC-053: timeout de cierre activa salida fallida una sola vez', async () => {
  const exitCodes = [];
  const messages = [];
  const shutdown = createGracefulShutdown({
    server: { close() {} },
    stopScheduler: () => new Promise(() => {}),
    closeDatabase: async () => {},
    timeoutMs: 20,
    forceExit: code => exitCodes.push(code),
    logger: {
      info() {},
      error: message => messages.push(message)
    }
  });

  await assert.rejects(shutdown('SIGTERM'), /timed out/i);
  assert.deepEqual(exitCodes, [1]);
  assert.match(messages[0], /shutdown_timed_out/);
});

test('TDD-TC-053: un fallo de drenado aún intenta cerrar PostgreSQL', async () => {
  let databaseCloseCalls = 0;
  const shutdown = createGracefulShutdown({
    server: {
      close(callback) {
        callback(new Error('server drain failed'));
      }
    },
    stopScheduler: async () => {},
    closeDatabase: async () => {
      databaseCloseCalls += 1;
    },
    timeoutMs: 200,
    logger: { info() {}, error() {} }
  });

  await assert.rejects(shutdown('SIGTERM'), /server drain failed/);
  assert.equal(databaseCloseCalls, 1);
});

test('TDD-TC-054: servidor conecta sondas, señales y cierre del scheduler', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const agentSource = fs.readFileSync(path.join(__dirname, '..', 'agentsService.js'), 'utf8');

  assert.match(serverSource, /app\.get\(['"]\/health\/live['"]/);
  assert.match(serverSource, /app\.get\(['"]\/health\/ready['"]/);
  assert.match(serverSource, /process\.once\(['"]SIGTERM['"]/);
  assert.match(serverSource, /process\.once\(['"]SIGINT['"]/);
  assert.match(serverSource, /require\.main === module/);
  assert.match(agentSource, /async function stopBackgroundScheduler/);
  assert.match(agentSource, /stopBackgroundScheduler/);
});
