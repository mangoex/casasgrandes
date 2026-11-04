'use strict';

const db = require('../db');
const {
  sqlFold,
  escapeLike,
  foldText,
  round3,
  toIso,
  clip,
  encodeCursor
} = require('./botHttp');

const PRODUCT_FIELDS = `
  p.id,
  p.producto AS nombre,
  p.clave,
  COALESCE(p.tipo_categoria, '') AS categoria,
  COALESCE((
    SELECT m.existencias_resultantes
    FROM almacen_movimientos m
    WHERE m.producto_id = p.id
    ORDER BY m.id DESC
    LIMIT 1
  ), 0) AS existencia_fisica,
  COALESCE((
    SELECT SUM(r.cantidad)
    FROM cotizacion_reservas r
    WHERE r.producto_id = p.id AND r.estado = 'ACTIVA'
  ), 0) AS reservado
`;

function listProducts({ q, categoria, afterId, limit }) {
  const needle = escapeLike(foldText(q));
  const foldedCategory = foldText(categoria);
  const nameFold = sqlFold('p.producto');
  const codeFold = sqlFold("COALESCE(p.clave, '')");
  const categoryFold = sqlFold("COALESCE(p.tipo_categoria, '')");
  return db.all(`
    SELECT ${PRODUCT_FIELDS}
    FROM productos p
    WHERE p.activo = 1
      AND (?::int IS NULL OR p.id > ?::int)
      AND (
        ? = ''
        OR ${nameFold} LIKE '%' || ? || '%' ESCAPE '\\'
        OR ${codeFold} LIKE '%' || ? || '%' ESCAPE '\\'
      )
      AND (
        ? = ''
        OR ${categoryFold} = ?
      )
    ORDER BY p.id ASC
    LIMIT ?
    /* bot:productos */
  `, [afterId, afterId, needle, needle, needle, foldedCategory, foldedCategory, limit]);
}

function getProduct(id) {
  return db.get(`
    SELECT ${PRODUCT_FIELDS}
    FROM productos p
    WHERE p.id = ? AND p.activo = 1
    /* bot:producto */
  `, [id]);
}

function listLots(productId) {
  return db.all(`
    SELECT lote, tamano,
           (SUM(COALESCE(cantidad_entrante, 0)) - SUM(COALESCE(cantidad_saliente, 0))) AS existencia_fisica
    FROM almacen_movimientos
    WHERE producto_id = ?
      AND lote IS NOT NULL AND TRIM(lote) <> ''
    GROUP BY lote, tamano
    HAVING (SUM(COALESCE(cantidad_entrante, 0)) - SUM(COALESCE(cantidad_saliente, 0))) > 0
    ORDER BY lote ASC, tamano ASC NULLS LAST
    /* bot:lotes */
  `, [productId]);
}

function listSizePhysical(productId) {
  return db.all(`
    SELECT tamano,
           SUM(COALESCE(cantidad_entrante, 0) - COALESCE(cantidad_saliente, 0)) AS existencia_fisica
    FROM almacen_movimientos
    WHERE producto_id = ?
      AND tamano IS NOT NULL AND TRIM(tamano) <> ''
    GROUP BY tamano
    /* bot:tamanos-fisico */
  `, [productId]);
}

function listSizeReserved(productId) {
  return db.all(`
    SELECT tamano, COALESCE(SUM(cantidad), 0) AS reservado
    FROM cotizacion_reservas
    WHERE producto_id = ? AND estado = 'ACTIVA'
      AND tamano IS NOT NULL AND TRIM(tamano) <> ''
    GROUP BY tamano
    /* bot:tamanos-reserva */
  `, [productId]);
}

