/**
 * utils/almacen.js
 *
 * Motor determinista de cálculo y validación de existencias por lote y tamaño para almacén.
 */

/**
 * Calcula el saldo disponible para un lote específico (y opcionalmente tamaño para semillas).
 * @param {Array<Object>} movesList - Lista de movimientos de almacén
 * @param {string} lote - Identificador del lote
 * @param {string|null} [tamano=null] - Tamaño / calibre (opcional, para semillas)
 * @returns {number} Saldo neto del lote (redondeado a 3 decimales)
 */
function calculateLotStock(movesList, lote, tamano = null) {
  if (!Array.isArray(movesList)) return 0.0;
  const targetLote = String(lote || '').trim().toUpperCase();
  const targetTamano = tamano !== null && tamano !== undefined ? String(tamano).trim().toUpperCase() : null;

  let stock = 0.0;
  for (const m of movesList) {
    const moveLote = String(m.lote || '').trim().toUpperCase();
    if (moveLote !== targetLote) continue;

    if (targetTamano !== null) {
      const moveTamano = String(m.tamano || '').trim().toUpperCase();
      if (moveTamano !== targetTamano) continue;
    }

    const ent = Number(m.cantidad_entrante || 0);
    const sal = Number(m.cantidad_saliente || 0);
    stock += (ent - sal);
  }

  return Math.round(stock * 1000) / 1000;
}

/**
 * Valida si hay stock suficiente en el lote para cubrir una salida.
 * @param {number} lotStock - Saldo disponible en el lote
 * @param {number} cantidadSaliente - Cantidad requerida para salida
 * @returns {{ valido: boolean, mensaje: string }}
 */
function validateLotSalida(lotStock, cantidadSaliente) {
  const stock = Number(lotStock || 0);
  const req = Number(cantidadSaliente || 0);

  if (req <= 0) {
    return { valido: false, mensaje: 'La cantidad de salida debe ser mayor a cero.' };
  }
  if (stock < req) {
    return {
      valido: false,
      mensaje: `Existencias insuficientes para el lote especificado. Disponibles en lote: ${stock.toFixed(3)}, Requeridas: ${req.toFixed(3)}`
    };
  }
  return { valido: true, mensaje: 'Existencias de lote suficientes.' };
}

/**
 * Filtra y agrupa lotes con existencias disponibles (> 0) para un producto y opcionalmente por tamaño.
 * @param {Array<Object>} movesList - Lista de movimientos de almacén
 * @param {number|string} productoId - ID del producto
 * @param {string|null} [tamano=null] - Tamaño/calibre opcional para filtrar
 * @returns {Array<{ lote: string, tamano: string|null, stock: number }>}
 */
function filterLotsWithStock(movesList, productoId, tamano = null) {
  if (!Array.isArray(movesList)) return [];
  const prodId = Number(productoId);
  const targetTamano = tamano !== null && tamano !== undefined ? String(tamano).trim().toUpperCase() : null;

  // Filtrar movimientos por producto
  const productMoves = movesList.filter(m => Number(m.producto_id) === prodId);

  // Agrupar por lote + tamano
  const lotMap = new Map();

  for (const m of productMoves) {
    const rawLote = String(m.lote || '').trim();
    if (!rawLote) continue;
    const rawTamano = m.tamano ? String(m.tamano).trim() : null;

    if (targetTamano !== null) {
      if (String(rawTamano || '').toUpperCase() !== targetTamano) {
        continue;
      }
    }

    const key = `${rawLote.toUpperCase()}__${(rawTamano || '').toUpperCase()}`;
    const ent = Number(m.cantidad_entrante || 0);
    const sal = Number(m.cantidad_saliente || 0);

    if (!lotMap.has(key)) {
      lotMap.set(key, {
        lote: rawLote,
        tamano: rawTamano,
        stock: 0
      });
    }

    const entry = lotMap.get(key);
    entry.stock += (ent - sal);
  }

  // Filtrar solo los que tienen stock > 0
  const result = [];
  for (const entry of lotMap.values()) {
    entry.stock = Math.round(entry.stock * 1000) / 1000;
    if (entry.stock > 0) {
      result.push(entry);
    }
  }

  return result;
}

/**
 * Normaliza el payload de movimientos de almacén, soportando tanto formato
 * multi-ítem (`body.items`) como formato legado de ítem individual en la raíz.
 * @param {Object} body - Payload de la solicitud
 * @returns {Array<{ producto_id: number, lote: string, tamano: string|null, cantidad: number, precio_venta: number, categoria: string }>}
 */
function normalizeMovementItems(body = {}) {
  if (Array.isArray(body.items) && body.items.length > 0) {
    return body.items.map(item => {
      const isSalida = String(body.tipo || body.tipo_movimiento || item.tipo || '').toLowerCase().includes('salida');
      const qty = Number(item.cantidad || (isSalida ? item.cantidad_saliente : item.cantidad_entrante)) || 0.0;
      const rawCat = String(item.categoria || body.categoria || 'Agroquímicos').trim();
      const isSeed = rawCat.toLowerCase().includes('semilla') || rawCat.toLowerCase().includes('híbrido') || rawCat.toLowerCase().includes('hibrido');
      return {
        producto_id: Number(item.producto_id),
        lote: String(item.lote || '').trim(),
        tamano: item.tamano ? String(item.tamano).trim() : null,
        cantidad: qty,
        precio_venta: Number(item.precio_venta) || 0.0,
        categoria: isSeed ? 'Semilla' : rawCat
      };
    });
  }

  // Formato legado (1 solo ítem en la raíz)
  const isSalida = String(body.tipo || body.tipo_movimiento || '').toLowerCase().includes('salida');
  const qty = Number(body.cantidad || (isSalida ? body.cantidad_saliente : body.cantidad_entrante)) || 0.0;
  const prodId = Number(body.producto_id);

  if (!prodId && !body.producto_id) {
    return [];
  }

  const rawCat = String(body.categoria || 'Agroquímicos').trim();
  const isSeed = rawCat.toLowerCase().includes('semilla') || rawCat.toLowerCase().includes('híbrido') || rawCat.toLowerCase().includes('hibrido');

  return [{
    producto_id: prodId,
    lote: String(body.lote || '').trim(),
    tamano: body.tamano ? String(body.tamano).trim() : null,
    cantidad: qty,
    precio_venta: Number(body.precio_venta) || 0.0,
    categoria: isSeed ? 'Semilla' : rawCat
  }];
}

