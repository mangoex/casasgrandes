const { PricingDomainError, roundMoney } = require('./pricing');

function validateNuclePercentage(value) {
  const percentage = Number(value);
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new PricingDomainError('invalid_nucle_percentage');
  }
  return Math.round((percentage + Number.EPSILON) * 10000) / 10000;
}

function isNucleEligibleCategory(category) {
  const normalized = String(category || '').trim().toLocaleLowerCase('es-MX');
  return ['híbrido', 'hibrido', 'semilla', 'semillas'].includes(normalized);
}

function applyNucleDiscount({
  enabled,
  percentage,
  category,
  monthlyPrice,
  priceAfterAdvisor,
  quantity
}) {
  const safePercentage = validateNuclePercentage(percentage || 0);
  const eligible = Boolean(enabled) && isNucleEligibleCategory(category) && safePercentage > 0;
  const monthly = roundMoney(Math.max(Number(monthlyPrice) || 0, 0));
  const currentPrice = roundMoney(Math.max(Number(priceAfterAdvisor) || 0, 0));
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new PricingDomainError('invalid_quote_quantity');

  const requestedUnitDiscount = eligible ? roundMoney(monthly * safePercentage / 100) : 0;
  const finalUnitPrice = roundMoney(Math.max(currentPrice - requestedUnitDiscount, 0));
  const appliedUnitDiscount = roundMoney(currentPrice - finalUnitPrice);
  const subtotal = roundMoney(finalUnitPrice * qty);
  const totalDiscount = roundMoney(appliedUnitDiscount * qty);

  return {
    eligible,
    percentage: safePercentage,
    requestedUnitDiscount,
    appliedUnitDiscount,
    finalUnitPrice,
    subtotal,
    totalDiscount
  };
}

module.exports = {
  applyNucleDiscount,
  isNucleEligibleCategory,
  validateNuclePercentage
};
