const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStageReportPayload, countWords } = require('../utils/stageReports');

test('countWords counts whitespace-separated words', () => {
  assert.equal(countWords('uno dos tres'), 3);
  assert.equal(countWords('   '), 0);
});

test('validateStageReportPayload rejects DV descriptions above 40 words', () => {
  const payload = {
    etapa_clave: 'DV',
    respuestas: {
      anomalia: 'Sí',
      descripcion_situacion: Array(41).fill('palabra').join(' '),
      comentarios_productor: 'Muy poco texto y suficiente para pasar'
    }
  };

  const result = validateStageReportPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.error, /40 palabras/i);
});

test('validateStageReportPayload rejects DV comments outside the 20-50 word range', () => {
  const payload = {
    etapa_clave: 'DV',
    respuestas: {
      anomalia: 'No',
      descripcion_situacion: 'Sin problema',
      comentarios_productor: 'Muy poco texto'
    }
  };

  const result = validateStageReportPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.error, /20 y 50 palabras/i);
});

test('validateStageReportPayload accepts C comments up to 150 words', () => {
  const payload = {
    etapa_clave: 'C',
    respuestas: {
      hibrido_material: 'Híbrido X',
      rendimiento: '120',
      hectareaje: '10',
      comentarios_productor: Array(150).fill('palabra').join(' ')
    }
  };

  const result = validateStageReportPayload(payload);
  assert.equal(result.ok, true);
});
