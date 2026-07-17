const db = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getVolumeMultiplier, calculateItemPricing } = require('./utils/pricing');

let schedulerInterval = null;

// Helper to generate text using Gemini or OpenRouter
async function generateText(prompt, keyOrConfig = {}) {
  // Load global config
  const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
  const globalConfig = JSON.parse(globalRow?.configuracion || '{}');
  
  let provider = globalConfig.provider || 'gemini';
  let geminiKey = globalConfig.gemini_api_key || process.env.GEMINI_API_KEY;
  let openrouterKey = globalConfig.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  let openrouterModel = globalConfig.openrouter_model || 'google/gemini-2.5-flash';

  if (typeof keyOrConfig === 'string') {
    if (provider === 'openrouter') {
      openrouterKey = keyOrConfig;
    } else {
      geminiKey = keyOrConfig;
    }
  } else if (typeof keyOrConfig === 'object' && keyOrConfig !== null) {
    if (keyOrConfig.provider) provider = keyOrConfig.provider;
    if (keyOrConfig.gemini_api_key) geminiKey = keyOrConfig.gemini_api_key;
    if (keyOrConfig.openrouter_api_key) openrouterKey = keyOrConfig.openrouter_api_key;
    if (keyOrConfig.openrouter_model) openrouterModel = keyOrConfig.openrouter_model;
  }

  if (provider === 'openrouter') {
    if (!openrouterKey) {
      throw new Error('OPENROUTER_API_KEY no configurada. Configure su API Key en el panel o en el archivo .env');
    }
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://casasgrandes.sales",
        "X-Title": "AgriSales Pro"
      },
      body: JSON.stringify({
        model: openrouterModel,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
    }
    
    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error(`OpenRouter no devolvió respuestas. Response: ${JSON.stringify(data)}`);
    }
    return data.choices[0].message.content.trim();
  } else {
    // Direct Gemini
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Configure su API Key en el panel o en el archivo .env');
    }
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }
}

// Log writer helper
async function writeLog(agentId, tipoEvento, mensaje, detalle = null) {
  try {
    await db.run(
      'INSERT INTO crm_agentes_logs (agente_id, tipo_evento, mensaje, detalle) VALUES (?, ?, ?, ?)',
      [agentId, tipoEvento, mensaje, typeof detalle === 'object' ? JSON.stringify(detalle, null, 2) : detalle]
    );
  } catch (err) {
    console.error(`Failed to write agent log for ${agentId}:`, err.message);
  }
}

// Update last execution timestamp
async function updateLastExecution(agentId) {
  try {
    await db.run(
      'UPDATE crm_agentes_config SET ultima_ejecucion = CURRENT_TIMESTAMP WHERE agente_id = ?',
      [agentId]
    );
  } catch (err) {
    console.error(`Failed to update last execution for ${agentId}:`, err.message);
  }
}

// getVolumeMultiplier and calculateItemPricing are imported from utils/pricing.js
// See that module for the canonical discount scale and pricing formulas.

/**
 * calculateQuotePrice - Thin adapter that uses the centralized pricing engine.
 * @param {number} productId
 * @param {number} quantity
 * @param {number|null} seasonId
 * @param {number|null} clientKeyAccountTierId
 * @returns {Promise<{netPrice: number, subtotal: number}>}
 */
async function calculateQuotePrice(productId, quantity, seasonId, clientKeyAccountTierId) {
  const prod = await db.get('SELECT * FROM productos WHERE id = ?', [productId]);
  const cc = clientKeyAccountTierId
    ? await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [clientKeyAccountTierId])
    : { descuento_mxn: 0.0 };
  const season = seasonId
    ? await db.get('SELECT * FROM temporadas WHERE id = ?', [seasonId])
    : null;

  if (!prod) return { netPrice: 0, subtotal: 0 };

  const keyAccountDiscount = cc ? cc.descuento_mxn : 0.0;
  // Volume multiplier needs the total quantity for seeds; here we use the single item quantity
  // as the outreach agent creates single-item quotes for simplicity
  const volMultiplier = getVolumeMultiplier(prod.descontar === 1 ? quantity : 0);

  return calculateItemPricing(prod, quantity, volMultiplier, keyAccountDiscount, season);
}

