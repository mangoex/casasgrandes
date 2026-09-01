const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = 'test-only-nucle-secret';
process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { app } = require('../server');

function activeUser() {
  return {
    id: 1,
    nombre: 'Administrador',
    usuario: 'admin-nucle',
    nivel_rol: 'Administrador',
    activo: 1,
    session_version: 1
  };
}

function mockRecord(query, params = []) {
  const sql = String(query);
  if (sql.includes('FROM asesores')) return activeUser();
  if (sql.includes('FROM clientes')) return { id: 10, nombre: 'Cliente', asesor_id: 1, cuenta_clave_id: 1, activo: 1 };
  if (sql.includes('FROM cuentas_clave')) return { id: 1, tier_name: 'General', descuento_mxn: 0 };
  if (sql.includes('FROM temporadas')) return { id: 1, actividad: 'Temporada (Precio Lleno)', descuento_percentage: 0, estado_operacion: 'Sumar' };
  if (sql.includes('FROM crm_nucle_mensual')) return { mes: 9, porcentaje: 10 };
  if (sql.includes('FROM productos')) {
    const id = Number(params[0]);
    return id === 8
      ? { id: 8, producto: 'Herbicida', tipo_categoria: 'Agroquímico', list_price_mxn: 500, descontar: 0, activo: 1 }
      : { id: 7, producto: 'Semilla', tipo_categoria: 'Híbrido', list_price_mxn: 1000, descontar: 0, activo: 1 };
  }
  if (sql.includes('FROM crm_precios_mensuales')) {
    return Number(params[0]) === 8
      ? { precio: 500, promo_dinero: 0, promo_porcentaje: 0, tope_descuento_mxn: 0 }
      : { precio: 900, promo_dinero: 100, promo_porcentaje: 10, tope_descuento_mxn: 200 };
  }
  return null;
}

test('TDD-TC-083: Cotizador aplica Nucle a semillas aun con descuento completo del asesor', async t => {
  const originalGet = db.get;
  db.get = async (query, params) => mockRecord(query, params);
  t.after(() => { db.get = originalGet; });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign({ id: 1, nivel_rol: 'Administrador', session_version: 1 }, process.env.JWT_SECRET);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/cotizaciones/calcular`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cliente_id: 10,
      temporada_id: 1,
      nucle_aplicado: true,
      items: [
        { producto_id: 7, cantidad: 1, descuento_aplicado: 100 },
        { producto_id: 8, cantidad: 1, descuento_aplicado: 0 }
      ]
    })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.nucle_aplicado, true);
  assert.equal(body.nucle_porcentaje, 10);
  assert.equal(body.descuento_nucle_mxn, 90);
  assert.equal(body.items[0].descuento_nucle_unitario, 90);
  assert.equal(body.items[0].precio_final, 710);
  assert.equal(body.items[1].descuento_nucle_unitario, 0);
  assert.equal(body.total_mxn, 1210);
});

test('TDD-TC-084: esquema, Administración y Cotizador exponen el contrato Nucle', () => {
  const dbSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '..', 'public/js/app.js'), 'utf8');

  assert.match(dbSource, /crm_nucle_mensual/);
  assert.match(dbSource, /descuento_nucle_unitario/);
  assert.match(serverSource, /\/api\/admin\/nucle/);
  assert.match(index, /id="tab-admin-nucle"/);
  assert.match(index, /id="quote-nucle"/);
  assert.match(frontend, /nucle_aplicado/);
});

test('TDD-TC-085: Administración carga y guarda exactamente doce porcentajes Nucle', async t => {
  const originalGet = db.get;
  const originalAll = db.all;
  const originalTransaction = db.transaction;
  const writes = [];
  db.get = async (query, params) => mockRecord(query, params);
  db.all = async query => String(query).includes('crm_nucle_mensual')
    ? [{ mes: 1, porcentaje: 5 }]
    : [];
  db.transaction = async callback => callback({
    async run(sql, params) {
      writes.push({ sql: String(sql), params });
      return { changes: 1 };
    }
  });
  t.after(() => {
    db.get = originalGet;
    db.all = originalAll;
    db.transaction = originalTransaction;
  });

  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const token = jwt.sign({ id: 1, nivel_rol: 'Administrador', session_version: 1 }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const getResponse = await fetch(`${baseUrl}/api/admin/nucle`, { headers });
  assert.equal(getResponse.status, 200);
  const loaded = await getResponse.json();
  assert.equal(loaded.length, 12);
  assert.equal(loaded[0].porcentaje, 5);
  assert.equal(loaded[1].porcentaje, 0);

  const meses = Array.from({ length: 12 }, (_, index) => ({ mes: index + 1, porcentaje: index + 0.5 }));
  const putResponse = await fetch(`${baseUrl}/api/admin/nucle`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ meses })
  });
  assert.equal(putResponse.status, 200);
  assert.equal(writes.length, 12);
  assert.deepEqual(writes[8].params, [9, 8.5]);
});
