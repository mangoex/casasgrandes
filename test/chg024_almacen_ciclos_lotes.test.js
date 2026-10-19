const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-chg024-32-chars-minimum!!';
process.env.NODE_ENV = 'test';

const { normalizeMovementItems, aggregateProductLotsStock } = require('../utils/almacen');

test('TDD-TC-107: normalizeMovementItems extrae y normaliza el campo manual ciclo/ciclo_agricola', () => {
  // 1. Multi-item payload con ciclo manual
  const multiItemBody = {
    tipo: 'Salida',
    items: [
      { producto_id: 1, lote: 'LOT-A', cantidad: 50, precio_venta: 100, ciclo: '  O-I 2026  ' },
      { producto_id: 2, lote: 'LOT-B', cantidad: 20, precio_venta: 200, ciclo_agricola: 'P-V 2026' },
      { producto_id: 3, lote: 'LOT-C', cantidad: 10, precio_venta: 300, ciclo: '' }
    ]
  };

  const normalized = normalizeMovementItems(multiItemBody);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].ciclo_agricola, 'O-I 2026');
  assert.equal(normalized[1].ciclo_agricola, 'P-V 2026');
  assert.equal(normalized[2].ciclo_agricola, null);

  // 2. Formato legado con 1 solo producto en raíz
  const legacyBody = {
    tipo: 'Salida',
    producto_id: 5,
    lote: 'LOT-LEGACY',
    cantidad: 15,
    ciclo: 'Ciclo Especial 2026'
  };

  const legacyNormalized = normalizeMovementItems(legacyBody);
  assert.equal(legacyNormalized.length, 1);
  assert.equal(legacyNormalized[0].ciclo_agricola, 'Ciclo Especial 2026');
});

test('TDD-TC-108: aggregateProductLotsStock desglosa existencias por lotes activos para cada producto', () => {
  const products = [
    { id: 1, producto: 'Hipopótamo', tipo_categoria: 'Semilla', activo: 1 },
    { id: 2, producto: 'A-7573 PONCHO', tipo_categoria: 'Híbrido', activo: 1 },
    { id: 3, producto: 'A-7573 ACCELERON', tipo_categoria: 'Híbrido', activo: 1 }
  ];

  const movements = [
    // Hipopótamo: Lote X (100 - 10 = 90), Lote Y (20 - 0 = 20), Lote Z (50 - 10 = 40), Lote Agotado (15 - 15 = 0)
    { producto_id: 1, lote: 'Lote X', tamano: 'PT1', cantidad_entrante: 100, cantidad_saliente: 10 },
    { producto_id: 1, lote: 'Lote Y', tamano: 'PT2', cantidad_entrante: 20, cantidad_saliente: 0 },
    { producto_id: 1, lote: 'Lote Z', tamano: 'PT1', cantidad_entrante: 50, cantidad_saliente: 10 },
    { producto_id: 1, lote: 'Lote Agotado', tamano: 'PT1', cantidad_entrante: 15, cantidad_saliente: 15 },

    // A-7573 PONCHO: Lote P1 (312 - 0 = 312)
    { producto_id: 2, lote: 'Lote P1', tamano: 'BT1', cantidad_entrante: 312, cantidad_saliente: 0 }

    // A-7573 ACCELERON: Sin movimientos (stock 0)
  ];

  const result = aggregateProductLotsStock(products, movements);
  assert.equal(result.length, 3);

  // Hipopótamo
  const hipo = result.find(p => p.id === 1);
  assert.ok(hipo);
  assert.equal(hipo.existencias, 150);
  assert.equal(hipo.lotes.length, 3);
  assert.equal(hipo.lotes[0].lote, 'Lote X');
  assert.equal(hipo.lotes[0].stock, 90);
  assert.equal(hipo.lotes[1].lote, 'Lote Y');
  assert.equal(hipo.lotes[1].stock, 20);
  assert.equal(hipo.lotes[2].lote, 'Lote Z');
  assert.equal(hipo.lotes[2].stock, 40);

  // A-7573 PONCHO
  const poncho = result.find(p => p.id === 2);
  assert.ok(poncho);
  assert.equal(poncho.existencias, 312);
  assert.equal(poncho.lotes.length, 1);
  assert.equal(poncho.lotes[0].lote, 'Lote P1');
  assert.equal(poncho.lotes[0].stock, 312);

  // A-7573 ACCELERON (sin stock)
  const accel = result.find(p => p.id === 3);
  assert.ok(accel);
  assert.equal(accel.existencias, 0);
  assert.equal(accel.lotes.length, 0);
});

