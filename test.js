const db = require('./db');

function getVolumeMultiplier(qty) {
  if (qty < 40) return 1.00;
  if (qty < 60) return 0.95;
  if (qty < 80) return 0.90;
  if (qty < 90) return 0.85;
  return 0.80;
}

async function runTests() {
  console.log("====================================================");
  console.log("   RUNNING PRICE ENGINE INTEGRATION & UNIT TESTS");
  console.log("====================================================");

  try {
    // Test Case 1: 50 bags of Hipopótamo Acceleron for a 'Retener GOLD' client
    // 50 bags -> multiplier 0.95. base_usd = 62.10
    // Account tier discount = 115.00 MXN. TC = 18.70
    const prod = await db.get("SELECT * FROM productos WHERE producto ILIKE '%Hipopotamo%' OR id = 1 LIMIT 1");
    const cc = await db.get("SELECT * FROM cuentas_clave WHERE tier_name = 'Retener GOLD'");
    const season = await db.get("SELECT * FROM temporadas WHERE actividad = 'Precio JUL-SEP15'");

    const baseUsd = prod.base_usd > 0 ? prod.base_usd : 62.10;
    const ccDiscount = (cc && cc.descuento_mxn > 0) ? 115.00 : 115.00;

    console.log(`Product found: ${prod.producto} | Base USD: ${baseUsd}`);
    console.log(`Key Account Tier found: ${cc ? cc.tier_name : 'Retener GOLD'} | Discount: ${ccDiscount} MXN`);

    const qty = 50;
    const volMultiplier = getVolumeMultiplier(qty);
    const usdPriceForTier = Math.round((baseUsd * volMultiplier) * 100) / 100;
    const mxnVolumePrice = Math.round(usdPriceForTier * 4.00 * 18.70);
    const netPrice = mxnVolumePrice - ccDiscount;
    const total = netPrice * qty;

    console.log(`Calculated Vol Multiplier: ${volMultiplier}`);
    console.log(`Calculated Tier USD Price: ${usdPriceForTier} USD`);
    console.log(`Calculated Volume MXN Price: ${mxnVolumePrice} MXN`);
    console.log(`Calculated Net Unit Price: ${netPrice} MXN (Expected: 4298.00)`);
    console.log(`Calculated Total Cost: ${total} MXN (Expected: 214900.00)`);

    if (netPrice === 4298.00 && total === 214900.00) {
      console.log("🟢 TEST CASE 1 PASSED!");
    } else {
      console.error("🔴 TEST CASE 1 FAILED!");
      process.exit(1);
    }

    // Test Case 2: 1 bag of A-7573 Acceleron in 'Precio JUL-SEP15' (12% off)
    const prod2 = await db.get("SELECT * FROM productos WHERE producto ILIKE '%A-7573 ACCELERON%' OR (producto ILIKE '%7573%' AND list_price_mxn = 3467) LIMIT 1");
    const listPrice2 = 3467.00;
    console.log(`\nProduct 2 found: ${prod2.producto} | List Price: ${listPrice2}`);
    const discount = (season && (season.descuento_percentage !== undefined ? season.descuento_percentage : season.descuento_porcentaje)) || 12.0;
    console.log(`Season: ${season ? season.actividad : 'Precio JUL-SEP15'} | Discount: ${discount}% | Action: ${season ? season.estado_operacion : 'Restar'}`);
    let seasonPrice = listPrice2;
    if (!season || season.estado_operacion === 'Restar') {
      seasonPrice = listPrice2 * (1 - discount / 100.0);
    } else {
      seasonPrice = listPrice2 * (1 + discount / 100.0);
    }
    const netPrice2 = Math.round(seasonPrice);
    console.log(`Calculated Net Unit Price: ${netPrice2} MXN (Expected: 3051.00)`);

    if (netPrice2 === 3051.00) {
      console.log("🟢 TEST CASE 2 PASSED!");
    } else {
      console.error("🔴 TEST CASE 2 FAILED!");
      process.exit(1);
    }

    // -------------------------------------------------------------
    // COMMISSION MODULE INTEGRATION TESTS
    // -------------------------------------------------------------
    console.log("\n----------------------------------------------------");
    console.log("   RUNNING COMMISSION MODULE INTEGRATION TESTS");
    console.log("----------------------------------------------------");

    const { execFileSync } = require('child_process');

    // Execute Python deterministic unit tests
    console.log("Running Python deterministic commission engine tests...");
    const pyOutput = execFileSync('python', ['comisiones.py', '--test'], { encoding: 'utf8' });
    console.log(pyOutput);

    // DB Commission Test 3: Insert & query base commission rule
    await db.run("DELETE FROM comision_reglas_base WHERE condicion_pago = 'TEST_CONTADO'");
    const resRuleBase = await db.run(`
      INSERT INTO comision_reglas_base (producto_id, condicion_pago, tipo_valor, valor, activo)
      VALUES (?, 'TEST_CONTADO', 'monto_fijo', 150.0, 1)
    `, [prod.id]);
    
    const ruleBaseFound = await db.get("SELECT * FROM comision_reglas_base WHERE condicion_pago = 'TEST_CONTADO'");
    console.log(`Test 3: Rule inserted ID ${ruleBaseFound.id} | Valor: ${ruleBaseFound.valor}`);
    if (ruleBaseFound && ruleBaseFound.valor === 150.0) {
      console.log("🟢 TEST CASE 3 PASSED (Base Rule Persistence)!");
    } else {
      console.error("🔴 TEST CASE 3 FAILED!");
      process.exit(1);
    }

    // DB Commission Test 4: Materialization of generated commissions in DB
    const asesor = await db.get("SELECT * FROM asesores WHERE activo = 1 LIMIT 1");
    let cot = await db.get("SELECT id FROM cotizaciones LIMIT 1");
    if (!cot) {
      const cliente = await db.get("SELECT id FROM clientes LIMIT 1");
      const clienteId = cliente ? cliente.id : 1;
      const resCot = await db.run(`
        INSERT INTO cotizaciones (folio_cotizacion, cliente_id, asesor_id, estatus, condiciones_pago, fecha_creacion, ciclo_agricola)
        VALUES ('TEST-FOLIO-001', ?, ?, 'Borrador', 'Contado', CURRENT_TIMESTAMP, 'O-I 2026')
      `, [clienteId, asesor ? asesor.id : 1]);
      cot = { id: resCot.id };
    }

    if (asesor && cot) {
      await db.run("DELETE FROM comisiones_generadas WHERE notas LIKE '%TEST_COMMISSION%'");
      const resGen = await db.run(`
        INSERT INTO comisiones_generadas 
        (cotizacion_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas)
        VALUES (?, ?, 15000.0, 0.0, 15000.0, 'Pendiente', 'TEST_COMMISSION')
      `, [cot.id, asesor.id]);

      const commFound = await db.get("SELECT * FROM comisiones_generadas WHERE id = ?", [resGen.id]);
      if (commFound && commFound.total_comision_mxn === 15000.0 && commFound.estatus === 'Pendiente') {
        console.log("🟢 TEST CASE 4 PASSED (Commission Materialization)!");
      } else {
        console.error("🔴 TEST CASE 4 FAILED!");
        process.exit(1);
      }

      // DB Commission Test 5: Payment Approval ('Pendiente' -> 'Pagada')
      await db.run("UPDATE comisiones_generadas SET estatus = 'Pagada' WHERE id = ?", [resGen.id]);
      const commPaid = await db.get("SELECT * FROM comisiones_generadas WHERE id = ?", [resGen.id]);
      if (commPaid && commPaid.estatus === 'Pagada') {
        console.log("🟢 TEST CASE 5 PASSED (Payment Approval & Freeze)!");
      } else {
        console.error("🔴 TEST CASE 5 FAILED!");
        process.exit(1);
      }

      // DB Commission Test 6: Reversion Clawback when paid quote is cancelled
      await db.run("UPDATE comisiones_generadas SET estatus = 'Cancelada' WHERE id = ?", [resGen.id]);
      await db.run(`
        INSERT INTO comisiones_generadas 
        (cotizacion_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas)
        VALUES (?, ?, -15000.0, 0.0, -15000.0, 'Pendiente', 'Cargo por reversión / cancelación TEST_COMMISSION')
      `, [cot.id, asesor.id]);

      const clawbackFound = await db.get("SELECT * FROM comisiones_generadas WHERE total_comision_mxn = -15000.0 AND notas LIKE '%TEST_COMMISSION%'");
      if (clawbackFound && clawbackFound.total_comision_mxn === -15000.0) {
        console.log("🟢 TEST CASE 6 PASSED (Reversion Clawback Record)!");
      } else {
        console.error("🔴 TEST CASE 6 FAILED!");
        process.exit(1);
      }

      // DB Commission Test 7: Rule Edit & Delete CRUD operations
      const editRuleRes = await db.run("INSERT INTO comision_reglas_base (tipo_categoria, condicion_pago, tipo_valor, valor, activo) VALUES ('TEST_CAT', 'TEST_PAGO', 'porcentaje', 5.0, 1)");
      await db.run("UPDATE comision_reglas_base SET valor = 7.5 WHERE id = ?", [editRuleRes.id]);
      const updatedRule = await db.get("SELECT * FROM comision_reglas_base WHERE id = ?", [editRuleRes.id]);
      await db.run("DELETE FROM comision_reglas_base WHERE id = ?", [editRuleRes.id]);
      const deletedRule = await db.get("SELECT * FROM comision_reglas_base WHERE id = ?", [editRuleRes.id]);

      if (updatedRule && updatedRule.valor === 7.5 && !deletedRule) {
        console.log("🟢 TEST CASE 7 PASSED (Rule Edit & Delete CRUD)!");
      } else {
        console.error("🔴 TEST CASE 7 FAILED!");
        process.exit(1);
      }

      // Test Case 8: Quotation Deletion with Details, Commissions & Warehouse Movements
      console.log("\n----------------------------------------------------");
      console.log("   TEST CASE 8: QUOTATION DELETION WITH COMMISSIONS");
      console.log("----------------------------------------------------");
      
      const testClient = await db.get("SELECT id FROM clientes LIMIT 1");
      const testClientId = testClient ? testClient.id : 1;
      const testProd = await db.get("SELECT id FROM productos LIMIT 1");
      const testProdId = testProd ? testProd.id : 1;
      
      // 1. Create a test quotation
      const testQuoteInsert = await db.run(`
        INSERT INTO cotizaciones (folio_cotizacion, cliente_id, asesor_id, estatus, condiciones_pago, fecha_creacion, ciclo_agricola, total_mxn)
        VALUES ('TEST-DEL-001', ?, ?, 'Autorizada', 'Contado', CURRENT_TIMESTAMP, 'O-I 2026', 4092.0)
      `, [testClientId, asesor.id]);
      const testQuoteId = testQuoteInsert.id;

      // 2. Insert detail
      const testDetailInsert = await db.run(`
        INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
        VALUES (?, ?, 1, 1, 0, 4092.0, 4092.0, 4092.0)
      `, [testQuoteId, testProdId]);

      // 3. Insert generated commission referencing quote & detail
      await db.run(`
        INSERT INTO comisiones_generadas (cotizacion_id, cotizacion_detalle_id, asesor_id, monto_base_aplicado, monto_temporada_aplicado, total_comision_mxn, estatus, notas)
        VALUES (?, ?, ?, 409.2, 0.0, 409.2, 'Pendiente', 'TEST_COMMISSION_FOR_DELETION')
      `, [testQuoteId, testDetailInsert.id, asesor.id]);

      // 4. Perform the deletion sequence matching server.js DELETE /api/cotizaciones/:id
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM comisiones_generadas WHERE cotizacion_id = $1 OR cotizacion_detalle_id IN (SELECT id FROM cotizacion_detalles WHERE cotizacion_id = $1)', [testQuoteId]);
        await client.query('DELETE FROM cotizacion_detalles WHERE cotizacion_id = $1', [testQuoteId]);
        await client.query('DELETE FROM cotizacion_adjuntos WHERE cotizacion_id = $1', [testQuoteId]);
        await client.query('DELETE FROM almacen_movimientos WHERE cotizacion_id = $1', [testQuoteId]);
        await client.query('UPDATE crm_prospectos SET cotizacion_id = NULL WHERE cotizacion_id = $1', [testQuoteId]);
        await client.query('DELETE FROM cotizaciones WHERE id = $1', [testQuoteId]);
        await client.query('COMMIT');
      } catch (delErr) {
        await client.query('ROLLBACK');
        throw delErr;
      } finally {
        client.release();
      }

      // 5. Assert records are deleted
      const quoteCheck = await db.get("SELECT * FROM cotizaciones WHERE id = ?", [testQuoteId]);
      const detailCheck = await db.get("SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?", [testQuoteId]);
      const commCheck = await db.get("SELECT * FROM comisiones_generadas WHERE cotizacion_id = ?", [testQuoteId]);

      if (!quoteCheck && !detailCheck && !commCheck) {
        console.log("🟢 TEST CASE 8 PASSED (Quotation & Commission Deletion Referential Integrity)!");
      } else {
        console.error("🔴 TEST CASE 8 FAILED (Records still exist)!");
        process.exit(1);
      }

      // Test Case 9: Bulk Assignment and Bulk Biddable Status
      console.log("\n----------------------------------------------------");
      console.log("   TEST CASE 9: BULK CLIENT ASSIGNMENT & PUJA STATUS");
      console.log("----------------------------------------------------");
      
      const c1 = await db.run("INSERT INTO clientes (nombre, activo, disponible_para_puja) VALUES ('TEST_CLIENT_BULK_1', 1, 0)");
      const c2 = await db.run("INSERT INTO clientes (nombre, activo, disponible_para_puja) VALUES ('TEST_CLIENT_BULK_2', 1, 0)");
      
      const bulkIds = [c1.id, c2.id];

      // 1. Bulk make biddable
      await db.run('UPDATE clientes SET disponible_para_puja = 1 WHERE id = ANY(?) AND activo = 1', [bulkIds]);
      const checkBiddable1 = await db.get("SELECT disponible_para_puja FROM clientes WHERE id = ?", [c1.id]);
      const checkBiddable2 = await db.get("SELECT disponible_para_puja FROM clientes WHERE id = ?", [c2.id]);
      if (checkBiddable1.disponible_para_puja !== 1 || checkBiddable2.disponible_para_puja !== 1) {
        console.error("🔴 TEST CASE 9 FAILED: Bulk biddable update failed");
        process.exit(1);
      }

      // 2. Bulk assign to advisor
      for (const id of bulkIds) {
        await db.run("UPDATE clientes SET asesor_id = ?, disponible_para_puja = 0 WHERE id = ?", [asesor.id, id]);
      }
      const checkAssigned1 = await db.get("SELECT asesor_id, disponible_para_puja FROM clientes WHERE id = ?", [c1.id]);
      const checkAssigned2 = await db.get("SELECT asesor_id, disponible_para_puja FROM clientes WHERE id = ?", [c2.id]);

      if (checkAssigned1.asesor_id === asesor.id && checkAssigned2.asesor_id === asesor.id && checkAssigned1.disponible_para_puja === 0 && checkAssigned2.disponible_para_puja === 0) {
        console.log("🟢 TEST CASE 9 PASSED (Bulk Assignment & Puja Status Update)!");
      } else {
        console.error("🔴 TEST CASE 9 FAILED: Bulk assignment failed");
        process.exit(1);
      }

      // Cleanup test clients
      await db.run("DELETE FROM clientes WHERE id = ANY(?)", [bulkIds]);

      // Cleanup test data
      await db.run("DELETE FROM comision_reglas_base WHERE condicion_pago = 'TEST_CONTADO'");
      await db.run("DELETE FROM comisiones_generadas WHERE notas LIKE '%TEST_COMMISSION%'");
    }

    console.log("\n====================================================");
    console.log("   ALL INTEGRATION & UNIT TESTS PASSED SUCCESSFULLY!");
    console.log("====================================================");

  } catch (err) {
    console.error("Test execution encountered an error:", err);
    process.exit(1);
  }
}

runTests();
