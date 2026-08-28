'use strict';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(email|correo|phone|telefono|teléfono|token|secret|password|contrase|api[_-]?key|authorization|url|wa_url)/i;

function assertExternalAIEnabled(env = process.env) {
  if (String(env.AI_EXTERNAL_PROCESSING_ENABLED || '').toLowerCase() !== 'true') {
    throw new Error('External AI processing is disabled');
  }
}

function buildCEOAdvisorProfile(input) {
  return {
    asesor_id: input.asesor_id ?? input.id,
    ventas_historicas_totales_mxn: input.ventas_historicas_totales_mxn || 0,
    ventas_ciclo_actual_mxn: input.ventas_ciclo_actual_mxn || 0,
    total_clientes: input.total_clientes || 0,
    superficie_total_hectareas: input.superficie_total_hectareas || 0
  };
}

function buildOutreachContext({ client, purchaseHistory, products, seasons }) {
  return {
    cliente_alias: `CLIENTE-${client.id}`,
    estatus: client.estado_status,
    historial_compras: purchaseHistory,
    productos_disponibles: products.map(product => ({
      id: product.id,
      nombre: product.producto,
      categoria: product.tipo_categoria
    })),
    temporadas: seasons.map(season => ({
      id: season.id,
      nombre: season.actividad
    }))
  };
}

function buildCoordinatorMessage({ advisorName, visits }) {
  const firstName = String(advisorName || 'asesor').trim().split(/\s+/)[0];
  if (!visits.length) {
    return `Hola ${firstName}. No tienes visitas pendientes registradas. Por favor mantén tu agenda actualizada en la plataforma. ¡Gracias por tu trabajo!`;
  }

  const reminders = visits
    .slice(0, 8)
    .map(visit => `${visit.clientName || visit.cliente_nombre} (${visit.date || visit.fecha_programada || 'sin fecha'})`)
    .join(', ');
  return `Hola ${firstName}. Tienes pendientes estas visitas: ${reminders}. Por favor realiza el check-in o actualiza su estatus en la plataforma. ¡Gracias por mantener la agenda al día!`;
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{20,}\b/gi, REDACTED)
    .replace(/(?:\+?\d[\s().-]*){8,}\d/g, REDACTED);
}

function sanitizeLogDetail(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactSensitiveText(value).slice(0, 2000);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitizeLogDetail(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).slice(0, 50).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitizeLogDetail(item, depth + 1)
    ])
  );
}

module.exports = {
  assertExternalAIEnabled,
  buildCEOAdvisorProfile,
  buildOutreachContext,
  buildCoordinatorMessage,
  redactSensitiveText,
  sanitizeLogDetail
};