test('TDD-TC-109: exportKardexToCSV y frontend incorporan Ciclo en Entradas exclusivamente por partida y fila de desglose de lotes', () => {
  const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');
  const indexHtmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');

  // 1. Debe incluir input manual de ciclo por renglón/partida (.move-item-ciclo) y NO en la cabecera (move-ciclo-entrada)
  assert.equal(/id=["']move-ciclo-entrada["']/.test(indexHtmlContent), false, 'index.html no debe contener el campo redundante move-ciclo-entrada en cabecera');
  assert.match(appJsContent, /move-item-ciclo/, 'app.js debe contener la clase move-item-ciclo en cada partida');

  // 2. exportKardexToCSV debe contener la columna Ciclo en su cabecera y en los datos
  assert.match(appJsContent, /Ciclo/, 'exportKardexToCSV debe incluir la columna Ciclo');
  assert.match(appJsContent, /ciclo_agricola/, 'exportKardexToCSV debe mapear ciclo_agricola');

  // 3. Renderizado de desglose de lotes en la tabla de inventario
  assert.match(appJsContent, /lot-breakdown-row|lotes-breakdown/, 'app.js debe renderizar el desglose de lotes');
});

test('TDD-TC-110: db.js y server.js garantizan migracion de almacen_movimientos.ciclo_agricola y autorrecuperacion ante error 42703', async () => {
  const dbJsPath = path.join(__dirname, '..', 'db.js');
  const dbJsContent = fs.readFileSync(dbJsPath, 'utf8');
  const serverJsPath = path.join(__dirname, '..', 'server.js');
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

  // 1. db.js debe exponer ensureWarehouseMovementsSchema y no bloquear la migración de almacen_movimientos por exigir cnt < 7 con metas_ventas preexistente
  assert.match(dbJsContent, /ensureWarehouseMovementsSchema/, 'db.js debe definir y exportar ensureWarehouseMovementsSchema');
  assert.equal(/parseInt\(tableCheck\.rows\[0\]\?\.cnt\s*\|\|\s*'0',\s*10\)\s*<\s*7/.test(dbJsContent), false, 'db.js no debe abortar todas las migraciones cuando falta una tabla secundaria como metas_ventas (cnt < 7)');

  // 2. server.js debe contar con autorrecuperación ante columna faltante en POST /api/almacen/movimientos
  assert.match(serverJsContent, /ensureWarehouseMovementsSchema/, 'server.js debe invocar ensureWarehouseMovementsSchema para autorrecuperar esquema de almacén');

  // 3. Prueba funcional HTTP de autorrecuperación ante error PostgreSQL 42703 ("column ciclo_agricola of relation almacen_movimientos does not exist")
  const jwt = require('jsonwebtoken');
  const db = require('../db');
  const { JWT_SECRET } = require('../middleware/auth');
  const { app } = require('../server');

  const origGet = db.get;
  const origTransaction = db.transaction;
  const origEnsureWarehouse = db.ensureWarehouseMovementsSchema;

  let txAttempts = 0;
  let schemaRepaired = false;

  db.get = async (sql) => {
    if (/FROM asesores/i.test(sql)) {
      return { id: 1, usuario: 'admin', nombre: 'Admin', nivel_rol: 'Administrador', activo: 1, session_version: 1 };
    }
    return null;
  };

  db.ensureWarehouseMovementsSchema = async () => {
    schemaRepaired = true;
  };

  db.transaction = async (cb) => {
    txAttempts += 1;
    if (txAttempts === 1 && !schemaRepaired) {
      const err = new Error('column "ciclo_agricola" of relation "almacen_movimientos" does not exist');
      err.code = '42703';
      throw err;
    }
    const mockTx = {
      get: async (sql) => {
        if (/FROM productos WHERE id/i.test(sql)) {
          return { id: 10, producto: 'Faena Fuerte Garrafa 10L', tipo_categoria: 'Agroquímicos', activo: 1 };
        }
        if (/SELECT existencias_resultantes FROM almacen_movimientos/i.test(sql)) {
          return { existencias_resultantes: 5120 };
        }
        if (/SUM\(COALESCE\(cantidad_entrante/i.test(sql)) {
          return { existencias: 5120 };
        }
        return null;
      },
      run: async () => ({ id: 99, changes: 1 })
    };
    return cb(mockTx);
  };

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    const token = jwt.sign({ id: 1, usuario: 'admin', nivel_rol: 'Administrador', session_version: 1 }, JWT_SECRET);
    const res = await fetch(`http://127.0.0.1:${port}/api/almacen/movimientos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        tipo: 'Salida',
        opcion_operacion: 'Contado',
        numero_remision: 'A3467',
        cliente_id: 1,
        items: [
          { producto_id: 10, lote: 'CHFF0421', cantidad: 10, precio_venta: 219, categoria: 'Agroquímicos' }
        ]
      })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.equal(schemaRepaired, true, 'Debe haber ejecutado ensureWarehouseMovementsSchema al detectar 42703');
    assert.equal(txAttempts, 2, 'Debe haber reintentado la transacción tras reparar el esquema');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.get = origGet;
    db.transaction = origTransaction;
    db.ensureWarehouseMovementsSchema = origEnsureWarehouse;
  }
});