// -------------------------------------------------------------
// 1. CEO AGENT
// -------------------------------------------------------------
async function runCEOAgent(customApiKey, cicloId) {
  await writeLog('ceo', 'info', `Iniciando ejecución del CEO Agent para el ciclo ID: ${cicloId || 'defecto'}...`);
  
  try {
    let cicloNombre = 'General';
    let globalGoals = [];
    
    if (cicloId) {
      const dbCiclo = await db.get("SELECT * FROM ciclos WHERE id = ?", [cicloId]);
      if (dbCiclo) {
        cicloNombre = dbCiclo.nombre;
      }
      globalGoals = await db.all(`
        SELECT mg.*, p.producto, p.tipo_categoria, p.list_price_mxn 
        FROM metas_globales mg
        JOIN productos p ON mg.producto_id = p.id
        WHERE mg.ciclo_id = ?
      `, [cicloId]);
    } else {
      // Find the latest active cycle as default fallback
      const dbCiclo = await db.get("SELECT * FROM ciclos WHERE activo = 1 ORDER BY creado_en DESC LIMIT 1");
      if (dbCiclo) {
        cicloId = dbCiclo.id;
        cicloNombre = dbCiclo.nombre;
        globalGoals = await db.all(`
          SELECT mg.*, p.producto, p.tipo_categoria, p.list_price_mxn 
          FROM metas_globales mg
          JOIN productos p ON mg.producto_id = p.id
          WHERE mg.ciclo_id = ?
        `, [cicloId]);
      }
    }

    // Fetch current system data
    const advisors = await db.all("SELECT id, nombre, email, activo FROM asesores WHERE activo = 1 AND nivel_rol = 'Asesor'");
    const clients = await db.all("SELECT id, nombre, asesor_id, estado_status, superficie_text FROM clientes WHERE activo = 1");
    
    // Categorize global goals
    let totalGlobalSemilla = 0;
    let totalGlobalFaena = 0;
    let totalGlobalClavis = 0;
    let totalGlobalCropProtection = 0;
    let totalGlobalCosecha = 0;
    let totalGlobalMontoMXN = 0;

    globalGoals.forEach(g => {
      totalGlobalMontoMXN += g.monto_objetivo_mxn || 0.0;
      const cat = g.tipo_categoria || '';
      const name = g.producto || '';
      const qty = g.cantidad_objetivo || 0.0;

      if (cat === 'Híbrido') {
        totalGlobalSemilla += qty;
      } else if (cat === 'Agroquímico' && name.toLowerCase().includes('faena')) {
        totalGlobalFaena += qty;
      } else if (cat === 'Agroquímico' && name.toLowerCase().includes('clavis')) {
        totalGlobalClavis += qty;
      } else if (cat === 'Agroquímico') {
        totalGlobalCropProtection += qty;
      } else if (cat === 'Fertilizante') {
        totalGlobalCosecha += qty;
      }
    });

    const totalsGlobales = {
      ciclo: cicloNombre,
      monto_total_mxn: totalGlobalMontoMXN,
      semilla_bolsas: totalGlobalSemilla,
      faena_litros: totalGlobalFaena,
      clavis_litros: totalGlobalClavis,
      crop_protection_litros: totalGlobalCropProtection,
      cosecha_litros: totalGlobalCosecha
    };

    // Build advisors stats with potential (assigned clients, total surface area, historical sales)
    const advisorsData = [];
    for (const adv of advisors) {
      // Get historical sales (overall)
      const salesOverall = await db.get(`
        SELECT 
          COALESCE(SUM(total_mxn), 0) as total_mxn,
          COUNT(id) as total_cotizaciones
        FROM cotizaciones 
        WHERE asesor_id = ? AND estatus IN ('Vendido', 'Entregado')
      `, [adv.id]);

      // Get historical sales for the specific cycle
      const salesCycle = await db.get(`
        SELECT 
          COALESCE(SUM(total_mxn), 0) as total_mxn
        FROM cotizaciones 
        WHERE asesor_id = ? AND ciclo_agricola = ? AND estatus IN ('Vendido', 'Entregado')
      `, [adv.id, cicloNombre]);

      // Get advisor's clients and sum their surface area
      const advClients = clients.filter(c => c.asesor_id === adv.id);
      let totalSurface = 0;
      advClients.forEach(c => {
        if (c.superficie_text) {
          const num = parseFloat(c.superficie_text.replace(/[^0-9.]/g, ''));
          if (!isNaN(num)) {
            totalSurface += num;
          }
        }
      });

      advisorsData.push({
        asesor_id: adv.id,
        nombre: adv.nombre,
        ventas_historicas_totales_mxn: salesOverall?.total_mxn || 0,
        ventas_ciclo_actual_mxn: salesCycle?.total_mxn || 0,
        total_clientes: advClients.length,
        superficie_total_hectareas: totalSurface,
        clientes: advClients.map(c => ({ nombre: c.nombre, status: c.estado_status, superficie: c.superficie_text }))
      });
    }

    // Fetch config for CEO to see custom instructions
    const configRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'ceo'");
    const configData = JSON.parse(configRow?.configuracion || '{}');
    const customPrompt = configData.prompt_adicional || "";

    // Build the payload for Gemini
    const dataContext = {
      ciclo_agricola: cicloNombre,
      metas_globales_empresa: totalsGlobales,
      metas_globales_por_producto: globalGoals.map(g => ({
        producto: g.producto,
        categoria: g.tipo_categoria,
        cantidad_objetivo: g.cantidad_objetivo,
        monto_objetivo_mxn: g.monto_objetivo_mxn
      })),
      desempeno_y_potencial_asesores: advisorsData,
      instrucciones_adicionales: customPrompt
    };

    const prompt = `
Eres el CEO Agent de AgriSales Pro. Tu rol es analizar las metas generales de la empresa para el ciclo agrícola "${cicloNombre}", y proponer una distribución inteligente de estas metas entre los asesores de ventas activos.

Aquí tienes los datos del sistema en tiempo real:
${JSON.stringify(dataContext, null, 2)}

Tu objetivo es formular una propuesta detallada de asignación de metas individuales para cada asesor. Debes calcular:
1. "monto_objetivo_mxn": Meta de ventas totales en pesos (MXN) para el asesor.
2. "bolsas_objetivo": Meta de Semilla (en bolsas, correspondiente a la categoría Híbrido).
3. "meta_faena": Meta de Faena (en litros, correspondiente a Agroquímicos con Faena).
4. "meta_clavis": Meta de Clavis (en litros, correspondiente a Agroquímicos con Clavis).
5. "meta_cropprotection": Meta de Crop Protection (en litros, correspondiente a Agroquímicos que NO son Faena ni Clavis).
6. "meta_cosecha": Meta de Cosecha (en litros, correspondiente a Fertilizantes).

REGLAS DE DISTRIBUCIÓN:
- La SUMA de las metas asignadas a todos los asesores para cada indicador debe ser exactamente (o lo más cercano posible a) las metas globales de la empresa:
  * Suma de monto_objetivo_mxn de los asesores = ${totalGlobalMontoMXN} MXN
  * Suma de bolsas_objetivo de los asesores = ${totalGlobalSemilla} bolsas
  * Suma de meta_faena de los asesores = ${totalGlobalFaena} litros/kg
  * Suma de meta_clavis de los asesores = ${totalGlobalClavis} litros/kg
  * Suma de meta_cropprotection de los asesores = ${totalGlobalCropProtection} litros/kg
  * Suma de meta_cosecha de los asesores = ${totalGlobalCosecha} litros/kg
- Distribuye las metas basándote proporcionalmente en el potencial y capacidad de cada asesor:
  * Considera la superficie total de hectáreas asignadas (asesores con más hectáreas tienen mayor potencial).
  * Considera el número de clientes y su estatus.
  * Considera el desempeño histórico de ventas totales.
  * Si un asesor no tiene historial, asígnale una meta mínima realista en base a su superficie/clientes.

Por favor, genera tu respuesta estructurada en dos partes:

Parte 1: Un reporte ejecutivo detallado en formato Markdown explicativo en español, justificando de forma analítica cómo y por qué distribuiste las metas de esta manera a cada asesor (mencionando su superficie asignada y ventas previas), incluyendo tablas comparativas.
Parte 2: Una sección final con los datos estructurados en formato JSON puro dentro de un bloque de código markdown marcado con \`\`\`json y \`\`\`. El JSON debe ser un arreglo de objetos con el siguiente formato:
[
  {
    "asesor_id": 1,
    "monto_objetivo_mxn": 500000,
    "bolsas_objetivo": 100,
    "meta_faena": 150,
    "meta_clavis": 50,
    "meta_cropprotection": 200,
    "meta_cosecha": 120
  }
]

Asegúrate de que el bloque JSON sea válido y contenga exactamente un objeto para cada uno de los asesores listados en los datos. No agregues texto extra dentro del bloque de código json.
`;

    const textResponse = await generateText(prompt, customApiKey);

    // Extract JSON block using regex
    const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch) {
      throw new Error('No se pudo encontrar el bloque JSON de metas en la respuesta del modelo.');
    }
    
    const jsonStr = jsonMatch[1].trim();
    const goalsArray = JSON.parse(jsonStr);

    // Filter out the JSON block from the markdown presentation if desired, or keep it.
    const markdownReport = textResponse.replace(/```json[\s\S]*?```/, '').trim();

    // Save proposal to db, including ciclo_id
    await db.run(
      'INSERT INTO crm_ceo_propuestas (ciclo_id, propuesta_json, propuesta_markdown, estatus) VALUES (?, ?, ?, ?)',
      [cicloId, JSON.stringify(goalsArray), markdownReport, 'Pendiente']
    );

    await updateLastExecution('ceo');
    await writeLog('ceo', 'success', 'Propuesta de metas generada con éxito basándose en metas globales.', { report: markdownReport, goals: goalsArray });
    return { success: true, report: markdownReport, goals: goalsArray };

  } catch (err) {
    await writeLog('ceo', 'error', `Error en CEO Agent: ${err.message}`, err.stack);
    throw err;
  }
}

