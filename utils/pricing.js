/**
 * utils/pricing.js
 *
 * Motor centralizado de cálculo de precios para AgriSales Pro.
 *
 * Esta función es la ÚNICA fuente de verdad para los multiplicadores de volumen
 * de semillas y los cálculos de precio neto por categoría de producto.
 * Todos los endpoints de server.js y agentsService.js deben importar estas
 * funciones en lugar de definir sus propias versiones locales.
 *
 * Escala de descuento por volumen (alineada con cotizador.py - prototipo original):
 *   < 40 bolsas  → Multiplicador 1.00 (sin descuento)
 *   < 60 bolsas  → Multiplicador 0.95 (5% de descuento)
 *   < 80 bolsas  → Multiplicador 0.90 (10% de descuento)
 *   < 90 bolsas  → Multiplicador 0.85 (15% de descuento)
 *   >= 90 bolsas → Multiplicador 0.80 (20% de descuento)
 */

const EXCHANGE_RATE = 18.70;   // Tipo de cambio USD/MXN fijo en el negocio
const USD_FACTOR    = 4.00;    // Factor de conversión base Asgrow (constante de negocio)

/**
 * Devuelve el multiplicador de descuento por volumen para semillas con descuento.
 * @param {number} qty - Número total de bolsas de semilla con descuento en la cotización
 * @returns {number} Multiplicador entre 0.80 y 1.00
 */
function getVolumeMultiplier(qty) {
  if (qty < 40) return 1.00;
  if (qty < 60) return 0.95;
  if (qty < 80) return 0.90;
  if (qty < 90) return 0.85;
  return 0.80;
}

/**
 * Calcula el precio de temporada para un producto basado en la temporada activa.
 *
 * @param {number} listPrice       - Precio de lista MXN
 * @param {string} tipoCategoria   - Categoría del producto (e.g., 'Agroquímico', 'Híbrido', 'Fertilizante')
 * @param {object|null} activeSeason - Registro de temporada de la DB. Puede ser null.
 * @returns {number} Precio ajustado por temporada
 */
function getSeasonPrice(listPrice, tipoCategoria, activeSeason) {
  // Los agroquímicos siempre usan precio de lista completo, sin descuento de temporada
  if (tipoCategoria === 'Agroquímico') {
    return listPrice;
  }

  if (!activeSeason) {
    return listPrice;
  }

  // La columna en PostgreSQL se llama 'descuento_percentage' (migración)
  // El ORM legacy la expone también como 'descuento_porcentaje' en SQLite
  const discount = activeSeason.descuento_percentage !== undefined
    ? activeSeason.descuento_percentage
    : (activeSeason.descuento_porcentaje || 0.0);

  const action = activeSeason.estado_operacion || 'Sumar';

  if (action === 'Restar') {
    return listPrice * (1 - discount / 100.0);
  } else {
    return listPrice * (1 + discount / 100.0);
  }
}

/**
 * Calcula el precio neto unitario para un producto dado el contexto de la cotización.
 *
 * @param {object} prod               - Registro del producto de la DB
 * @param {number} volMultiplier      - Multiplicador de volumen calculado con getVolumeMultiplier()
 * @param {number} keyAccountDiscount - Descuento fijo en MXN por bolsa según nivel de cuenta clave
 * @param {object|null} activeSeason  - Registro de temporada activa (puede ser null)
 * @returns {number} Precio neto unitario en MXN
 */
function getNetPrice(prod, volMultiplier, keyAccountDiscount, activeSeason) {
  const listPrice = prod.list_price_mxn;
  const seasonPrice = getSeasonPrice(listPrice, prod.tipo_categoria, activeSeason);

  if (prod.descontar === 1) {
    // Semillas elegibles: aplicar descuento por volumen + cuenta clave
    // Fórmula: round(base_usd * volMultiplier, 2) * USD_FACTOR * EXCHANGE_RATE - descuento_cuenta_clave
    const usdPriceForTier = Math.round((prod.base_usd * volMultiplier) * 100) / 100;
    const mxnVolumePrice = Math.round(usdPriceForTier * USD_FACTOR * EXCHANGE_RATE);
    return mxnVolumePrice - keyAccountDiscount;
  } else if (prod.tipo_categoria === 'Híbrido') {
    // Semillas sin descuento de volumen: solo precio de temporada redondeado
    return Math.round(seasonPrice);
  } else {
    // Agroquímicos y fertilizantes: precio lista (sin temporada) menos descuento fijo de catálogo
    return seasonPrice - (prod.descuento_fijo_quimicos || 0.0);
  }
}

/**
 * Calcula el subtotal para un ítem de cotización.
 *
 * @param {object} prod               - Registro del producto de la DB
 * @param {number} quantity           - Cantidad de bolsas/unidades
 * @param {number} volMultiplier      - Multiplicador de volumen
 * @param {number} keyAccountDiscount - Descuento fijo en MXN por cuenta clave
 * @param {object|null} activeSeason  - Temporada activa
 * @returns {{ netPrice: number, subtotal: number }} Precio neto unitario y subtotal
 */
function calculateItemPricing(prod, quantity, volMultiplier, keyAccountDiscount, activeSeason) {
  const netPrice = getNetPrice(prod, volMultiplier, keyAccountDiscount, activeSeason);
  return {
    netPrice,
    subtotal: netPrice * quantity
  };
}

module.exports = {
  getVolumeMultiplier,
  getSeasonPrice,
  getNetPrice,
  calculateItemPricing,
  EXCHANGE_RATE,
  USD_FACTOR
};