/**
 * Valida un conjunto de partidas de salida contra los saldos de producto y lote.
 * @param {Array<Object>} items - Lista de partidas normalizadas
 * @param {Function} getStockForLot - Función síncrona/asíncrona que retorna el saldo disponible para (producto_id, lote, tamano)
 * @returns {Promise<{ valido: boolean, error?: string }>}
 */
async function validateMultiItemSalida(items, getStockForLot) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valido: false, error: 'Debe incluir al menos una partida de producto para registrar la salida.' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const indexStr = items.length > 1 ? ` (Partida #${i + 1})` : '';

    if (!item.producto_id || item.producto_id <= 0) {
      return { valido: false, error: `El producto es obligatorio en cada partida${indexStr}.` };
    }
    if (!item.lote) {
      return { valido: false, error: `El lote es obligatorio en cada partida${indexStr}.` };
    }
    if (item.cantidad <= 0) {
      return { valido: false, error: `La cantidad debe ser mayor a cero${indexStr}.` };
    }
    if (item.categoria === 'Semilla' && !item.tamano) {
      return { valido: false, error: `El tamaño es obligatorio para productos de categoría Semilla${indexStr}.` };
    }

    if (typeof getStockForLot === 'function') {
      const disp = await getStockForLot(item.producto_id, item.lote, item.tamano);
      if (typeof disp === 'number' && item.cantidad > disp) {
        return {
          valido: false,
          error: `Existencias insuficientes para el lote "${item.lote}"${indexStr}. Disponibles: ${disp.toLocaleString('es-MX', { minimumFractionDigits: 3 })}, Requeridas: ${item.cantidad.toLocaleString('es-MX', { minimumFractionDigits: 3 })}`
        };
      }
    }
  }

  return { valido: true };
}

/**
 * Construye de forma determinista la consulta SQL parametrizada para filtrar el Kardex.
 * @param {Object} query - Parámetros de consulta (producto_id, cliente_id, tipo_movimiento, categoria)
 * @returns {{ sql: string, params: Array, whereClause: string, conditions: Array }}
 */
function buildWarehouseMovementsQuery(query = {}) {
  const conditions = [];
  const params = [];
  const productId = Number(query.producto_id);
  const clienteId = Number(query.cliente_id);
  const movementType = String(query.tipo_movimiento || '').trim();
  const categoria = String(query.categoria || '').trim();

  if (Number.isInteger(productId) && productId > 0) {
    conditions.push('m.producto_id = ?');
    params.push(productId);
  }
  if (Number.isInteger(clienteId) && clienteId > 0) {
    conditions.push('(m.cliente_id = ? OR (m.cliente_id IS NULL AND c.cliente_id = ?))');
    params.push(clienteId);
    params.push(clienteId);
  }
  if (movementType) {
    conditions.push('m.tipo_movimiento LIKE ?');
    params.push(`%${movementType}%`);
  }
  if (categoria) {
    if (categoria === 'Semilla') {
      conditions.push('(COALESCE(m.categoria, p.tipo_categoria) = ? OR COALESCE(m.categoria, p.tipo_categoria) = ?)');
      params.push('Semilla');
      params.push('Híbrido');
    } else if (categoria === 'Agroquímicos' || categoria === 'Agroquímico') {
      conditions.push('(COALESCE(m.categoria, p.tipo_categoria) = ? OR COALESCE(m.categoria, p.tipo_categoria) = ? OR COALESCE(m.categoria, p.tipo_categoria) = ?)');
      params.push('Agroquímicos');
      params.push('Agroquímico');
      params.push('Fertilizante');
    } else {
      conditions.push('COALESCE(m.categoria, p.tipo_categoria) = ?');
      params.push(categoria);
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT m.*, 
           COALESCE(p.producto, 'Producto ' || m.producto_id) as producto_nombre, 
           COALESCE(p.tipo_categoria, m.categoria) as producto_categoria_orig,
           COALESCE(m.categoria, p.tipo_categoria) as categoria,
           a.nombre as asesor_nombre, 
           COALESCE(cli.nombre, cli_c.nombre) as cliente_nombre,
           c.folio_cotizacion
    FROM almacen_movimientos m
    LEFT JOIN productos p ON m.producto_id = p.id
    LEFT JOIN asesores a ON m.asesor_id = a.id
    LEFT JOIN cotizaciones c ON m.cotizacion_id = c.id
    LEFT JOIN clientes cli ON m.cliente_id = cli.id
    LEFT JOIN clientes cli_c ON c.cliente_id = cli_c.id
    ${whereClause}
    ORDER BY m.id DESC LIMIT 500
  `;

  return { sql, params, whereClause, conditions };
}

module.exports = {
  calculateLotStock,
  validateLotSalida,
  filterLotsWithStock,
  normalizeMovementItems,
  validateMultiItemSalida,
  buildWarehouseMovementsQuery
};
