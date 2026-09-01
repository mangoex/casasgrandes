const test = require('node:test');
const assert = require('node:assert/strict');
const { getReferencePrice, calculateLinkedPricing } = require('../public/js/programacion-pricing');

test('al cambiar el precio recalcula el descuento en pesos y porcentaje', () => {
  assert.deepEqual(calculateLinkedPricing(8104, 'precio', 7015), {
    referencePrice: 8104,
    precio: 7015,
    promo_dinero: 1089,
    promo_porcentaje: 13.4378
  });
});

test('al cambiar el descuento en pesos recalcula precio y porcentaje', () => {
  assert.deepEqual(calculateLinkedPricing(8104, 'promo_dinero', 1000), {
    referencePrice: 8104,
    precio: 7104,
    promo_dinero: 1000,
    promo_porcentaje: 12.3396
  });
});

test('al cambiar el porcentaje recalcula descuento en pesos y precio', () => {
  assert.deepEqual(calculateLinkedPricing(8104, 'promo_porcentaje', 10), {
    referencePrice: 8104,
    precio: 7293.6,
    promo_dinero: 810.4,
    promo_porcentaje: 10
  });
});

test('recupera la referencia de registros existentes por monto o porcentaje', () => {
  assert.equal(getReferencePrice(7015, 1089, 0), 8104);
  assert.equal(getReferencePrice(7293.6, 0, 10), 8104);
});

test('limita el descuento al cien por ciento y nunca genera importes negativos', () => {
  assert.deepEqual(calculateLinkedPricing(8104, 'promo_porcentaje', 150), {
    referencePrice: 8104,
    precio: 0,
    promo_dinero: 8104,
    promo_porcentaje: 100
  });
});
