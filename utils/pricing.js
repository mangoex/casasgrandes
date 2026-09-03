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
const PERCENT_SCALE_DIGITS = 4;

class PricingDomainError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'PricingDomainError';
    this.code = code;
    this.statusCode = 400;
  }
}

function parseScaledInteger(value, scaleDigits, errorCode) {
  let text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) throw new PricingDomainError(errorCode);
    text = numeric.toFixed(scaleDigits + 4);
  }
  const [whole, fraction = ''] = text.split('.');
  const kept = fraction.padEnd(scaleDigits, '0').slice(0, scaleDigits);
  const nextDigit = fraction.length > scaleDigits ? Number(fraction[scaleDigits]) : 0;
  const scale = 10n ** BigInt(scaleDigits);
  let scaled = BigInt(whole) * scale + BigInt(kept || '0');
  if (nextDigit >= 5) scaled += 1n;
  return scaled;
}

function toMoneyCents(value) {
  const cents = parseScaledInteger(value, 2, 'invalid_pricing_amount');
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PricingDomainError('invalid_pricing_amount');
  }
  return Number(cents);
}

function formatMoneyCents(cents) {
  const value = BigInt(cents);
  const whole = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function roundMoney(value) {
  return toMoneyCents(value) / 100;
}

function roundHalfUpDivision(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function calculateDiscountBudget({
  catalog_price,
  monthly_price,
  promo_money = 0,
  promo_percent = 0,
  promotion_cap = null
}) {
  const catalogCents = toMoneyCents(catalog_price);
  const monthlyCents = toMoneyCents(monthly_price);
  const promoMoneyCents = toMoneyCents(promo_money);
  const promoPercentScaled = parseScaledInteger(
    promo_percent,
    PERCENT_SCALE_DIGITS,
    'invalid_promotion_percent'
  );
  const percentDenominator = 100n * (10n ** BigInt(PERCENT_SCALE_DIGITS));
  if (promoPercentScaled > percentDenominator) {
    throw new PricingDomainError('invalid_promotion_percent');
  }
  const percentCapCents = Number(roundHalfUpDivision(
    BigInt(catalogCents) * promoPercentScaled,
    percentDenominator
  ));
  if (promoMoneyCents > 0 && promoPercentScaled > 0n && promoMoneyCents !== percentCapCents) {
    throw new PricingDomainError('inconsistent_monthly_promotion');
  }

  const representedDiscountCents = promoMoneyCents > 0 ? promoMoneyCents : percentCapCents;
  const capCents = promotion_cap === null || promotion_cap === undefined
    ? representedDiscountCents
    : toMoneyCents(promotion_cap);
  if (capCents > catalogCents) {
    throw new PricingDomainError('promotion_cap_exceeds_catalog_price');
  }

  const embeddedCents = Math.max(catalogCents - monthlyCents, 0);
  if (representedDiscountCents !== embeddedCents) {
    throw new PricingDomainError('inconsistent_monthly_price_discount');
  }
  if (embeddedCents > capCents) {
    throw new PricingDomainError('monthly_discount_exceeds_promotion_cap');
  }
  const availableCents = capCents - embeddedCents;

  return {
    catalog_price: formatMoneyCents(catalogCents),
    monthly_price: formatMoneyCents(monthlyCents),
    embedded_discount: formatMoneyCents(embeddedCents),
    total_promotion_cap: formatMoneyCents(capCents),
    advisor_discount_available: formatMoneyCents(availableCents)
  };
}

function validateAdvisorDiscount(requestedDiscount, availableDiscount) {
  const requestedCents = toMoneyCents(requestedDiscount || 0);
  const availableCents = toMoneyCents(availableDiscount || 0);
  if (requestedCents > availableCents) {
    throw new PricingDomainError(
      'advisor_discount_exceeds_available',
      'El descuento solicitado excede el saldo autorizado para el mes.'
    );
  }
  return requestedCents / 100;
}

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
  let priceBeforeKeyAccount;

  if (prod.descontar === 1) {
    if (prod.precio_programado_mxn !== undefined && prod.precio_programado_mxn !== null) {
      priceBeforeKeyAccount = Math.round(seasonPrice * volMultiplier);
    } else {
      // Semillas elegibles: aplicar descuento por volumen antes de Cuenta Clave.
      const usdPriceForTier = Math.round((prod.base_usd * volMultiplier) * 100) / 100;
      priceBeforeKeyAccount = Math.round(usdPriceForTier * USD_FACTOR * EXCHANGE_RATE);
    }
  } else if (prod.tipo_categoria === 'Híbrido') {
    // Semillas sin descuento de volumen: precio de temporada antes de Cuenta Clave.
    priceBeforeKeyAccount = Math.round(seasonPrice);
  } else {
    // Agroquímicos y fertilizantes: descuento de catálogo antes de Cuenta Clave.
    priceBeforeKeyAccount = seasonPrice - (prod.descuento_fijo_quimicos || 0.0);
  }

  // Cuenta Clave es un beneficio exclusivo para semillas (Híbridos) y se aplica antes del descuento del asesor.
  const effectiveKeyAccountDiscount = isKeyAccountEligible(prod)
    ? (Number(keyAccountDiscount) || 0)
    : 0;
  return Math.max(priceBeforeKeyAccount - effectiveKeyAccountDiscount, 0);
}

/**
 * Determina si una categoría de producto es elegible para el beneficio de Cuenta Clave.
 * El descuento por Cuenta Clave es exclusivo para semillas (categorías Híbrido y Semilla).
 *
 * @param {string|null|undefined} category - Nombre de la categoría
 * @returns {boolean} true si es Semilla o Híbrido; false para Agroquímicos, Fertilizantes u otros.
 */
function isKeyAccountEligibleCategory(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return normalized === 'híbrido' || normalized === 'hibrido' || normalized === 'semilla' || normalized === 'semillas';
}

/**
 * Determina si un registro de producto es elegible para el beneficio de Cuenta Clave.
 *
 * @param {object|null|undefined} prod - Registro de producto
 * @returns {boolean} true si el producto es elegible
 */
function isKeyAccountEligible(prod) {
  if (!prod) return false;
  return isKeyAccountEligibleCategory(prod.tipo_categoria);
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
  const netPrice = roundMoney(getNetPrice(prod, volMultiplier, keyAccountDiscount, activeSeason));
  return {
    netPrice,
    subtotal: roundMoney(netPrice * quantity)
  };
}

module.exports = {
  PricingDomainError,
  calculateDiscountBudget,
  roundMoney,
  validateAdvisorDiscount,
  toMoneyCents,
  getVolumeMultiplier,
  getSeasonPrice,
  getNetPrice,
  isKeyAccountEligibleCategory,
  isKeyAccountEligible,
  calculateItemPricing,
  EXCHANGE_RATE,
  USD_FACTOR
};
