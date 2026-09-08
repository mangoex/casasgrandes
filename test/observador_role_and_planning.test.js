const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test 1: TDD-TC-100: ROLES.OBSERVER defined and server rejects mutations
test('TDD-TC-100: ROLES.OBSERVER is defined and backend blocks mutations for Observador', () => {
  const { ROLES, COMMERCIAL_ROLES, INVENTORY_ROLES } = require('../middleware/authorization');

  // Verify ROLES.OBSERVER is defined
  assert.equal(ROLES.OBSERVER, 'Observador', 'ROLES.OBSERVER must be Observador');

  // Observador must NOT be in commercial mutation or inventory roles
  assert.equal(COMMERCIAL_ROLES.includes(ROLES.OBSERVER), false, 'COMMERCIAL_ROLES must not include Observador');
  assert.equal(INVENTORY_ROLES.includes(ROLES.OBSERVER), false, 'INVENTORY_ROLES must not include Observador');

  // Check server.js protects planning mutations against Observador
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

  // POST /api/planificacion blocks Observador
  assert.match(
    serverContent,
    /app\.post\(\s*['"]\/api\/planificacion['"][\s\S]*?req\.user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?403/,
    'POST /api/planificacion must block Observador with 403'
  );

  // PUT /api/planificacion/:id blocks Observador
  assert.match(
    serverContent,
    /app\.put\(\s*['"]\/api\/planificacion\/:id['"][\s\S]*?req\.user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?403/,
    'PUT /api/planificacion/:id must block Observador with 403'
  );

  // POST /api/planificacion/:id/convertir-prospecto blocks Observador
  assert.match(
    serverContent,
    /app\.post\(\s*['"]\/api\/planificacion\/:id\/convertir-prospecto['"][\s\S]*?req\.user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?403/,
    'POST /api/planificacion/:id/convertir-prospecto must block Observador with 403'
  );

  // POST /api/reportes-etapa blocks Observador
  assert.match(
    serverContent,
    /app\.post\(\s*['"]\/api\/reportes-etapa['"][\s\S]*?req\.user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?403/,
    'POST /api/reportes-etapa must block Observador with 403'
  );
});

// Test 2: TDD-TC-101: Planning UI exposes advisor filter and read-only mode for Observador
test('TDD-TC-101: public/index.html & public/js/app.js configure Planificacion UI for Observador', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  // plan-advisor-filter must be supported for Observador
  assert.match(
    appJs,
    /user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?plan-advisor-filter|['"]Observador['"][\s\S]*?loadPlanAdvisorOptions/,
    'app.js must load advisor options for Observador'
  );

  // Agendar Visita button must be hidden for Observador
  assert.match(
    appJs,
    /btn-open-plan-modal[\s\S]*?user\.nivel_rol\s*===\s*['"]Observador['"]|user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?btn-open-plan-modal/,
    'app.js must hide btn-open-plan-modal for Observador'
  );

  // Card actions (cerrar, prospecto, delete) must NOT render for Observador
  assert.match(
    appJs,
    /user\.nivel_rol\s*!==\s*['"]Observador['"]|user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?actions\s*=\s*['"]['"]/,
    'app.js must not render action buttons on cards for Observador'
  );

  // openEditPlanModal must configure read-only mode for Observador
  assert.match(
    appJs,
    /user\??\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?Solo Lectura|isReadOnly[\s\S]*?Observador/,
    'openEditPlanModal must set read-only mode for Observador'
  );

  // Default view on login for Observador must be planeacion-view
  assert.match(
    appJs,
    /user\.nivel_rol\s*===\s*['"]Observador['"][\s\S]*?planeacion-view/,
    'app.js must default Observador to planeacion-view on login'
  );
});

// Test 3: TDD-TC-102: User administration modal offers Observador role option
test('TDD-TC-102: Administration user modal includes Observador role option', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  assert.match(
    indexHtml,
    /<option\s+value=['"]Observador['"]/,
    'index.html #asesor-role select must contain option value="Observador"'
  );
});
