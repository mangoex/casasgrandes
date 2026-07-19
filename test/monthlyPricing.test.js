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
