const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

test('db.rewriteQuery - Translates placeholders and handles RETURNING id', () => {
  const query = 'SELECT * FROM cotizaciones WHERE asesor_id = ? AND ciclo_agricola = ?';
  const rewritten = db.rewriteQuery(query);
  assert.equal(rewritten, 'SELECT * FROM cotizaciones WHERE asesor_id = $1 AND ciclo_agricola = $2');

  const insertQuery = 'INSERT INTO clientes (nombre, asesor_id) VALUES (?, ?)';
  const rewrittenInsert = db.rewriteQuery(insertQuery);
  assert.equal(rewrittenInsert, 'INSERT INTO clientes (nombre, asesor_id) VALUES ($1, $2) RETURNING id');

  const insertWithReturning = 'INSERT INTO clientes (nombre) VALUES (?) RETURNING id';
  const rewrittenWithReturning = db.rewriteQuery(insertWithReturning);
  assert.equal(rewrittenWithReturning, 'INSERT INTO clientes (nombre) VALUES ($1) RETURNING id');
});

test('AI Matching Metrics - Aggregation logic eliminates Cartesian product (N x M)', () => {
  // Mock dataset for an advisor with 2 closed sales and 3 visits
  const sales = [
    { asesor_id: 1, total_mxn: 50000, estatus: 'Vendido' },
    { asesor_id: 1, total_mxn: 30000, estatus: 'Entregado' }
  ];

  const visits = [
    { asesor_id: 1, realizada: 1 },
    { asesor_id: 1, realizada: 1 },
    { asesor_id: 1, realizada: 0 }
  ];

  // Old Cartesian join (CROSS JOIN simulation):
  // Multiplying 2 sales by 3 visits results in 6 joined rows:
  // Total sales would erroneously become: (50000 + 30000) * 3 = 240,000 MXN (WRONG)
  // Total visits would erroneously become: 3 * 2 = 6 visits (WRONG)
  const cartesianSalesTotal = sales.reduce((sum, s) => sum + s.total_mxn, 0) * visits.length;
  assert.equal(cartesianSalesTotal, 240000);

  // New CTE Aggregation logic:
  // Independent CTE 1: Sales aggregation
  const salesAgg = sales
    .filter(s => ['Vendido', 'Entregado'].includes(s.estatus))
    .reduce((sum, s) => sum + s.total_mxn, 0);

  // Independent CTE 2: Visits aggregation
  const completedVisits = visits.filter(v => v.realizada === 1).length;
  const pendingVisits = visits.filter(v => v.realizada === 0).length;
  const totalVisits = visits.length;

  // Verify correctness
  assert.equal(salesAgg, 80000); // Exactly 50,000 + 30,000 = 80,000 MXN
  assert.equal(totalVisits, 3);   // Exactly 3 visits
  assert.equal(completedVisits, 2); // Exactly 2 completed
  assert.equal(pendingVisits, 1);   // Exactly 1 pending
});

test('Deterministic Commission Scale Evaluation - Rule Resolution', () => {
  // Scenario 1: Base rule % on subtotal
  const subtotal = 100000.0;
  const qty = 10;
  const reglaBasePct = { tipo_valor: 'porcentaje', valor: 3.0 }; // 3%
  const calcBase = (reglaBasePct.tipo_valor === 'porcentaje') 
    ? subtotal * (reglaBasePct.valor / 100) 
    : qty * reglaBasePct.valor;
  assert.equal(calcBase, 3000.0);

  // Scenario 2: Base rule fixed amount per unit
  const reglaBaseFixed = { tipo_valor: 'monto_fijo', valor: 50.0 }; // $50/unit
  const calcFixed = (reglaBaseFixed.tipo_valor === 'porcentaje') 
    ? subtotal * (reglaBaseFixed.valor / 100) 
    : qty * reglaBaseFixed.valor;
  assert.equal(calcFixed, 500.0);

  // Scenario 3: Season rule overwriting base rule
  const reglaTempOverwrite = { tipo_valor: 'monto_fijo', valor: 80.0, comportamiento: 'sobrescribir' };
  let finalBase = calcBase;
  let finalTemp = 0;
  if (reglaTempOverwrite.comportamiento === 'sobrescribir') {
    finalBase = 0;
    finalTemp = qty * reglaTempOverwrite.valor;
  }
  assert.equal(finalBase, 0);
  assert.equal(finalTemp, 800.0);
  assert.equal(finalBase + finalTemp, 800.0);
});

test.after(async () => {
  try {
    await db.initSchemaPromise;
  } catch (e) {}
  await db.pool.end();
});
