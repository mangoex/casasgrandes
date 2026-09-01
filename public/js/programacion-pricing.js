(function attachProgramacionPricing(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProgramacionPricing = api;
}(typeof window !== 'undefined' ? window : null, function createProgramacionPricing() {
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const roundPercent = value => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
  const nonNegative = value => Math.max(Number(value) || 0, 0);

  function getReferencePrice(price, discountAmount, discountPercent) {
    const currentPrice = nonNegative(price);
    const currentAmount = nonNegative(discountAmount);
    const currentPercent = Math.min(nonNegative(discountPercent), 100);

    if (currentAmount > 0) return roundMoney(currentPrice + currentAmount);
    if (currentPercent > 0 && currentPercent < 100) {
      return roundMoney(currentPrice / (1 - currentPercent / 100));
    }
    return roundMoney(currentPrice);
  }

  function calculateLinkedPricing(referencePrice, changedField, rawValue) {
    let reference = nonNegative(referencePrice);
    const value = nonNegative(rawValue);
    let price;
    let discountAmount;
    let discountPercent;

    if (changedField === 'precio') {
      price = value;
      if (price > reference) reference = price;
      discountAmount = Math.max(reference - price, 0);
      discountPercent = reference > 0 ? (discountAmount / reference) * 100 : 0;
    } else if (changedField === 'promo_dinero') {
      if (reference === 0 && value > 0) reference = value;
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

  return { getReferencePrice, calculateLinkedPricing };
}));
