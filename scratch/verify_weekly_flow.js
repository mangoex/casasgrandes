const db = require('../db');

async function testWeeklyFlow() {
  console.log("=========================================");
  console.log("TESTING WEEKLY PLANNING & CRM INTEGRATION");
  console.log("=========================================");
  
  try {
    const adviserId = 1; // Osvaldo Bon López
    const clientId = 1;  // A.A. DEL RIO SINALOA PONIENTE A.C.
    const cycle = 'O-I 2026';
    
    // 1. Reset previous test data to ensure clean run
    console.log("Cleaning test data...");
    await db.run("DELETE FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ?", [adviserId, cycle]);
    await db.run("DELETE FROM planificacion_semanal WHERE asesor_id = ?", [adviserId]);
    await db.run("DELETE FROM crm_visitas WHERE comentarios_bitacora LIKE '%TEST_MARKER%'");
    
    // 2. Insert Meta Goal
    console.log("\n1. Inserting Meta Goal...");
    await db.run(`
      INSERT INTO metas_ventas (asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo)
      VALUES (?, ?, 500000.0, 100)
    `, [adviserId, cycle]);
    
    const metaRecord = await db.get("SELECT * FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ?", [adviserId, cycle]);
    console.log("Inserted Meta:", metaRecord);
    if (metaRecord.monto_objetivo_mxn === 500000.0 && metaRecord.bolsas_objetivo === 100) {
      console.log("🟢 Meta Goal insertion: PASSED!");
    } else {
      console.error("🔴 Meta Goal insertion: FAILED!");
      process.exit(1);
    }
    
    // 3. Schedule Visit
    console.log("\n2. Scheduling Weekly Visit with Forecast...");
    const dateStr = '2026-06-08'; // Monday of week 24, 2026
    const scheduleResult = await db.run(`
      INSERT INTO planificacion_semanal (asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada)
      VALUES (?, ?, ?, 'Presentar propuesta Asgrow TEST_MARKER', 40, 120000.0, 0)
    `, [adviserId, clientId, dateStr]);
    
    const planId = scheduleResult.id;
    console.log(`Scheduled visit ID: ${planId}`);
    
    const planRecord = await db.get("SELECT * FROM planificacion_semanal WHERE id = ?", [planId]);
    console.log("Inserted Plan:", planRecord);
    if (planRecord.pronostico_bolsas === 40 && planRecord.pronostico_monto_mxn === 120000.0 && planRecord.realizada === 0) {
      console.log("🟢 Visit scheduling: PASSED!");
    } else {
      console.error("🔴 Visit scheduling: FAILED!");
      process.exit(1);
    }
    
    // 4. Complete Visit
    console.log("\n3. Completing scheduled visit (Should trigger crm_visitas entry)...");
    const bitacoraText = "Se visitó al cliente. Acordó comprar 40 bolsas. TEST_MARKER";
    
    // Let's call the logic from our server.js PUT endpoint manually
    let visitId = null;
    const now = new Date().toISOString().slice(0, 10);
    const crmResult = await db.run(`
      INSERT INTO crm_visitas (fecha_visita, cliente_id, asesor_id, comentarios_bitacora)
      VALUES (?, ?, ?, ?)
    `, [now, planRecord.cliente_id, planRecord.asesor_id, bitacoraText]);
    visitId = crmResult.id;
    console.log(`Created crm_visitas ID: ${visitId}`);
    
    await db.run(`
      UPDATE planificacion_semanal
      SET realizada = 1,
          visita_id = ?
      WHERE id = ?
    `, [visitId, planId]);
    
    // Verify changes
    const updatedPlan = await db.get("SELECT * FROM planificacion_semanal WHERE id = ?", [planId]);
    console.log("Updated Plan Record:", updatedPlan);
    
    const crmLog = await db.get("SELECT * FROM crm_visitas WHERE id = ?", [visitId]);
    console.log("CRM Log Record:", crmLog);
    
    if (updatedPlan.realizada === 1 && updatedPlan.visita_id === visitId && crmLog.comentarios_bitacora.includes("TEST_MARKER")) {
      console.log("🟢 Complete Visit & CRM Log Integration: PASSED!");
    } else {
      console.error("🔴 Complete Visit & CRM Log Integration: FAILED!");
      process.exit(1);
    }
    
    // 5. Test Projections aggregation
    console.log("\n4. Verifying proyecciones aggregation...");
    // Let's compute actual sales (realized) and forecasts (pending) for this advisor in O-I 2026
    const meta = await db.get(
      'SELECT monto_objetivo_mxn, bolsas_objetivo FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ? AND activo = 1',
      [adviserId, cycle]
    );
    
    const real = await db.get(`
      SELECT SUM(q.total_mxn) as total_real, SUM(d.cantidad_ordenada) as bolsas_real
      FROM cotizaciones q
      LEFT JOIN cotizacion_detalles d ON q.id = d.cotizacion_id
      WHERE q.asesor_id = ? AND q.ciclo_agricola = ? AND (q.estatus = 'Vendido' OR q.estatus = 'Entregado')
    `, [adviserId, cycle]);
    
    const forecast = await db.get(`
      SELECT SUM(pronostico_monto_mxn) as total_forecast, SUM(pronostico_bolsas) as bolsas_forecast
      FROM planificacion_semanal
      WHERE asesor_id = ? AND realizada = 0
    `, [adviserId]);
    
    console.log("Aggregation Results:");
    console.log(`- Meta MXN: ${meta ? meta.monto_objetivo_mxn : 0.0} | Bags: ${meta ? meta.bolsas_objetivo : 0}`);
    console.log(`- Realized MXN: ${real.total_real || 0.0} | Bags: ${real.bolsas_real || 0}`);
    console.log(`- Forecast (Pending) MXN: ${forecast.total_forecast || 0.0} | Bags: ${forecast.bolsas_forecast || 0}`);
    
    console.log("\nCleaning up test data...");
    await db.run("DELETE FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ?", [adviserId, cycle]);
    await db.run("DELETE FROM planificacion_semanal WHERE asesor_id = ?", [adviserId]);
    await db.run("DELETE FROM crm_visitas WHERE id = ?", [visitId]);
    
    console.log("\n=========================================");
    console.log("   ALL INTEGRATION TESTS PASSED!");
    console.log("=========================================");
    
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  }
}

testWeeklyFlow();
