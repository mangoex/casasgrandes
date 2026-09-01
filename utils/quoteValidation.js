'use strict';

function normalizeQuoteItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError('Quote requires at least one item');
  }
  if (items.length > 100) {
    throw new TypeError('Quote cannot contain more than 100 items');
  }

  return items.map(item => {
    const productId = Number(item.producto_id);
    const quantity = Number(item.cantidad);
    const appliedDiscount = Number(item.descuento_aplicado || 0);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new TypeError('Quote item product must be a positive integer');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new TypeError('Quote item quantity must be positive');
    }
    if (!Number.isFinite(appliedDiscount) || appliedDiscount < 0) {
      throw new TypeError('Quote item discount must be non-negative');
    }
    return {
      producto_id: productId,
      cantidad: quantity,
      descuento_aplicado: appliedDiscount
    };
  });
}

module.exports = {
  normalizeQuoteItems
};
