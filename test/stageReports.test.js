const test = require('node:test');
const assert = require('node:assert/strict');
const { getActiveStageCodesForDate, isStageActiveOnDate } = require('../utils/stageReports');

test('detecta múltiples etapas activas en un mismo mes', () => {
  const stages = [
    { clave: 'V', fecha_inicio: '2026-07-01', fecha_fin: '2027-01-31', color: '#60a5fa' },
    { clave: 'DV', fecha_inicio: '2026-10-01', fecha_fin: '2027-03-31', color: '#34d399' },
    { clave: 'DR', fecha_inicio: '2027-01-01', fecha_fin: '2027-04-30', color: '#f59e0b' },
    { clave: 'C', fecha_inicio: '2027-03-01', fecha_fin: '2027-07-31', color: '#ef4444' }
  ];

  assert.deepEqual(getActiveStageCodesForDate(stages, '2027-01-15'), ['V', 'DV', 'DR']);
});

test('incluye los límites de inicio y fin como fechas activas', () => {
  const stages = [{ clave: 'DR', fecha_inicio: '2027-01-01', fecha_fin: '2027-01-31' }];
  assert.equal(isStageActiveOnDate(stages[0], '2027-01-01'), true);
  assert.equal(isStageActiveOnDate(stages[0], '2027-01-31'), true);
  assert.equal(isStageActiveOnDate(stages[0], '2027-02-01'), false);
});
