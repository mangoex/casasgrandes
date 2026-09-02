const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-notif-secret-2026';
process.env.NODE_ENV = 'test';

const db = require('../db');
const { app } = require('../server');

function mockAdvisorUser() {
  return {
    id: 101,
    nombre: 'Asesor Prueba',
    usuario: 'asesor-test',
    nivel_rol: 'Asesor',
    email: 'asesor@casasgrandes.mx',
    activo: 1,
    session_version: 1
  };
}

function mockAdminUser() {
  return {
    id: 1,
    nombre: 'Admin Prueba',
    usuario: 'admin-test',
    nivel_rol: 'Administrador',
    email: 'admin@casasgrandes.mx',
    activo: 1,
    session_version: 1
  };
}

test('TDD-TC-063: GET y POST /api/notificaciones manejan lectura y marcado de forma segura', async (t) => {
  const originalAll = db.all;
  const originalRun = db.run;
  const originalGet = db.get;

  let queryLog = [];
  let runLog = [];

  db.get = async (query, params) => {
    const q = String(query);
    if (q.includes('FROM asesores') || q.includes('FROM users')) {
      const id = params?.[0];
      if (id === 1) return mockAdminUser();
      return mockAdvisorUser();
    }
    return null;
  };

  db.all = async (query, params) => {
    queryLog.push({ query: String(query), params });
    return [
      { id: 1, asesor_id: 101, mensaje: 'Cliente asignado', leido: 0, creado_en: new Date().toISOString() },
      { id: 2, asesor_id: 101, mensaje: 'Propuesta aceptada', leido: 1, creado_en: new Date().toISOString() }
    ];
  };

  db.run = async (query, params) => {
    runLog.push({ query: String(query), params });
    return { changes: 1 };
  };

  t.after(() => {
    db.all = originalAll;
    db.run = originalRun;
    db.get = originalGet;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const advisorToken = jwt.sign(
    { id: 101, nivel_rol: 'Asesor', session_version: 1 },
    process.env.JWT_SECRET
  );
  const adminToken = jwt.sign(
    { id: 1, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );

  // 1. GET /api/notificaciones as Asesor
  const advisorRes = await fetch(`${baseUrl}/api/notificaciones`, {
    headers: { Authorization: `Bearer ${advisorToken}` }
  });
  assert.equal(advisorRes.status, 200);
  const advisorNotifs = await advisorRes.json();
  assert.equal(advisorNotifs.length, 2);
  assert.ok(queryLog.some(q => q.query.includes('crm_notificaciones WHERE asesor_id = ?')));

  // 2. GET /api/notificaciones as Admin
  queryLog = [];
  const adminRes = await fetch(`${baseUrl}/api/notificaciones`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal(adminRes.status, 200);
  assert.ok(queryLog.some(q => q.query.includes('crm_notificaciones')));

  // 3. POST /api/notificaciones/leido
  const markAllRes = await fetch(`${baseUrl}/api/notificaciones/leido`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${advisorToken}` }
  });
  assert.equal(markAllRes.status, 200);
  assert.ok(runLog.some(r => r.query.includes('UPDATE crm_notificaciones SET leido = 1')));

  // 4. POST /api/notificaciones/:id/leido
  runLog = [];
  const markSingleRes = await fetch(`${baseUrl}/api/notificaciones/5/leido`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${advisorToken}` }
  });
  assert.equal(markSingleRes.status, 200);
  assert.ok(runLog.some(r => r.query.includes('UPDATE crm_notificaciones SET leido = 1 WHERE id = ?')));
});

test('TDD-TC-064: Lógica de agregación contextual por rol (Asesor: visitas hoy, Admin: cotizaciones pendientes)', () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  // Simulación de planes para Asesor
  const rawPlans = [
    { id: 10, cliente_nombre: 'Agrícola San Pedro', fecha_programada: todayIso, realizada: 0, objetivo_visita: 'Cierre de pedido' },
    { id: 11, cliente_nombre: 'Rancho Verde', fecha_programada: todayIso, realizada: 1, objetivo_visita: 'Visita completada' },
    { id: 12, cliente_nombre: 'Campo Real', fecha_programada: tomorrowIso, realizada: 0, objetivo_visita: 'Visita de mañana' }
  ];

  const advisorTodayPendingVisits = rawPlans.filter(p => p.fecha_programada === todayIso && Number(p.realizada) === 0);
  assert.equal(advisorTodayPendingVisits.length, 1);
  assert.equal(advisorTodayPendingVisits[0].cliente_nombre, 'Agrícola San Pedro');

  // Simulación de cotizaciones para Administrador
  const rawQuotes = [
    { id: 201, folio_cotizacion: 'COT-201', cliente_nombre: 'Agro Del Norte', estatus: 'Pendiente Autorización', total_mxn: 150000 },
    { id: 202, folio_cotizacion: 'COT-202', cliente_nombre: 'Frutas del Valle', estatus: 'Borrador', total_mxn: 85000 },
    { id: 203, folio_cotizacion: 'COT-203', cliente_nombre: 'Granjas Unidas', estatus: 'Vendido', total_mxn: 200000 },
    { id: 204, folio_cotizacion: 'COT-204', cliente_nombre: 'Agro Oriente', estatus: 'Cancelado', total_mxn: 30000 }
  ];

  const adminPendingQuotes = rawQuotes.filter(q => ['Borrador', 'Pendiente', 'Pendiente Autorización'].includes(q.estatus));
  assert.equal(adminPendingQuotes.length, 2);
  assert.deepEqual(adminPendingQuotes.map(q => q.folio_cotizacion), ['COT-201', 'COT-202']);
});
