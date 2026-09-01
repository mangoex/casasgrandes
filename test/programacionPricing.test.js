const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLinkedPricing, normalizeLinkedPricing } = require('../public/js/programacion-pricing');

test('TDD-TC-063: al cambiar el precio recalcula el descuento en pesos y porcentaje', () => {
  assert.deepEqual(calculateLinkedPricing(7015, 'precio', 5926), {
    referencePrice: 7015,
    precio: 5926,
    promo_dinero: 1089,
    promo_porcentaje: 15.5239
  });
});

test('TDD-TC-064: al cambiar el descuento en pesos recalcula precio y porcentaje', () => {
  assert.deepEqual(calculateLinkedPricing(7015, 'promo_dinero', 1000), {
    referencePrice: 7015,
    precio: 6015,
    promo_dinero: 1000,
    promo_porcentaje: 14.2552
  });
});

test('TDD-TC-065: al cambiar el porcentaje recalcula descuento en pesos y precio', () => {
  assert.deepEqual(calculateLinkedPricing(7015, 'promo_porcentaje', 10), {
    referencePrice: 7015,
    precio: 6313.5,
    promo_dinero: 701.5,
    promo_porcentaje: 10
  });
});

test('prioriza el descuento existente al normalizar una fila legada', () => {
  assert.deepEqual(normalizeLinkedPricing(7015, 7015, 1089, 0), {
    referencePrice: 7015,
    precio: 5926,
    promo_dinero: 1089,
    promo_porcentaje: 15.5239
  });
});

test('limita el descuento al cien por ciento y nunca genera importes negativos', () => {
  assert.deepEqual(calculateLinkedPricing(7015, 'promo_porcentaje', 150), {
    referencePrice: 7015,
    precio: 0,
    promo_dinero: 7015,
    promo_porcentaje: 100
  });
});
