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

module.exports = {
  calculateLotStock,
  validateLotSalida,
  filterLotsWithStock
};
