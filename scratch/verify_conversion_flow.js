const db = require('../db');

async function testConversionFlow() {
  console.log("=========================================");
  console.log("TESTING EDITING & CONVERT-TO-PROSPECT FLOW");
  console.log("=========================================");
  
  try {
    const adviserId = 1; // Osvaldo Bon López
    const clientId1 = 1; // A.A. DEL RIO SINALOA PONIENTE A.C.
    const clientId2 = 2; // Aarón Aumada
    const cycle = 'O-I 2026';
    
    console.log("Cleaning old test data...");
    await db.run("DELETE FROM planificacion_semanal WHERE objetivo_visita LIKE '%CONVERSION_TEST%'");
    await db.run("DELETE FROM cotizaciones WHERE notas LIKE '%CONVERSION_TEST%'");
    
    // 1. Insert a planning record
    console.log("\n1. Inserting test plan activity...");
    const dateStr = '2026-06-08';
    const scheduleResult = await db.run(`
      INSERT INTO planificacion_semanal (asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada)
      VALUES (?, ?, ?, 'Visita de prueba CONVERSION_TEST', 50, 150000.0, 0)
    `, [adviserId, clientId1, dateStr]);
    const planId = scheduleResult.id;
    console.log(`Created plan ID: ${planId}`);
    
    // 2. Edit (PUT) the planning record: change client_id, date, objective, and forecasts
    console.log("\n2. Simulating PUT request to update plan fields (including cliente_id)...");
    await db.run(`
      UPDATE planificacion_semanal
      SET cliente_id = ?,
          fecha_programada = ?,
          objetivo_visita = ?,
          pronostico_bolsas = ?,
          pronostico_monto_mxn = ?
      WHERE id = ?
    `, [clientId2, '2026-06-09', 'Visita actualizada CONVERSION_TEST', 100, 300000.0, planId]);
    
    const updatedPlan = await db.get("SELECT * FROM planificacion_semanal WHERE id = ?", [planId]);
    console.log("Updated Plan Record:", updatedPlan);
    
    if (updatedPlan.cliente_id === clientId2 && 
        updatedPlan.fecha_programada === '2026-06-09' && 
        updatedPlan.objetivo_visita === 'Visita actualizada CONVERSION_TEST' && 
        updatedPlan.pronostico_bolsas === 100 && 
        updatedPlan.pronostico_monto_mxn === 300000.0) {
      console.log("🟢 PUT Edit Plan fields verification: PASSED!");
    } else {
      console.error("🔴 PUT Edit Plan fields verification: FAILED!");
      process.exit(1);
    }
    
    // 3. Convert Plan to Prospect Quotation
    console.log("\n3. Converting updated plan to a draft quotation (Prospecto)...");
    const date = new Date();
    const prefix = `CG-TEST-${Math.floor(100000 + Math.random() * 900000)}`;
    const mesShort = date.toLocaleString('es-MX', { month: 'short' }).toUpperCase().slice(0, 3);
    const now = date.toISOString().slice(0, 10);
    
    const quoteResult = await db.run(`
      INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 'Creado automáticamente desde planificación semanal CONVERSION_TEST', NULL)
    `, [now, updatedPlan.cliente_id, updatedPlan.asesor_id, cycle, 'CONTADO', prefix, mesShort, 'Borrador', updatedPlan.pronostico_monto_mxn]);
    const quoteId = quoteResult.id;
    console.log(`Created quotation ID: ${quoteId} | Folio: ${prefix}`);
    
    // Update plan status to completed (realizada = 1)
    await db.run("UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?", [planId]);
    
    // Verify results
    const finalizedPlan = await db.get("SELECT * FROM planificacion_semanal WHERE id = ?", [planId]);
    const finalQuote = await db.get("SELECT * FROM cotizaciones WHERE id = ?", [quoteId]);
    
    console.log("Finalized Plan Record:", finalizedPlan);
    console.log("Generated Quote Record:", finalQuote);
    
    if (finalizedPlan.realizada === 1 && 
        finalQuote.estatus === 'Borrador' && 
        finalQuote.cliente_id === clientId2 && 
        finalQuote.total_mxn === 300000.0) {
      console.log("🟢 Convert to Prospecto verification: PASSED!");
    } else {
      console.error("🔴 Convert to Prospecto verification: FAILED!");
      process.exit(1);
    }
    
    console.log("\nCleaning up test data...");
    await db.run("DELETE FROM planificacion_semanal WHERE id = ?", [planId]);
    await db.run("DELETE FROM cotizaciones WHERE id = ?", [quoteId]);
    
    console.log("\n=========================================");
    console.log("   ALL CONVERSION TESTS PASSED!");
    console.log("=========================================");
    
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

testConversionFlow();
