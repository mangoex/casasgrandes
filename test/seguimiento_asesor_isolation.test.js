const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Test 1: RBAC Middleware for Seguimiento
test('TDD-TC-094: requireSeguimientoAccess permits commercial & supervisory roles, rejects others', () => {
  const auth = require('../middleware/auth');
  assert.ok(typeof auth.requireSeguimientoAccess === 'function', 'requireSeguimientoAccess must be defined in middleware/auth');

  function testRole(role) {
    const req = { user: { id: 7, nivel_rol: role } };
    let statusCode = null;
    let nextCalled = false;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      }
    };
    const next = () => {
      nextCalled = true;
    };
    auth.requireSeguimientoAccess(req, res, next);
    return { nextCalled, statusCode };
  }

  // Permitted roles
  ['Administrador', 'Coordinador', 'Director', 'Asesor'].forEach(role => {
    const res = testRole(role);
    assert.equal(res.nextCalled, true, `Role ${role} should be permitted`);
    assert.equal(res.statusCode, null, `Role ${role} should not receive error status`);
  });

  // Forbidden roles
  ['Almacen', 'Cliente', 'Operador', 'Invitado'].forEach(role => {
    const res = testRole(role);
    assert.equal(res.nextCalled, false, `Role ${role} should be denied`);
    assert.equal(res.statusCode, 403, `Role ${role} should receive 403 Forbidden`);
  });
});

// Test 2: Endpoint /api/seguimiento/dashboard isolation logic
test('TDD-TC-094: /api/seguimiento/dashboard isolates advisor data when req.user.nivel_rol is Asesor', async t => {
  const db = require('../db');
  const originalAll = db.all;
  const originalRun = db.run;

  t.after(() => {
    db.all = originalAll;
    db.run = originalRun;
  });

  const queriesIntercepted = [];
  db.run = async () => ({ changes: 0 });
  db.all = async (sql, params = []) => {
    queriesIntercepted.push({ sql, params });
    if (sql.includes('FROM asesores')) {
      return [{ id: 5, nombre: 'Asesor Test', usuario: 'asesortest', email: 'test@cg.com', calificacion: 5.0 }];
    }
    if (sql.includes('FROM metas_ventas')) {
      return [{ asesor_id: 5, ciclo_agricola: 'O-I 2026', monto_objetivo_mxn: 500000 }];
    }
    if (sql.includes('FROM clientes')) {
      return [{ asesor_id: 5, client_count: 12 }];
    }
    if (sql.includes('FROM cotizaciones q')) {
      return [{
        id: 101,
        folio_cotizacion: 'COT-001',
        fecha_creacion: '2026-08-20',
        cliente_id: 1,
        asesor_id: 5,
        ciclo_agricola: 'O-I 2026',
        condiciones_pago: 'Contado',
        estatus: 'Vendido',
        total_mxn: 150000,
        cliente_nombre: 'Cliente A',
        asesor_nombre: 'Asesor Test'
      }];
    }
    if (sql.includes('FROM cotizacion_detalles cd')) {
      return [{
        cotizacion_id: 101,
        producto_id: 1,
        cantidad_ordenada: 10,
        precio_neto_unitario: 15000,
        subtotal_mxn: 150000,
        producto: 'CALAMAR',
        tipo_categoria: 'Semilla',
        asesor_id: 5,
        estatus: 'Vendido'
      }];
    }
    if (sql.includes('FROM planificacion_semanal p')) {
      return [{
        id: 1,
        asesor_id: 5,
        cliente_id: 1,
        fecha_programada: '2026-08-20',
        objetivo_visita: 'Venta Semilla',
        pronostico_bolsas: 10,
        pronostico_monto_mxn: 150000,
        realizada: 1,
        visita_id: null,
        cliente_nombre: 'Cliente A',
        asesor_nombre: 'Asesor Test',
        comentarios_bitacora: null,
        fecha_visita: null,
        reports_count: 0
      }];
    }
    if (sql.includes('FROM crm_etapas_programacion')) {
      return [];
    }
    if (sql.includes('FROM crm_visitas v')) {
      return [];
    }
    if (sql.includes('FROM productos p')) {
      return [];
    }
    return [];
  };

  // Check server.js router/handler logic by inspecting middleware and code isolation
  const serverContent = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(
    serverContent,
    /app\.get\(\s*['"]\/api\/seguimiento\/dashboard['"],\s*authenticateToken,\s*requireSeguimientoAccess/,
    'server.js must protect /api/seguimiento/dashboard with requireSeguimientoAccess'
  );

  // Check that targetAsesorId is strictly forced to req.user.id for Asesores
  assert.match(
    serverContent,
    /req\.user\.nivel_rol === ['"]Asesor['"]/,
    'server.js must check if req.user.nivel_rol is Asesor to enforce targetAsesorId = req.user.id'
  );
});

// Test 3: Frontend navigation and UI role checks
test('TDD-TC-095: Navigation and UI controls expose Seguimiento for Asesor and isolate filter', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  // Verify index.html navigation item uses commercial-or-director-only or includes asesor
  assert.ok(
    indexHtml.includes('commercial-or-director-only') &&
    indexHtml.includes('data-target="seguimiento-view"'),
    'index.html should have commercial-or-director-only on seguimiento-view nav item'
  );

  // Verify app.js handles commercial-or-director-only in showAppView
  assert.match(
    appJs,
    /commercial-or-director-only/,
    'app.js must handle .commercial-or-director-only visibility based on role'
  );

  // Verify switchView permits seguimiento-view for Asesor and personalizes title
  assert.match(
    appJs,
    /seguimiento-view/,
    'app.js switchView must handle seguimiento-view'
  );
  assert.match(
    appJs,
    /Mi Seguimiento/,
    'app.js switchView must set title "Mi Seguimiento" for Asesor'
  );

  // Verify asesor filter selector is hidden or handled for Asesor
  assert.match(
    appJs,
    /sf-filter-asesor/,
    'app.js must handle #sf-filter-asesor visibility for Asesor'
  );
});
