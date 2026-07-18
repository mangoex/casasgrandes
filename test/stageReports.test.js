const test = require('node:test');
const assert = require('node:assert/strict');
const { getActiveStageCodesForDate, isStageActiveOnDate } = require('../utils/stageReports');

test('detecta Venta y Cosecha activas durante julio', () => {
  const stages = [
    { clave: 'V', fecha_inicio: '2026-07-01', fecha_fin: '2027-01-31', color: '#60a5fa' },
    { clave: 'DV', fecha_inicio: '2025-10-01', fecha_fin: '2026-03-31', color: '#34d399' },
    { clave: 'DR', fecha_inicio: '2026-01-01', fecha_fin: '2026-04-30', color: '#f59e0b' },
    { clave: 'C', fecha_inicio: '2026-03-01', fecha_fin: '2026-07-31', color: '#ef4444' }
  ];

  assert.deepEqual(getActiveStageCodesForDate(stages, '2026-07-18'), ['V', 'C']);
});

test('incluye los límites de inicio y fin como fechas activas', () => {
  const stages = [{ clave: 'DR', fecha_inicio: '2027-01-01', fecha_fin: '2027-01-31' }];
  assert.equal(isStageActiveOnDate(stages[0], '2027-01-01'), true);
  assert.equal(isStageActiveOnDate(stages[0], '2027-01-31'), true);
  assert.equal(isStageActiveOnDate(stages[0], '2027-02-01'), false);
});
