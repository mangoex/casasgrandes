const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMovementItems, validateMultiItemSalida } = require('../utils/almacen');

test('normalizeMovementItems: convierte un array multi-ítem a lista uniforme de partidas', () => {
  const body = {
    tipo: 'Salida',
    opcion_operacion: 'Crédito',
    numero_remision: 'R-17762',
    numero_movimiento: 'S-102',
    items: [
      { producto_id: 10, lote: 'L-2026A', tamano: null, cantidad: 50, precio_venta: 350.5, categoria: 'Agroquímicos' },
      { producto_id: 15, lote: 'SEM-01', tamano: 'Calibre 1', cantidad: 20, precio_venta: 2400.0, categoria: 'Semilla' }
    ]
  };

  const items = normalizeMovementItems(body);
  assert.equal(items.length, 2);
  assert.equal(items[0].producto_id, 10);
  assert.equal(items[0].lote, 'L-2026A');
  assert.equal(items[0].cantidad, 50);
  assert.equal(items[0].precio_venta, 350.5);
  assert.equal(items[0].categoria, 'Agroquímicos');

  assert.equal(items[1].producto_id, 15);
  assert.equal(items[1].lote, 'SEM-01');
  assert.equal(items[1].tamano, 'Calibre 1');
  assert.equal(items[1].cantidad, 20);
  assert.equal(items[1].precio_venta, 2400.0);
  assert.equal(items[1].categoria, 'Semilla');
});

test('normalizeMovementItems: soporta formato legado de 1 solo producto en la raíz', () => {
  const body = {
    tipo: 'Salida',
    producto_id: '42',
    lote: 'L-LEGACY',
    tamano: null,
    cantidad: '15.5',
    precio_venta: '500',
    categoria: 'Agroquímicos'
  };

  const items = normalizeMovementItems(body);
  assert.equal(items.length, 1);
  assert.equal(items[0].producto_id, 42);
  assert.equal(items[0].lote, 'L-LEGACY');
  assert.equal(items[0].cantidad, 15.5);
  assert.equal(items[0].precio_venta, 500);
});

test('validateMultiItemSalida: aprueba remisión cuando todas las partidas tienen stock suficiente', async () => {
  const items = [
    { producto_id: 1, lote: 'LOT-A', tamano: null, cantidad: 10, categoria: 'Agroquímicos' },
    { producto_id: 2, lote: 'SEM-1', tamano: 'C1', cantidad: 5, categoria: 'Semilla' }
  ];

  const stockMock = async (prodId, lote, tamano) => {
    if (prodId === 1 && lote === 'LOT-A') return 25.0;
    if (prodId === 2 && lote === 'SEM-1' && tamano === 'C1') return 10.0;
    return 0.0;
  };

  const result = await validateMultiItemSalida(items, stockMock);
  assert.equal(result.valido, true);
});

test('validateMultiItemSalida: rechaza y señala la partida exacta cuando una de ellas excede el stock', async () => {
  const items = [
    { producto_id: 1, lote: 'LOT-A', tamano: null, cantidad: 10, categoria: 'Agroquímicos' },
    { producto_id: 2, lote: 'LOT-B', tamano: null, cantidad: 40, categoria: 'Agroquímicos' } // Solo hay 15
  ];

  const stockMock = async (prodId, lote) => {
    if (prodId === 1 && lote === 'LOT-A') return 20.0;
    if (prodId === 2 && lote === 'LOT-B') return 15.0;
    return 0.0;
  };

  const result = await validateMultiItemSalida(items, stockMock);
  assert.equal(result.valido, false);
  assert.match(result.error, /Partida #2/);
  assert.match(result.error, /LOT-B/);
  assert.match(result.error, /Disponibles: 15/);
});

test('validateMultiItemSalida: exige tamaño para productos de semilla en partidas', async () => {
  const items = [
    { producto_id: 5, lote: 'SEM-LOT', tamano: '', cantidad: 10, categoria: 'Semilla' }
  ];

  const result = await validateMultiItemSalida(items, async () => 100);
  assert.equal(result.valido, false);
  assert.match(result.error, /tamaño es obligatorio para productos de categoría Semilla/);
});