// -------------------------------------------------------------
// 2. COORDINATOR AGENT
// -------------------------------------------------------------
async function runCoordinatorAgent(customApiKey) {
  await writeLog('coordinador', 'info', 'Iniciando ejecución del Coordinador Agent...');

  try {

    // Fetch active advisors
    const advisors = await db.all("SELECT id, nombre, telefono, email FROM asesores WHERE activo = 1 AND nivel_rol = 'Asesor'");
    
    // Fetch pending planning items for current/upcoming dates
    const pendingPlanning = await db.all(`
      SELECT 
        p.id, p.asesor_id, p.cliente_id, p.fecha_programada, p.objetivo_visita,
        c.nombre as cliente_nombre, c.telefono as cliente_telefono
      FROM planificacion_semanal p
      JOIN clientes c ON p.cliente_id = c.id
      WHERE p.realizada = 0
    `);

    // Fetch config for Coordinator custom prompt
    const configRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'coordinador'");
    const configData = JSON.parse(configRow?.configuracion || '{}');
    const customPrompt = configData.prompt_adicional || "";

    const followUps = [];

    // Group pending visits by advisor
    for (const advisor of advisors) {
      const advisorPending = pendingPlanning.filter(p => p.asesor_id === advisor.id);
      
      // We only target advisors with pending planning or if they have 0 plans scheduled
      const contextData = {
        asesor: { nombre: advisor.nombre, telefono: advisor.telefono },
        visitas_pendientes: advisorPending.map(p => ({
          cliente: p.cliente_nombre,
          fecha: p.fecha_programada,
          objetivo: p.objetivo_visita
        })),
        instrucciones_adicionales: customPrompt
      };

      const prompt = `
Eres el Coordinador Agent de AgriSales Pro. Tu rol es supervisar la agenda semanal de los asesores agrícolas y ayudarlos a mantener el sistema actualizado redactando un mensaje de seguimiento de WhatsApp personalizado, amigable pero profesional.

Aquí están los datos del asesor actual y su agenda pendiente:
${JSON.stringify(contextData, null, 2)}

Por favor, redacta un mensaje corto en español (máximo 150 palabras) dirigido al asesor. El mensaje debe:
1. Saludarlo por su nombre de forma cercana.
2. Recordarle las visitas pendientes específicas que tiene registradas en su agenda (con nombres de clientes y fechas).
3. Pedirle amablemente que realice el check-in o actualice el estatus de estas visitas en la plataforma.
4. Mantener un tono motivador y colaborativo.
5. NO incluir placeholders como [Nombre] o [Fecha], usa los datos reales provistos.

Devuelve ÚNICAMENTE el texto del mensaje para enviar por WhatsApp, sin introducciones ni comentarios adicionales.
`;

      const messageText = await generateText(prompt, customApiKey);

      // Create a wa.me URL
      const cleanPhone = (advisor.telefono || '').replace(/\D/g, '');
      const waPhone = cleanPhone.startsWith('52') ? cleanPhone : '52' + cleanPhone; // Default country code Mexico if not set
      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(messageText)}`;

      // Save notification in internal inbox
      await db.run(
        'INSERT INTO crm_notificaciones (asesor_id, mensaje, leido) VALUES (?, ?, 0)',
        [advisor.id, `Mensaje de Coordinación IA: ${messageText}`]
      );

      followUps.push({
        asesor_id: advisor.id,
        nombre: advisor.nombre,
        telefono: advisor.telefono,
        mensaje: messageText,
        wa_url: waUrl,
        pendientes_count: advisorPending.length
      });
    }

    // Save logs with all generated messages
    await updateLastExecution('coordinador');
    await writeLog('coordinador', 'success', 'Mensajes de seguimiento de agenda generados con éxito.', followUps);
    
    return { success: true, followUps };

  } catch (err) {
    await writeLog('coordinador', 'error', `Error en Coordinador Agent: ${err.message}`, err.stack);
    throw err;
  }
}

// -------------------------------------------------------------
// 3. OUTREACH AGENT
// -------------------------------------------------------------
async function runOutreachAgent(customApiKey) {
  await writeLog('outreach', 'info', 'Iniciando ejecución del Outreach Agent...');

  try {

    // Fetch active products
    const products = await db.all("SELECT id, producto, tipo_categoria, list_price_mxn, base_usd FROM productos WHERE activo = 1");
    // Fetch active seasons
    const seasons = await db.all("SELECT id, actividad, descuento_percentage, estado_operacion FROM temporadas WHERE estado_operacion IN ('Restar', 'Sumar')");
    // Fetch active clients who have an assigned advisor
    const clients = await db.all(`
      SELECT c.id, c.nombre, c.asesor_id, c.cuenta_clave_id, c.estado_status, a.nombre as asesor_nombre
      FROM clientes c
      JOIN asesores a ON c.asesor_id = a.id
      WHERE c.activo = 1 AND c.asesor_id IS NOT NULL
    `);

    if (clients.length === 0) {
      await writeLog('outreach', 'info', 'No hay agricultores asignados para generar cotizaciones.');
      return { success: true, createdQuotes: [] };
    }

    // Pick 3 clients at random or based on purchase patterns to avoid spamming
    // In production, we could analyze who hasn't been quoted recently.
    const selectedClients = clients.sort(() => 0.5 - Math.random()).slice(0, 3);
    const createdQuotes = [];

    // Fetch custom prompts if any
    const configRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'outreach'");
    const configData = JSON.parse(configRow?.configuracion || '{}');
    const customPrompt = configData.prompt_adicional || "";

    for (const client of selectedClients) {
      // Fetch historic sales for this client to pass as context
      const purchaseHistory = await db.all(`
        SELECT p.producto, SUM(d.cantidad_ordenada) as total_cantidad
        FROM cotizacion_detalles d
        JOIN cotizaciones q ON d.cotizacion_id = q.id
        JOIN productos p ON d.producto_id = p.id
        WHERE q.cliente_id = ? AND q.estatus IN ('Vendido', 'Entregado')
        GROUP BY p.producto
      `, [client.id]);

      const contextData = {
        cliente: client.nombre,
        estatus: client.estado_status,
        historial_compras: purchaseHistory,
        productos_disponibles: products.map(p => ({ id: p.id, nombre: p.producto, categoria: p.tipo_categoria })),
        temporadas: seasons.map(s => ({ id: s.id, nombre: s.actividad })),
        instrucciones_adicionales: customPrompt
      };

      const prompt = `
Eres el Outreach Agent de AgriSales Pro. Tu rol es analizar las necesidades de un agricultor (basado en sus compras históricas y los productos en campaña de la temporada) y generar una recomendación estructurada para una cotización borrador sugerida.

Aquí están los datos del cliente y los catálogos del sistema:
${JSON.stringify(contextData, null, 2)}

Por favor, decide una combinación lógica de 1 a 3 productos que le convenga comprar al agricultor en este momento. Define las cantidades de manera razonable basadas en compras históricas o hectáreas de tamaño promedio (e.g., entre 10 y 100 bolsas/piezas).

Devuelve tu recomendación en formato JSON puro. El JSON debe ser un objeto con el siguiente formato, sin ninguna otra explicación:
{
  "ciclo_agricola": "P-V 2026",
  "condiciones_pago": "Contado",
  "financiera": "Ninguna",
  "temporada_id": 1, 
  "notas": "Sugerido automáticamente por Outreach Agent. Basado en compras previas.",
  "items": [
    {
      "producto_id": 2,
      "cantidad": 50
    }
  ]
}

Asegúrate de mapear "temporada_id" y "producto_id" a los IDs reales provistos en el catálogo. Devuelve ÚNICAMENTE el bloque JSON.
`;

      const jsonText = await generateText(prompt, customApiKey);
      
      // Clean up markdown code blocks if the model returned them
      const cleanJsonText = jsonText.replace(/```json|```/g, '').trim();
      const quoteSpec = JSON.parse(cleanJsonText);

      // 1. Create Cotización row in Borrador status
      const folio = `OUT-${Date.now().toString().slice(-6)}-${client.id}`;
      const today = new Date().toISOString().split('T')[0];
      
      const insertQuoteResult = await db.run(`
        INSERT INTO cotizaciones (
          fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago,
          folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Borrador', 0.0, 0.0, ?, ?)
      `, [
        today,
        client.id,
        client.asesor_id,
        quoteSpec.ciclo_agricola || 'P-V 2026',
        quoteSpec.condiciones_pago || 'Contado',
        folio,
        new Date().toLocaleString('es-ES', { month: 'long' }),
        quoteSpec.notas || 'Generado automáticamente por el Agente de Outreach.',
        quoteSpec.financiera || 'Ninguna'
      ]);

      const quoteId = insertQuoteResult.id;
      let grandTotal = 0;

      // 2. Insert items and compute totals
      for (const item of quoteSpec.items) {
        const pricing = await calculateQuotePrice(item.producto_id, item.cantidad, quoteSpec.temporada_id, client.cuenta_clave_id);
        const prodData = products.find(p => p.id === item.producto_id);

        if (prodData) {
          await db.run(`
            INSERT INTO cotizacion_detalles (
              cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada,
              precio_lista_unitario, precio_neto_unitario, subtotal_mxn
            ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)
          `, [
            quoteId,
            item.producto_id,
            quoteSpec.temporada_id,
            item.cantidad,
            prodData.list_price_mxn,
            pricing.netPrice,
            pricing.subtotal
          ]);

          grandTotal += pricing.subtotal;
        }
      }

      // 3. Update total cost in database
      await db.run('UPDATE cotizaciones SET total_mxn = ? WHERE id = ?', [grandTotal, quoteId]);

      // 4. Create internal notification for Advisor
      const notificationMsg = `El Agente de Outreach ha sugerido una cotización en Borrador (${folio}) para tu agricultor ${client.nombre} con un total de $${grandTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} MXN.`;
      await db.run(
        'INSERT INTO crm_notificaciones (asesor_id, mensaje, leido) VALUES (?, ?, 0)',
        [client.asesor_id, notificationMsg]
      );

      createdQuotes.push({
        quote_id: quoteId,
        folio,
        cliente: client.nombre,
        asesor: client.asesor_nombre,
        total_mxn: grandTotal
      });
    }

    await updateLastExecution('outreach');
    await writeLog('outreach', 'success', `Se generaron ${createdQuotes.length} cotizaciones automáticas en borrador.`, createdQuotes);
    
    return { success: true, createdQuotes };

  } catch (err) {
    await writeLog('outreach', 'error', `Error en Outreach Agent: ${err.message}`, err.stack);
    throw err;
  }
}

// -------------------------------------------------------------
// GENERAL RUNNER AND SCHEDULER
// -------------------------------------------------------------
async function executeAgent(agentId, customApiKey, cicloId) {
  // Read config to verify if active (for scheduled runs, manual execution bypasses the active check)
  const config = await db.get("SELECT activo FROM crm_agentes_config WHERE agente_id = ?", [agentId]);
  
  if (agentId === 'ceo') {
    return await runCEOAgent(customApiKey, cicloId);
  } else if (agentId === 'coordinador') {
    return await runCoordinatorAgent(customApiKey);
  } else if (agentId === 'outreach') {
    return await runOutreachAgent(customApiKey);
  } else {
    throw new Error(`Agente no identificado: ${agentId}`);
  }
}

// Check and run agents based on scheduled times
async function runScheduledAgents() {
  try {
    // "global" stores provider credentials and is not an executable agent.
    const agents = await db.all(
      "SELECT * FROM crm_agentes_config WHERE activo = 1 AND agente_id IN ('ceo', 'coordinador', 'outreach')"
    );
    for (const agent of agents) {
      const configData = JSON.parse(agent.configuracion || '{}');
      const freqHours = configData.frecuencia_horas || 12;
      const lastRun = agent.ultima_ejecucion ? new Date(agent.ultima_ejecucion) : new Date(0);
      const now = new Date();
      
      const hoursElapsed = (now.getTime() - lastRun.getTime()) / (60 * 60 * 1000);
      
      if (hoursElapsed >= freqHours) {
        console.log(`[AI Scheduler] Running scheduled agent: ${agent.nombre}`);
        try {
          await executeAgent(agent.agente_id);
        } catch (err) {
          console.error(`[AI Scheduler] Error running scheduled agent ${agent.agente_id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error("[AI Scheduler] Error loading agent schedules:", err.message);
  }
}

function startBackgroundScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  // Run checks every 10 minutes
  schedulerInterval = setInterval(runScheduledAgents, 10 * 60 * 1000);
  console.log('AI Agents background scheduler initialized.');
  
  // Also run immediately on boot
  runScheduledAgents();
}

module.exports = {
  executeAgent,
  startBackgroundScheduler,
  runCEOAgent,
  runCoordinatorAgent,
  runOutreachAgent
};
