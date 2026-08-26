const test = require('node:test');
const assert = require('node:assert');
const {
  calculateComplianceRate,
  calculateWinRate,
  calculateAverageDealValue,
  classifyActivityStatus,
  buildPipelineFunnel,
  resolveDateRange
} = require('../utils/seguimientoHelpers');

test('Salesforce Tracking Helpers - calculateComplianceRate', () => {
  assert.strictEqual(calculateComplianceRate(0, 0), 0);
  assert.strictEqual(calculateComplianceRate(8, 10), 80);
  assert.strictEqual(calculateComplianceRate(1, 3), 33.3);
  assert.strictEqual(calculateComplianceRate(12, 10), 100, 'Cap at 100%');
});

test('Salesforce Tracking Helpers - calculateWinRate', () => {
  assert.strictEqual(calculateWinRate(0, 0), 0);
  assert.strictEqual(calculateWinRate(5, 20), 25);
  assert.strictEqual(calculateWinRate(10, 10), 100);
});

test('Salesforce Tracking Helpers - calculateAverageDealValue', () => {
  assert.strictEqual(calculateAverageDealValue(0, 0), 0);
  assert.strictEqual(calculateAverageDealValue(150000, 3), 50000);
  assert.strictEqual(calculateAverageDealValue(100, 3), 33.33);
});

test('Salesforce Tracking Helpers - classifyActivityStatus', () => {
  const refDate = '2026-08-26';

  // 1. Completed
  const completed = classifyActivityStatus({ realizada: 1, fecha_programada: '2026-08-20' }, refDate);
  assert.strictEqual(completed.statusKey, 'completada');
  assert.strictEqual(completed.label, 'Realizada');

  // 2. Future or Today Scheduled
  const scheduled = classifyActivityStatus({ realizada: 0, fecha_programada: '2026-08-26' }, refDate);
  assert.strictEqual(scheduled.statusKey, 'pendiente');

  // 3. Late within 7 days (Atrasada)
  const late = classifyActivityStatus({ realizada: 0, fecha_programada: '2026-08-24' }, refDate);
  assert.strictEqual(late.statusKey, 'atrasada');
  assert.strictEqual(late.daysLate, 2);

  // 4. Overdue > 7 days or status 3 (Vencida)
  const overdue = classifyActivityStatus({ realizada: 0, fecha_programada: '2026-08-15' }, refDate);
  assert.strictEqual(overdue.statusKey, 'vencida');
  assert.ok(overdue.daysLate > 7);

  const explicitlyExpired = classifyActivityStatus({ realizada: 3, fecha_programada: '2026-08-25' }, refDate);
  assert.strictEqual(explicitlyExpired.statusKey, 'vencida');
});

test('Salesforce Tracking Helpers - buildPipelineFunnel', () => {
  const quotes = [
    { estatus: 'Borrador', total_mxn: 50000 },
    { estatus: 'Borrador', total_mxn: 25000 },
    { estatus: 'Autorizada', total_mxn: 100000 },
    { estatus: 'Vendido', total_mxn: 80000 },
    { estatus: 'Entregado', total_mxn: 120000 },
    { estatus: 'Cancelada', total_mxn: 30000 }
  ];

  const funnel = buildPipelineFunnel(quotes, 10, 350000);
  assert.strictEqual(funnel.totalQuotes, 6);
  assert.strictEqual(funnel.totalWonMonto, 200000); // 80000 + 120000
  assert.strictEqual(funnel.pipelineActiveMonto, 175000); // 75000 + 100000
  
  // Win rate: 2 won / (2 won + 1 lost) = 66.7%
  assert.strictEqual(funnel.winRate, 66.7);

  const prospectStage = funnel.stages.find(s => s.key === 'prospeccion');
  assert.strictEqual(prospectStage.count, 10);
  assert.strictEqual(prospectStage.monto_mxn, 350000);

  const wonStage = funnel.stages.find(s => s.key === 'ganado');
  assert.strictEqual(wonStage.count, 2);
  assert.strictEqual(wonStage.monto_mxn, 200000);
});

test('Salesforce Tracking Helpers - resolveDateRange presets', () => {
  const base = '2026-08-26'; // Wednesday

  const hoy = resolveDateRange('hoy', null, null, base);
  assert.strictEqual(hoy.fecha_inicio, '2026-08-26');
  assert.strictEqual(hoy.fecha_fin, '2026-08-26');

  const semana = resolveDateRange('semana', null, null, base);
  assert.strictEqual(semana.fecha_inicio, '2026-08-24'); // Monday
  assert.strictEqual(semana.fecha_fin, '2026-08-30'); // Sunday

  const mes = resolveDateRange('mes', null, null, base);
  assert.strictEqual(mes.fecha_inicio, '2026-08-01');
  assert.strictEqual(mes.fecha_fin, '2026-08-31');

  const custom = resolveDateRange('personalizado', '2026-08-05', '2026-08-15', base);
  assert.strictEqual(custom.fecha_inicio, '2026-08-05');
  assert.strictEqual(custom.fecha_fin, '2026-08-15');

  const ciclo = resolveDateRange('ciclo', null, null, base);
  assert.strictEqual(ciclo.fecha_inicio, null);
  assert.strictEqual(ciclo.fecha_fin, null);
});

test('Salesforce Tracking Helpers - Robustness & Edge Cases', () => {
  // Empty data
  const emptyFunnel = buildPipelineFunnel([], 0, 0);
  assert.strictEqual(emptyFunnel.totalQuotes, 0);
  assert.strictEqual(emptyFunnel.winRate, 0);
  assert.strictEqual(emptyFunnel.pipelineActiveMonto, 0);
  assert.strictEqual(emptyFunnel.totalWonMonto, 0);

  // Non-numeric inputs
  assert.strictEqual(calculateComplianceRate('abc', 'xyz'), 0);
  assert.strictEqual(calculateWinRate(null, undefined), 0);
  assert.strictEqual(calculateAverageDealValue('not a number', 5), 0);

  // Overdue boundary: exact 7 days vs 8 days
  const refDate = '2026-08-26';
  const exactly7Days = classifyActivityStatus({ realizada: 0, fecha_programada: '2026-08-19' }, refDate);
  assert.strictEqual(exactly7Days.statusKey, 'atrasada'); // 7 days is late, but within grace period
  
  const eightDays = classifyActivityStatus({ realizada: 0, fecha_programada: '2026-08-18' }, refDate);
  assert.strictEqual(eightDays.statusKey, 'vencida'); // > 7 days is overdue
});

