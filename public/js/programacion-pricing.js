(function attachProgramacionPricing(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProgramacionPricing = api;
}(typeof window !== 'undefined' ? window : null, function createProgramacionPricing() {
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const roundPercent = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
  const nonNegative = value => Math.max(Number(value) || 0, 0);

  function calculateLinkedPricing(referencePrice, changedField, rawValue) {
    const reference = nonNegative(referencePrice);
    const value = nonNegative(rawValue);
    let price;
    let discountAmount;
    let discountPercent;

    if (changedField === 'precio') {
      price = value;
      discountAmount = Math.max(reference - price, 0);
      discountPercent = reference > 0 ? (discountAmount / reference) * 100 : 0;
    } else if (changedField === 'promo_dinero') {
      discountAmount = Math.min(value, reference);
      price = reference - discountAmount;
      discountPercent = reference > 0 ? (discountAmount / reference) * 100 : 0;
    } else if (changedField === 'promo_porcentaje') {
      discountPercent = Math.min(value, 100);
      discountAmount = reference * discountPercent / 100;
      price = reference - discountAmount;
    } else {
      throw new Error(`Campo de programación desconocido: ${changedField}`);
    }

    return {
      referencePrice: roundMoney(reference),
      precio: roundMoney(price),
      promo_dinero: roundMoney(discountAmount),
      promo_porcentaje: roundPercent(discountPercent)
    };
  }

  function normalizeLinkedPricing(referencePrice, price, discountAmount, discountPercent) {
    if (nonNegative(discountAmount) > 0) {
      return calculateLinkedPricing(referencePrice, 'promo_dinero', discountAmount);
    }
    if (nonNegative(discountPercent) > 0) {
      return calculateLinkedPricing(referencePrice, 'promo_porcentaje', discountPercent);
    }
    return calculateLinkedPricing(referencePrice, 'precio', price);
  }

  return { calculateLinkedPricing, normalizeLinkedPricing };
}));
