const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyNucleDiscount,
  isNucleEligibleCategory,
  validateNuclePercentage
} = require('../utils/nuclePricing');

test('TDD-TC-079: Nucle solo acepta porcentajes entre cero y cien', () => {
  assert.equal(validateNuclePercentage(12.5), 12.5);
  assert.throws(() => validateNuclePercentage(-0.01), /invalid_nucle_percentage/);
  assert.throws(() => validateNuclePercentage(100.01), /invalid_nucle_percentage/);
});

test('TDD-TC-080: Nucle identifica Híbridos y Semillas, no Agroquímicos', () => {
  assert.equal(isNucleEligibleCategory('Híbrido'), true);
  assert.equal(isNucleEligibleCategory('Semilla'), true);
  assert.equal(isNucleEligibleCategory('Agroquímico'), false);
});

test('TDD-TC-081: Nucle se calcula sobre precio mensual y se acumula después del asesor', () => {
  const result = applyNucleDiscount({
    enabled: true,
    percentage: 10,
    category: 'Híbrido',
    monthlyPrice: 900,
    priceAfterAdvisor: 800,
    quantity: 2
  });
  assert.deepEqual(result, {
    eligible: true,
    percentage: 10,
    requestedUnitDiscount: 90,
    appliedUnitDiscount: 90,
    finalUnitPrice: 710,
    subtotal: 1420,
    totalDiscount: 180
  });
});

test('TDD-TC-082: Nucle no modifica Agroquímicos', () => {
  const result = applyNucleDiscount({
    enabled: true,
    percentage: 10,
    category: 'Agroquímico',
    monthlyPrice: 500,
    priceAfterAdvisor: 500,
    quantity: 1
  });
  assert.equal(result.appliedUnitDiscount, 0);
  assert.equal(result.finalUnitPrice, 500);
  assert.equal(result.subtotal, 500);
});