function listMovements({ productId, beforeId, limit }) {
  const conditions = [];
  const params = [];
  if (productId) {
    conditions.push('m.producto_id = ?');
    params.push(productId);
  }
  if (beforeId) {
    conditions.push('m.id < ?');
    params.push(beforeId);
  }
  params.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.all(`
    SELECT m.id,
           m.fecha_movimiento,
           m.tipo_movimiento,
           m.producto_id,
           COALESCE(p.producto, '') AS producto_nombre,
           m.cantidad_entrante,
           m.cantidad_saliente,
           m.existencias_resultantes,
           m.ciclo_agricola,
           m.lote,
           m.tamano
    FROM almacen_movimientos m
    LEFT JOIN productos p ON p.id = m.producto_id
    ${where}
    ORDER BY m.id DESC
    LIMIT ?
    /* bot:movimientos */
  `, params);
}

function projectProduct(row, view) {
  const disponible = round3(Number(row.existencia_fisica) - Number(row.reservado));
  const identity = {
    id: Number(row.id),
    nombre: clip(row.nombre, 120) || 'Producto',
    clave: row.clave == null || String(row.clave).trim() === '' ? null : clip(row.clave, 40),
    categoria: clip(row.categoria || '', 40)
  };
  if (view === 'asesor') return { ...identity, disponible };
  return {
    ...identity,
    existencia_fisica: round3(row.existencia_fisica),
    reservado: Math.max(0, round3(row.reservado)),
    disponible
  };
}

function projectLots(rows) {
  return rows.map(row => ({
    lote: clip(row.lote, 80),
    tamano: row.tamano == null || String(row.tamano).trim() === '' ? null : clip(row.tamano, 16),
    existencia_fisica: round3(row.existencia_fisica)
  }));
}

function projectSizes(physicalRows, reservedRows) {
  const sizes = new Map();
  for (const row of physicalRows) {
    const tamano = String(row.tamano);
    sizes.set(tamano.toUpperCase(), {
      tamano: clip(tamano, 16),
      existencia_fisica: Number(row.existencia_fisica) || 0,
      reservado: 0
    });
  }
  for (const row of reservedRows) {
    const key = String(row.tamano).toUpperCase();
    const current = sizes.get(key) || {
      tamano: clip(row.tamano, 16),
      existencia_fisica: 0,
      reservado: 0
    };
    current.reservado += Number(row.reservado) || 0;
    sizes.set(key, current);
  }
  return [...sizes.values()]
    .map(row => ({
      tamano: row.tamano,
      existencia_fisica: round3(row.existencia_fisica),
      reservado: Math.max(0, round3(row.reservado)),
      disponible: round3(row.existencia_fisica - row.reservado)
    }))
    .sort((left, right) => left.tamano.localeCompare(right.tamano, 'es'));
}

function projectMovement(row, view) {
  const item = {
    id: Number(row.id),
    fecha: toIso(row.fecha_movimiento) || '1970-01-01T00:00:00.000Z',
    tipo: clip(row.tipo_movimiento, 80) || 'Movimiento',
    producto_id: Number(row.producto_id),
    producto_nombre: clip(row.producto_nombre, 120),
    cantidad_entrante: round3(row.cantidad_entrante),
    cantidad_saliente: round3(row.cantidad_saliente),
    existencias_resultantes: round3(row.existencias_resultantes),
    ciclo_agricola: row.ciclo_agricola == null || String(row.ciclo_agricola).trim() === ''
      ? null
      : clip(row.ciclo_agricola, 40)
  };
  const lote = row.lote == null || String(row.lote).trim() === '' ? null : clip(row.lote, 80);
  item.lote = lote;
  if (view === 'almacen') {
    item.tamano = row.tamano == null || String(row.tamano).trim() === '' ? null : clip(row.tamano, 16);
  }
  return item;
}

function page(rows, limit, idOf) {
  const extra = rows.length > limit;
  const datos = extra ? rows.slice(0, limit) : rows;
  const siguiente = extra ? encodeCursor(idOf(datos[datos.length - 1])) : null;
  return { datos, paginacion: { limite: limit, siguiente } };
}

module.exports = {
  listProducts,
  getProduct,
  listLots,
  listSizePhysical,
  listSizeReserved,
  listMovements,
  projectProduct,
  projectLots,
  projectSizes,
  projectMovement,
  page
};
