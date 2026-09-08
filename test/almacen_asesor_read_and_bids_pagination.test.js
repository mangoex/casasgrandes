const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test 1: INVENTORY_ROLES & Warehouse Mutation Guards
test('TDD-TC-096: INVENTORY_ROLES allows Asesor read access but blocks mutations', () => {
  const { INVENTORY_ROLES, ROLES, requireRoles } = require('../middleware/authorization');

  // Verify Asesor is in INVENTORY_ROLES so /api/almacen does not reject them perimetrally
  assert.ok(INVENTORY_ROLES.includes(ROLES.ADVISOR), 'INVENTORY_ROLES must include ROLES.ADVISOR (Asesor)');

  // Verify perimeter middleware allows Asesor
  const authMiddleware = requireRoles(INVENTORY_ROLES);
  let status = null;
  let nextCalled = false;
  const res = {
    status(code) { status = code; return this; },
    json() { return this; }
  };
  const req = { user: { id: 7, nivel_rol: 'Asesor' } };
  authMiddleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'Asesor must pass through requireRoles(INVENTORY_ROLES)');
  assert.equal(status, null);

  // Check server.js protects mutations against Asesor
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  // Ajuste stock requires Admin
  assert.match(
    serverContent,
    /app\.post\(\s*['"]\/api\/almacen\/existencias\/:productoId\/ajuste['"][\s\S]*?req\.user\.nivel_rol\s*!==\s*['"]Administrador['"]/,
    'POST /api/almacen/existencias/:productoId/ajuste must restrict to Administrador'
  );

  // Movimientos requires warehouse operator roles (excluding Asesor)
  assert.match(
    serverContent,
    /app\.post\(\s*['"]\/api\/almacen\/movimientos['"][\s\S]*?allowedWarehouseRoles/,
    'POST /api/almacen/movimientos must enforce allowedWarehouseRoles'
  );
});

// Test 2: Bids optimization & server filtering
test('TDD-TC-097: GET /api/asignacion/sin-asesor supports puja filtering', () => {
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  // Check server handles puja query parameter
  assert.match(
    serverContent,
    /app\.get\(\s*['"]\/api\/asignacion\/sin-asesor['"][\s\S]*?req\.query\.puja/,
    'server.js must check req.query.puja on /api/asignacion/sin-asesor'
  );

  assert.match(
    serverContent,
    /disponible_para_puja\s*=\s*1/,
    'server.js must filter disponible_para_puja = 1 when requested'
  );
});

// Test 3: Frontend pagination and search elements for bids
test('TDD-TC-097: public/index.html & public/js/app.js provide pagination & search for client bids', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  // index.html elements
  assert.ok(indexHtml.includes('id="bids-search-input"'), 'index.html must include #bids-search-input');
  assert.ok(indexHtml.includes('id="bids-count-badge"'), 'index.html must include #bids-count-badge');
  assert.ok(indexHtml.includes('id="bids-pagination"'), 'index.html must include #bids-pagination');

  // app.js calls optimized endpoint with puja=1
  assert.match(
    appJs,
    /\/api\/asignacion\/sin-asesor\?puja=1/,
    'app.js must fetch /api/asignacion/sin-asesor?puja=1 in loadClientBidsPool'
  );

  // app.js implements pagination for bids
  assert.match(
    appJs,
    /bidsCurrentPage|bidsPageSize/,
    'app.js must maintain bids pagination state'
  );
});
