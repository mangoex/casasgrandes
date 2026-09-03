const test = require('node:test');
const assert = require('node:assert/strict');
const { getNetPrice } = require('../utils/pricing');

test('usa el precio programado mensual para productos con escala de volumen', () => {
  const product = {
    list_price_mxn: 2500,
    precio_programado_mxn: 2500,
    tipo_categoria: 'Híbrido',
    descontar: 1,
    base_usd: 53,
    descuento_fijo_quimicos: 0
  };

  assert.equal(getNetPrice(product, 0.8, 100, null), 1900);
});

test('conserva el cálculo legado cuando no hay un precio mensual programado', () => {
  const product = {
    list_price_mxn: 6210,
    tipo_categoria: 'Híbrido',
    descontar: 1,
    base_usd: 53,
    descuento_fijo_quimicos: 0
  };

  assert.notEqual(getNetPrice(product, 0.8, 100, null), 6210 * 0.8 - 100);
});

test('aplica el descuento de cuenta clave a un híbrido sin escala de volumen', () => {
  const product = {
    list_price_mxn: 6500,
    tipo_categoria: 'Híbrido',
    descontar: 0,
    base_usd: 0,
    descuento_fijo_quimicos: 0
  };

  assert.equal(getNetPrice(product, 1, 40, null), 6460);
});

test('TDD-TC-089: Cuenta Clave aplica exclusivamente a Semillas e Híbridos, nunca a Agroquímicos o Fertilizantes', () => {
  const { isKeyAccountEligible, isKeyAccountEligibleCategory } = require('../utils/pricing');

  // 1. Verificación de categorías
  assert.equal(isKeyAccountEligibleCategory('Híbrido'), true);
  assert.equal(isKeyAccountEligibleCategory('Semilla'), true);
  assert.equal(isKeyAccountEligibleCategory('Agroquímico'), false);
  assert.equal(isKeyAccountEligibleCategory('Fertilizante'), false);

  // 2. Producto Semilla/Híbrido (ej. Hipopótamo o Calamar): aplica descuento de cuenta clave
  const semilla = {
    producto: 'Hipopótamo Acceleron',
    list_price_mxn: 7015,
    tipo_categoria: 'Híbrido',
    descontar: 0,
    base_usd: 0,
    descuento_fijo_quimicos: 0
  };
  assert.equal(isKeyAccountEligible(semilla), true);
  assert.equal(getNetPrice(semilla, 1, 100, null), 6915);

  // 3. Producto Agroquímico (ej. Clavis + Desis): NO aplica descuento de cuenta clave
  const agroquimico = {
    producto: 'Clavis',
    list_price_mxn: 897.19,
    tipo_categoria: 'Agroquímico',
    descontar: 0,
    base_usd: 0,
    descuento_fijo_quimicos: 0
  };
  assert.equal(isKeyAccountEligible(agroquimico), false);
  assert.equal(getNetPrice(agroquimico, 1, 100, null), 897.19); // Intacto, sin -$100

  // 4. Producto Fertilizante: NO aplica descuento de cuenta clave
  const fertilizante = {
    producto: 'Urea',
    list_price_mxn: 15400,
    tipo_categoria: 'Fertilizante',
    descontar: 0,
    base_usd: 0,
    descuento_fijo_quimicos: 0
  };
  assert.equal(isKeyAccountEligible(fertilizante), false);
  assert.equal(getNetPrice(fertilizante, 1, 100, null), 15400);
});
