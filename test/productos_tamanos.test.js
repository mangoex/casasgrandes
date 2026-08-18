const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProductSizes, parseProductSizes, getSizesForProduct } = require('../utils/productos');

test('normalizeProductSizes: limpia espacios, filtra vacíos y normaliza lista separada por comas', () => {
  assert.equal(normalizeProductSizes(' BT1,  BT2,  bt3 , bw1 '), 'BT1, BT2, BT3, BW1');
  assert.equal(normalizeProductSizes('PW1,PW2'), 'PW1, PW2');
  assert.equal(normalizeProductSizes(''), null);
  assert.equal(normalizeProductSizes(null), null);
  assert.equal(normalizeProductSizes(undefined), null);
  assert.equal(normalizeProductSizes(' , , '), null);
});

test('parseProductSizes: convierte string separado por comas a un array limpio de tamaños', () => {
  assert.deepEqual(parseProductSizes('BT1, BT2, BT3, BW1, BW2'), ['BT1', 'BT2', 'BT3', 'BW1', 'BW2']);
  assert.deepEqual(parseProductSizes('PW1, PW2'), ['PW1', 'PW2']);
  assert.deepEqual(parseProductSizes(''), []);
  assert.deepEqual(parseProductSizes(null), []);
  assert.deepEqual(parseProductSizes(undefined), []);
});

test('getSizesForProduct: extrae los tamaños dinámicos directamente de la entidad producto', () => {
  const prodWithSizes = {
    id: 1,
    producto: 'A-7573 PONCHO',
    tipo_categoria: 'Híbrido',
    tamanos: 'PW1, PW2'
  };
  assert.deepEqual(getSizesForProduct(prodWithSizes), ['PW1', 'PW2']);

  const prodWithoutSizes = {
    id: 2,
    producto: 'ACIDO FOSFORICO 20LT',
    tipo_categoria: 'Agroquímico',
    tamanos: null
  };
  assert.deepEqual(getSizesForProduct(prodWithoutSizes), []);

  const prodWithCustomSizes = {
    id: 3,
    producto: 'HIPOPÓTAMO ACCELERON',
    tipo_categoria: 'Híbrido',
    tamanos: 'BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2'
  };
  assert.deepEqual(getSizesForProduct(prodWithCustomSizes), [
    'BT1', 'BT2', 'BT3', 'BW1', 'BW2', 'PT1', 'PT2', 'PT3', 'PW1', 'PW2'
  ]);
});

test('getSizesForProduct: busca por nombre de producto en el catálogo allProductsList', () => {
  const catalog = [
    { id: 10, producto: 'A-7573 PONCHO', tamanos: 'PW1, PW2' },
    { id: 11, producto: 'MURALLA MAX 250ML', tamanos: null }
  ];

  assert.deepEqual(getSizesForProduct('A-7573 PONCHO', catalog), ['PW1', 'PW2']);
  assert.deepEqual(getSizesForProduct('MURALLA MAX 250ML', catalog), []);
  assert.deepEqual(getSizesForProduct('INEXISTENTE', catalog), []);
});

