const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const security = require('../public/js/security');
const { getSizesForProduct } = require('../utils/productos');

test('TDD-TC-104: allowedHandlerFunctions en security.js autoriza deleteWarehouseMovement, onFinalPriceInputChange y onFinalPriceInputBlur', () => {
  const securityContent = fs.readFileSync(path.join(__dirname, '../public/js/security.js'), 'utf8');

  // Verify functions are in the whitelist set
  assert.match(securityContent, /'deleteWarehouseMovement'/);
  assert.match(securityContent, /'onFinalPriceInputChange'/);
  assert.match(securityContent, /'onFinalPriceInputBlur'/);

  if (typeof security.isAllowedHandler === 'function') {
    assert.equal(security.isAllowedHandler('deleteWarehouseMovement(589)'), true);
    assert.equal(security.isAllowedHandler('onFinalPriceInputChange(this)'), true);
    assert.equal(security.isAllowedHandler('onFinalPriceInputBlur(this)'), true);
    assert.equal(security.isAllowedHandler('alert("hack")'), false);
  }
});

test('TDD-TC-105: app.js enlaza eventos y coordina recálculo reactivo en item-final-price-input', () => {
  const appContent = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

  // Verify window export of deleteWarehouseMovement
  assert.match(appContent, /window\.deleteWarehouseMovement\s*=\s*deleteWarehouseMovement/);

  // Verify direct event binding in item-final-price-input inside addQuoteItemRow
  assert.match(appContent, /addEventListener\(['"]input['"],\s*\(?e\)?\s*=>\s*onFinalPriceInputChange/);

  // Verify recalcTotalsWithDiscounts reads enteredFinal from finalInput
  assert.match(appContent, /const enteredFinal\s*=\s*finalInput\s*\?\s*parseFloat\(finalInput\.value\)\s*:\s*NaN/);
});

test('TDD-TC-106: híbridos de semilla contienen los 10 calibres oficiales y Muralla Max no es híbrido', () => {
  const hybridAccel = {
    id: 5,
    producto: 'A-7573 ACCELERON',
    tipo_categoria: 'Híbrido',
    tamanos: 'BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2'
  };
  const hybridPoncho = {
    id: 19,
    producto: 'A-7573 PONCHO',
    tipo_categoria: 'Híbrido',
    tamanos: 'BT1, BT2, BT3, BW1, BW2, PT1, PT2, PT3, PW1, PW2'
  };

  const sizesAccel = getSizesForProduct(hybridAccel);
  const sizesPoncho = getSizesForProduct(hybridPoncho);

  assert.equal(sizesAccel.length, 10);
  assert.ok(sizesAccel.includes('PW1'));
  assert.ok(sizesAccel.includes('PW2'));
  assert.ok(sizesAccel.includes('PT1'));

  assert.equal(sizesPoncho.length, 10);
  assert.ok(sizesPoncho.includes('PT1'));
  assert.ok(sizesPoncho.includes('PT2'));
  assert.ok(sizesPoncho.includes('PT3'));
  assert.ok(sizesPoncho.includes('PW1'));

  // Verify db.js contains schema update for MURALLA MAX to Agroquímicos and full 10 sizes
  const dbContent = fs.readFileSync(path.join(__dirname, '../db.js'), 'utf8');
  assert.match(dbContent, /Agroquímicos.*MURALLA MAX/is);
});

