const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLotStock, validateLotSalida, filterLotsWithStock } = require('../utils/almacen');

test('Cálculo de saldos por lote para producto agroquímico con múltiples lotes', () => {
  const movimientos = [
    { producto_id: 1, lote: 'L-2026A', cantidad_entrante: 100, cantidad_saliente: 0 },
    { producto_id: 1, lote: 'L-2026B', cantidad_entrante: 50, cantidad_saliente: 0 },
    { producto_id: 1, lote: 'L-2026A', cantidad_entrante: 0, cantidad_saliente: 30 },
    { producto_id: 1, lote: 'L-2026B', cantidad_entrante: 0, cantidad_saliente: 10 }
  ];

  const stockLoteA = calculateLotStock(movimientos, 'L-2026A');
  const stockLoteB = calculateLotStock(movimientos, 'L-2026B');

  assert.equal(stockLoteA, 70);
  assert.equal(stockLoteB, 40);
});

test('Cálculo de saldos por lote y tamaño para semillas híbridas', () => {
  const movimientos = [
    { producto_id: 5, lote: 'SEM-01', tamano: 'Calibre 1', cantidad_entrante: 50, cantidad_saliente: 0 },
    { producto_id: 5, lote: 'SEM-01', tamano: 'Calibre 2', cantidad_entrante: 30, cantidad_saliente: 0 },
    { producto_id: 5, lote: 'SEM-02', tamano: 'Calibre 1', cantidad_entrante: 40, cantidad_saliente: 0 },
    { producto_id: 5, lote: 'SEM-01', tamano: 'Calibre 1', cantidad_entrante: 0, cantidad_saliente: 20 },
    { producto_id: 5, lote: 'SEM-01', tamano: 'Calibre 2', cantidad_entrante: 0, cantidad_saliente: 5 }
  ];

  assert.equal(calculateLotStock(movimientos, 'SEM-01', 'Calibre 1'), 30);
  assert.equal(calculateLotStock(movimientos, 'SEM-01', 'Calibre 2'), 25);
  assert.equal(calculateLotStock(movimientos, 'SEM-02', 'Calibre 1'), 40);
  assert.equal(calculateLotStock(movimientos, 'SEM-02', 'Calibre 2'), 0);
});

test('Validación de cantidades de salida: no exceder saldo disponible del lote', () => {
  const lotStock = 25.5;

  const validSalida = validateLotSalida(lotStock, 20.0);
  assert.equal(validSalida.valido, true);

  const exactSalida = validateLotSalida(lotStock, 25.5);
  assert.equal(exactSalida.valido, true);

  const invalidSalida = validateLotSalida(lotStock, 26.0);
  assert.equal(invalidSalida.valido, false);
  assert.match(invalidSalida.mensaje, /insuficientes/i);

  const zeroSalida = validateLotSalida(lotStock, 0);
  assert.equal(zeroSalida.valido, false);

  const negativeSalida = validateLotSalida(lotStock, -5);
  assert.equal(negativeSalida.valido, false);
});

test('Filtrado de lotes con stock > 0 por producto_id', () => {
  const movimientos = [
    { producto_id: 10, lote: 'LOT-A', cantidad_entrante: 100, cantidad_saliente: 100 }, // Stock 0
    { producto_id: 10, lote: 'LOT-B', cantidad_entrante: 50, cantidad_saliente: 10 },   // Stock 40
    { producto_id: 10, lote: 'LOT-C', cantidad_entrante: 80, cantidad_saliente: 20 },   // Stock 60
    { producto_id: 20, lote: 'LOT-X', cantidad_entrante: 200, cantidad_saliente: 0 }    // Otro producto
  ];

  const availableLots = filterLotsWithStock(movimientos, 10);
  assert.equal(availableLots.length, 2);
  
  const lotB = availableLots.find(l => l.lote === 'LOT-B');
  const lotC = availableLots.find(l => l.lote === 'LOT-C');
  assert.ok(lotB);
  assert.equal(lotB.stock, 40);
  assert.ok(lotC);
  assert.equal(lotC.stock, 60);

  const lotA = availableLots.find(l => l.lote === 'LOT-A');
  assert.equal(lotA, undefined);
});

test('Filtrado de lotes con stock > 0 por producto_id y tamano', () => {
  const movimientos = [
    { producto_id: 7, lote: 'DK-L1', tamano: 'Calibre 1', cantidad_entrante: 30, cantidad_saliente: 5 },   // Stock 25
    { producto_id: 7, lote: 'DK-L1', tamano: 'Calibre 2', cantidad_entrante: 20, cantidad_saliente: 20 },  // Stock 0
    { producto_id: 7, lote: 'DK-L2', tamano: 'Calibre 1', cantidad_entrante: 15, cantidad_saliente: 0 },   // Stock 15
    { producto_id: 7, lote: 'DK-L2', tamano: 'Plano Grande', cantidad_entrante: 50, cantidad_saliente: 10 } // Stock 40
  ];

  // Filtro por Calibre 1
  const calibre1Lots = filterLotsWithStock(movimientos, 7, 'Calibre 1');
  assert.equal(calibre1Lots.length, 2);
  assert.equal(calibre1Lots.find(l => l.lote === 'DK-L1').stock, 25);
  assert.equal(calibre1Lots.find(l => l.lote === 'DK-L2').stock, 15);

  // Filtro por Calibre 2 (lote DK-L1 se agotó a 0)
  const calibre2Lots = filterLotsWithStock(movimientos, 7, 'Calibre 2');
  assert.equal(calibre2Lots.length, 0);

  // Filtro por Plano Grande
  const planoGrandeLots = filterLotsWithStock(movimientos, 7, 'Plano Grande');
  assert.equal(planoGrandeLots.length, 1);
  assert.equal(planoGrandeLots[0].lote, 'DK-L2');
  assert.equal(planoGrandeLots[0].stock, 40);
});
