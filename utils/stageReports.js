function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeStageCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isStageActiveOnDate(stage, targetDate) {
  if (!stage || !targetDate) return false;
  const start = parseDateOnly(stage.fecha_inicio);
  const end = parseDateOnly(stage.fecha_fin);
  const target = parseDateOnly(targetDate);
  if (!start || !end || !target) return false;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  target.setHours(0, 0, 0, 0);
  return target >= start && target <= end;
}

function getActiveStageCodesForDate(stages, targetDate) {
  if (!Array.isArray(stages)) return [];
  return stages
    .filter(stage => isStageActiveOnDate(stage, targetDate))
    .map(stage => normalizeStageCode(stage.clave))
    .filter(Boolean);
}

function countWords(value) {
  if (typeof value !== 'string') return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function validateStageReportPayload(payload) {
  const stageCode = normalizeStageCode(payload?.etapa_clave);
  const responses = payload?.respuestas || {};

  if (stageCode === 'DV' || stageCode === 'DR') {
    const anomaly = String(responses?.anomalia || '').trim();
    const description = String(responses?.descripcion_situacion || '').trim();
    const comments = String(responses?.comentarios_productor || '').trim();

    if (!['Sí', 'No'].includes(anomaly)) {
      return { ok: false, error: 'Debe indicar si hay anomalía.' };
    }

    if (anomaly === 'Sí' && countWords(description) > 40) {
      return { ok: false, error: 'La descripción de anomalía no puede exceder 40 palabras.' };
    }

    if (countWords(comments) < 20 || countWords(comments) > 50) {
      return { ok: false, error: 'Las observaciones del productor deben tener entre 20 y 50 palabras.' };
    }
  }

  if (stageCode === 'C') {
    if (!String(responses?.hibrido_material || '').trim()) {
      return { ok: false, error: 'El campo de híbrido/material es obligatorio.' };
    }
    if (!String(responses?.rendimiento || '').trim()) {
      return { ok: false, error: 'El campo de rendimiento es obligatorio.' };
    }
    if (!String(responses?.hectareaje || '').trim()) {
      return { ok: false, error: 'El campo de hectareaje es obligatorio.' };
    }
    if (countWords(String(responses?.comentarios_productor || '')) > 150) {
      return { ok: false, error: 'Las observaciones del productor no pueden exceder 150 palabras.' };
    }
  }

  return { ok: true };
}

module.exports = {
  parseDateOnly,
  normalizeStageCode,
  isStageActiveOnDate,
  getActiveStageCodesForDate,
  countWords,
  validateStageReportPayload
};
