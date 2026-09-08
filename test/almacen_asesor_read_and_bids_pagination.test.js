const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test 1: TDD-TC-098: INVENTORY_ROLES strictly excludes Asesor and rejects with 403 Forbidden
test('TDD-TC-098: INVENTORY_ROLES strictly excludes Asesor and rejects with 403 Forbidden', () => {
  const { INVENTORY_ROLES, ROLES, requireRoles } = require('../middleware/authorization');

  // Verify Asesor is NOT in INVENTORY_ROLES
  assert.equal(INVENTORY_ROLES.includes(ROLES.ADVISOR), false, 'INVENTORY_ROLES must NOT include ROLES.ADVISOR (Asesor)');

  // Verify perimeter middleware rejects Asesor with 403
  const authMiddleware = requireRoles(INVENTORY_ROLES);
  let status = null;
  let nextCalled = false;
  let responseJson = null;
  const res = {
    status(code) { status = code; return this; },
    json(data) { responseJson = data; return this; }
  };
  const reqAsesor = { user: { id: 7, nivel_rol: 'Asesor' } };
  authMiddleware(reqAsesor, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, 'Asesor must NOT pass through requireRoles(INVENTORY_ROLES)');
  assert.equal(status, 403, 'Asesor must receive HTTP 403 Forbidden');
  assert.deepEqual(responseJson, { error: 'Access denied for this role' });

  // Verify warehouse roles pass through
  let adminNext = false;
  authMiddleware({ user: { id: 1, nivel_rol: 'Administrador' } }, res, () => { adminNext = true; });
  assert.equal(adminNext, true, 'Administrador must pass through requireRoles(INVENTORY_ROLES)');

  let warehouseNext = false;
  authMiddleware({ user: { id: 2, nivel_rol: 'Almacen' } }, res, () => { warehouseNext = true; });
  assert.equal(warehouseNext, true, 'Almacen must pass through requireRoles(INVENTORY_ROLES)');

  // Check server.js protects /api/almacen with INVENTORY_ROLES
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(
    serverContent,
    /app\.use\(\s*['"]\/api\/almacen['"]\s*,\s*authenticateToken\s*,\s*requireRoles\(INVENTORY_ROLES\)\)/,
    'server.js must protect /api/almacen with requireRoles(INVENTORY_ROLES)'
  );
});

// Test 2: TDD-TC-099: public/index.html & public/js/app.js hide Almacen nav item for Asesor and redirect switchView
test('TDD-TC-099: public/index.html & public/js/app.js hide Almacen for Asesor and protect switchView', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  // Nav item for Almacen must have inventory-access-only class and display: none
  assert.match(
    indexHtml,
    /<li\s+class="nav-item\s+inventory-access-only"\s+data-target="almacen-view"\s+style="display:\s*none;"/,
    'index.html must restrict Almacen nav-item with inventory-access-only and display: none'
  );

  // almacen-view container must have inventory-access-only
  assert.match(
    indexHtml,
    /<div\s+id="almacen-view"\s+class="view-section\s+inventory-access-only"/,
    'index.html must mark #almacen-view with inventory-access-only'
  );

  // app.js handles inventory-access-only visibility check
  assert.match(
    appJs,
    /\.inventory-access-only/,
    'app.js must query .inventory-access-only to toggle visibility'
  );

  // app.js prevents Asesor from navigating to almacen-view in switchView
  assert.match(
    appJs,
    /viewId\s*===\s*['"]almacen-view['"][\s\S]*?user\.nivel_rol\s*===\s*['"]Asesor['"]/,
    'app.js must check user role and block switchView for almacen-view if Asesor'
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
