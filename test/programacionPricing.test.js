const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateLinkedPricing,
  normalizeLinkedPricing,
  calculateProgramacionRow
} = require('../public/js/programacion-pricing');

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

test('TDD-TC-075: precio del mes y saldo Asesor forman el tope acumulado', () => {
  assert.deepEqual(calculateProgramacionRow(7015, 6926, 1000), {
    referencePrice: 7015,
    precio: 6926,
    promo_dinero: 89,
    promo_porcentaje: 1.2687,
    asesor_dinero: 1000,
    tope_descuento_mxn: 1089
  });
});

test('TDD-TC-076: el saldo Asesor permanece independiente al cambiar el precio del mes', () => {
  const result = calculateProgramacionRow(7015, 5926, 1000);
  assert.equal(result.asesor_dinero, 1000);
  assert.equal(result.promo_dinero, 1089);
  assert.equal(result.tope_descuento_mxn, 2089);
});
