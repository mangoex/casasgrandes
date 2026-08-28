const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'test-only-chg009-secret';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { app } = require('../server');

function activeUser() {
  return {
    id: 1,
    nombre: 'Administrador de prueba',
    usuario: 'admin-test',
    nivel_rol: 'Administrador',
    email: 'admin@example.test',
    activo: 1,
    session_version: 1
  };
}

function quoteRecord(query) {
  const sql = String(query);
  if (sql.includes('FROM asesores')) return activeUser();
  if (sql.includes('FROM clientes')) return { id: 10, nombre: 'Cliente', asesor_id: 1, cuenta_clave_id: 1, activo: 1 };
  if (sql.includes('FROM cuentas_clave')) return { id: 1, tier_name: 'General', descuento_mxn: 0 };
  if (sql.includes('FROM temporadas')) return {
    id: 1,
    actividad: 'Temporada (Precio Lleno)',
    descuento_percentage: 0,
    estado_operacion: 'Sumar'
  };
  if (sql.includes('FROM productos')) return {
    id: 7,
    producto: 'Hipopótamo',
    tipo_categoria: 'Híbrido',
    list_price_mxn: 7015,
    base_usd: 0,
    descuento_fijo_quimicos: 0,
    descontar: 1,
    activo: 1
  };
  if (sql.includes('FROM crm_precios_mensuales')) {
    return { precio: 6300, promo_dinero: 1089, promo_porcentaje: 0 };
  }
  return null;
}

test('TDD-TC-057/058: rutas rechazan configuración y descuento fuera del presupuesto', async t => {
  const originalGet = db.get;
  const originalConnect = db.pool.connect;
  const originalTransaction = db.transaction;
  let connectCalled = false;
  let transactionCalled = false;

  db.get = async query => quoteRecord(query);
  db.pool.connect = async () => {
    connectCalled = true;
    throw new Error('No debe abrir conexión para configuración inválida');
  };
  db.transaction = async () => {
    transactionCalled = true;
    throw new Error('No debe iniciar transacción para descuento inválido');
  };
  t.after(() => {
    db.get = originalGet;
    db.pool.connect = originalConnect;
    db.transaction = originalTransaction;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign(
    { id: 1, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const invalidRows = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    precio: index === 7 ? 6300 : 7015,
    promo_dinero: index === 7 ? 500 : 0,
    promo_porcentaje: 0
  }));
  const invalidProgramming = await fetch(`${baseUrl}/api/programacion/precios`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ producto_id: 7, precios: invalidRows })
  });
  assert.equal(invalidProgramming.status, 400);
  assert.equal((await invalidProgramming.json()).code, 'monthly_discount_exceeds_promotion_cap');
  assert.equal(connectCalled, false);

  const quotePayload = {
    cliente_id: 10,
    ciclo_agricola: 'O-I 2026',
    condiciones_pago: 'CONTADO',
    temporada_id: 1,
    items: [{ producto_id: 7, cantidad: 1, descuento_aplicado: 375 }]
  };
  const invalidPreview = await fetch(`${baseUrl}/api/cotizaciones/calcular`, {
    method: 'POST',
    headers,
    body: JSON.stringify(quotePayload)
  });
  assert.equal(invalidPreview.status, 400);
  assert.equal((await invalidPreview.json()).code, 'advisor_discount_exceeds_available');

  const invalidCreation = await fetch(`${baseUrl}/api/cotizaciones`, {
    method: 'POST',
    headers,
    body: JSON.stringify(quotePayload)
  });
  assert.equal(invalidCreation.status, 400);
  assert.equal((await invalidCreation.json()).code, 'advisor_discount_exceeds_available');
  assert.equal(transactionCalled, false);
});

test('TDD-TC-058: previsualización devuelve precio mensual y saldo autorizado', async t => {
  const originalGet = db.get;
  db.get = async query => quoteRecord(query);
  t.after(() => {
    db.get = originalGet;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign(
    { id: 1, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/cotizaciones/calcular`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cliente_id: 10,
      temporada_id: 1,
      items: [{ producto_id: 7, cantidad: 1, descuento_aplicado: 374 }]
    })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.total_mxn, 5926);
  assert.equal(body.items[0].precio_lista, 6300);
  assert.equal(body.items[0].descuento_mensual_mxn, 715);
  assert.equal(body.items[0].max_discount_mxn, 374);
  assert.equal(body.items[0].precio_final, 5926);
});

test('TDD-TC-057: Programación válida persiste doce meses en una transacción', async t => {
  const originalGet = db.get;
  const originalConnect = db.pool.connect;
  const statements = [];
  let released = false;
  db.get = async query => quoteRecord(query);
  db.pool.connect = async () => ({
    async query(sql) {
      statements.push(String(sql).trim());
      return { rows: [] };
    },
    release() {
      released = true;
    }
  });
  t.after(() => {
    db.get = originalGet;
    db.pool.connect = originalConnect;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign(
    { id: 1, nivel_rol: 'Administrador', session_version: 1 },
    process.env.JWT_SECRET
  );
  const rows = Array.from({ length: 12 }, (_, index) => ({
    mes: index + 1,
    precio: index === 7 ? 6300 : 7015,
    promo_dinero: index === 7 ? 1089 : 0,
    promo_porcentaje: 0
  }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/programacion/precios`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ producto_id: 7, precios: rows })
  });
  assert.equal(response.status, 200);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.filter(sql => sql.startsWith('INSERT INTO crm_precios_mensuales')).length, 12);
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(released, true);
});
