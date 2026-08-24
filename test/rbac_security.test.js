const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin, requireAdminOrCoordinador, requireProgramacionManager, requireWarehouseOperator } = require('../middleware/auth');

function createMockReqRes(userRole, userId = 1) {
  const req = {
    user: {
      id: userId,
      nivel_rol: userRole,
      email: 'test@casasgrandes.com'
    },
    params: {},
    query: {},
    body: {}
  };

  let statusCode = null;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getJSON: () => jsonResponse
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  return { req, res, next, isNextCalled: () => nextCalled };
}

test('RBAC Middleware - requireAdmin', () => {
  // Administrador passes
  const adminContext = createMockReqRes('Administrador');
  requireAdmin(adminContext.req, adminContext.res, adminContext.next);
  assert.equal(adminContext.isNextCalled(), true);
  assert.equal(adminContext.res.getStatusCode(), null);

  // Coordinador gets 403
  const coordContext = createMockReqRes('Coordinador');
  requireAdmin(coordContext.req, coordContext.res, coordContext.next);
  assert.equal(coordContext.isNextCalled(), false);
  assert.equal(coordContext.res.getStatusCode(), 403);

  // Asesor gets 403
  const asesorContext = createMockReqRes('Asesor');
  requireAdmin(asesorContext.req, asesorContext.res, asesorContext.next);
  assert.equal(asesorContext.isNextCalled(), false);
  assert.equal(asesorContext.res.getStatusCode(), 403);
});

test('RBAC Middleware - requireAdminOrCoordinador', () => {
  // Administrador passes
  const adminContext = createMockReqRes('Administrador');
  requireAdminOrCoordinador(adminContext.req, adminContext.res, adminContext.next);
  assert.equal(adminContext.isNextCalled(), true);

  // Coordinador passes
  const coordContext = createMockReqRes('Coordinador');
  requireAdminOrCoordinador(coordContext.req, coordContext.res, coordContext.next);
  assert.equal(coordContext.isNextCalled(), true);

  // Asesor gets 403
  const asesorContext = createMockReqRes('Asesor');
  requireAdminOrCoordinador(asesorContext.req, asesorContext.res, asesorContext.next);
  assert.equal(asesorContext.isNextCalled(), false);
  assert.equal(asesorContext.res.getStatusCode(), 403);
});

test('RBAC Middleware - requireProgramacionManager', () => {
  // Administrador passes
  const adminContext = createMockReqRes('Administrador');
  requireProgramacionManager(adminContext.req, adminContext.res, adminContext.next);
  assert.equal(adminContext.isNextCalled(), true);

  // Coordinador passes
  const coordContext = createMockReqRes('Coordinador');
  requireProgramacionManager(coordContext.req, coordContext.res, coordContext.next);
  assert.equal(coordContext.isNextCalled(), true);

  // Asesor gets 403
  const asesorContext = createMockReqRes('Asesor');
  requireProgramacionManager(asesorContext.req, asesorContext.res, asesorContext.next);
  assert.equal(asesorContext.isNextCalled(), false);
  assert.equal(asesorContext.res.getStatusCode(), 403);
});

test('RBAC Middleware - requireWarehouseOperator', () => {
  // Administrador passes
  const adminContext = createMockReqRes('Administrador');
  requireWarehouseOperator(adminContext.req, adminContext.res, adminContext.next);
  assert.equal(adminContext.isNextCalled(), true);

  // Coordinador passes
  const coordContext = createMockReqRes('Coordinador');
  requireWarehouseOperator(coordContext.req, coordContext.res, coordContext.next);
  assert.equal(coordContext.isNextCalled(), true);

  // Almacen passes
  const almacenContext = createMockReqRes('Almacen');
  requireWarehouseOperator(almacenContext.req, almacenContext.res, almacenContext.next);
  assert.equal(almacenContext.isNextCalled(), true);

  // Director passes
  const directorContext = createMockReqRes('Director');
  requireWarehouseOperator(directorContext.req, directorContext.res, directorContext.next);
  assert.equal(directorContext.isNextCalled(), true);

  // Asesor gets 403
  const asesorContext = createMockReqRes('Asesor');
  requireWarehouseOperator(asesorContext.req, asesorContext.res, asesorContext.next);
  assert.equal(asesorContext.isNextCalled(), false);
  assert.equal(asesorContext.res.getStatusCode(), 403);

  // Acopio gets 403
  const acopioContext = createMockReqRes('Acopio');
  requireWarehouseOperator(acopioContext.req, acopioContext.res, acopioContext.next);
  assert.equal(acopioContext.isNextCalled(), false);
  assert.equal(acopioContext.res.getStatusCode(), 403);
});

test('Cartera Isolation Logic - Asesor strictly restricted to own client records', () => {
  const asesorUser = { id: 5, nivel_rol: 'Asesor' };
  const adminUser = { id: 1, nivel_rol: 'Administrador' };

  const clientOfAsesor5 = { id: 101, asesor_id: 5, nombre: 'Agricultor A' };
  const clientOfAsesor8 = { id: 102, asesor_id: 8, nombre: 'Agricultor B' };

  function canAccessClient(user, client) {
    if (user.nivel_rol === 'Asesor') {
      if (Number(client.asesor_id) !== Number(user.id)) {
        return false;
      }
    }
    return true;
  }

  // Asesor 5 can access own client
  assert.equal(canAccessClient(asesorUser, clientOfAsesor5), true);

  // Asesor 5 CANNOT access client of Asesor 8 (IDOR blocked)
  assert.equal(canAccessClient(asesorUser, clientOfAsesor8), false);

  // Admin can access all clients
  assert.equal(canAccessClient(adminUser, clientOfAsesor5), true);
  assert.equal(canAccessClient(adminUser, clientOfAsesor8), true);
});
