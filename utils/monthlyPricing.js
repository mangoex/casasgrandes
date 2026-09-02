const {
  PricingDomainError,
  calculateDiscountBudget,
  roundMoney
} = require('./pricing');

const BUSINESS_TIME_ZONE = 'America/Mazatlan';

function getContractMonth(value = new Date()) {
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) return Number(dateOnly[2]);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new PricingDomainError('invalid_contract_date');
  const monthPart = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    month: 'numeric'
  }).formatToParts(date).find(part => part.type === 'month');
  return Number(monthPart.value);
}

function getContractDate(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new PricingDomainError('invalid_contract_date');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function budgetToNumbers(budget) {
  return {
    catalogPrice: Number(budget.catalog_price),
    listPrice: Number(budget.monthly_price),
    embeddedDiscountMxn: Number(budget.embedded_discount),
    totalPromotionCapMxn: Number(budget.total_promotion_cap),
    advisorDiscountAvailableMxn: Number(budget.advisor_discount_available)
  };
}

async function resolveMonthlyProductPricing(store, prod, monthOrDate = new Date()) {
  const month = Number.isInteger(monthOrDate) ? monthOrDate : getContractMonth(monthOrDate);
  if (month < 1 || month > 12) throw new PricingDomainError('invalid_contract_month');
  const monthly = await store.get(
    'SELECT precio, promo_dinero, promo_porcentaje, tope_descuento_mxn FROM crm_precios_mensuales WHERE producto_id = ? AND mes = ?',
    [prod.id, month]
  );
  const catalogPrice = Number(prod.list_price_mxn);
  const monthlyPrice = monthly ? Number(monthly.precio) : catalogPrice;
  const promoMoney = monthly ? Number(monthly.promo_dinero || 0) : 0;
  const promoPercent = monthly ? Number(monthly.promo_porcentaje || 0) : 0;
  const promotionCap = monthly ? Number(monthly.tope_descuento_mxn ?? promoMoney) : 0;
  const budget = calculateDiscountBudget({
    catalog_price: catalogPrice,
    monthly_price: monthlyPrice,
    promo_money: promoMoney,
    promo_percent: promoPercent,
    promotion_cap: promotionCap
  });
  const numericBudget = budgetToNumbers(budget);

  return {
    product: {
      ...prod,
      list_price_mxn: numericBudget.listPrice,
      precio_programado_mxn: numericBudget.listPrice
    },
    month,
    promoMoney,
    promoPercent,
    promotionCap,
    ...numericBudget
  };
}

function validateMonthlyPricingRows(rows, catalogPrice) {
  if (!Array.isArray(rows) || rows.length !== 12) {
    throw new PricingDomainError('invalid_monthly_pricing_rows');
  }
  const rowsByMonth = new Map();
  for (const raw of rows) {
    const mes = Number(raw.mes);
    const precio = Number(raw.precio);
    const embeddedDiscount = Math.max(roundMoney(Number(catalogPrice) - precio), 0);
    const legacyCap = Number(raw.tope_descuento_mxn ?? embeddedDiscount);
    const advisorMoney = raw.asesor_dinero === undefined || raw.asesor_dinero === null
      ? Math.max(roundMoney(legacyCap - embeddedDiscount), 0)
      : Number(raw.asesor_dinero);
    const promotionCap = roundMoney(embeddedDiscount + advisorMoney);
    const promoPorcentaje = Number(catalogPrice) > 0
      ? Math.round(((embeddedDiscount / Number(catalogPrice)) * 100 + Number.EPSILON) * 10000) / 10000
      : 0;
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || rowsByMonth.has(mes)) {
      throw new PricingDomainError('invalid_monthly_pricing_rows');
    }
    if (![precio, embeddedDiscount, promoPorcentaje, advisorMoney, promotionCap].every(Number.isFinite)
      || precio < 0 || embeddedDiscount < 0 || advisorMoney < 0 || promotionCap < 0) {
      throw new PricingDomainError('invalid_pricing_amount');
    }
    calculateDiscountBudget({
      catalog_price: catalogPrice,
      monthly_price: precio,
      promo_money: embeddedDiscount,
      promo_percent: promoPorcentaje,
      promotion_cap: promotionCap
    });
    rowsByMonth.set(mes, {
      mes,
      precio,
      promo_dinero: embeddedDiscount,
      promo_porcentaje: promoPorcentaje,
      asesor_dinero: advisorMoney,
      tope_descuento_mxn: promotionCap
    });
  }
  return rowsByMonth;
}

module.exports = {
  BUSINESS_TIME_ZONE,
  getContractDate,
  getContractMonth,
  resolveMonthlyProductPricing,
  validateMonthlyPricingRows
};
