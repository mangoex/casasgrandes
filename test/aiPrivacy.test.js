const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('TDD-TC-035: IA externa requiere opt-in explícito', () => {
  const { assertExternalAIEnabled } = require('../utils/aiPrivacy');
  assert.throws(() => assertExternalAIEnabled({}), /disabled/i);
  assert.throws(
    () => assertExternalAIEnabled({ AI_EXTERNAL_PROCESSING_ENABLED: 'false' }),
    /disabled/i
  );
  assert.doesNotThrow(
    () => assertExternalAIEnabled({ AI_EXTERNAL_PROCESSING_ENABLED: 'true' })
  );
});

test('TDD-TC-036: perfil CEO excluye identidad y detalle de agricultores', () => {
  const { buildCEOAdvisorProfile } = require('../utils/aiPrivacy');
  const profile = buildCEOAdvisorProfile({
    id: 8,
    nombre: 'Nombre Real',
    email: 'real@example.test',
    telefono: '6141234567',
    ventas_historicas_totales_mxn: 500,
    ventas_ciclo_actual_mxn: 200,
    total_clientes: 4,
    superficie_total_hectareas: 30
  });
  assert.deepEqual(profile, {
    asesor_id: 8,
    ventas_historicas_totales_mxn: 500,
    ventas_ciclo_actual_mxn: 200,
    total_clientes: 4,
    superficie_total_hectareas: 30
  });
  assert.doesNotMatch(JSON.stringify(profile), /Nombre Real|example|6141234567/);
});

test('TDD-TC-037: contexto Outreach usa alias interno sin nombre ni contacto', () => {
  const { buildOutreachContext } = require('../utils/aiPrivacy');
  const context = buildOutreachContext({
    client: {
      id: 44,
      nombre: 'Agricultor Real',
      correo: 'agricultor@example.test',
      telefono: '6145551212',
      estado_status: 'Activo'
    },
    purchaseHistory: [{ producto: 'Semilla X', total_cantidad: 12 }],
    products: [{ id: 2, producto: 'Semilla X', tipo_categoria: 'Híbrido' }],
    seasons: [{ id: 1, actividad: 'P-V' }]
  });
  assert.equal(context.cliente_alias, 'CLIENTE-44');
  assert.doesNotMatch(JSON.stringify(context), /Agricultor Real|example|6145551212/);
});

test('TDD-TC-038: Coordinador construye recordatorio local', () => {
  const { buildCoordinatorMessage } = require('../utils/aiPrivacy');
  const message = buildCoordinatorMessage({
    advisorName: 'Ana Pérez',
    visits: [{ cliente_nombre: 'Cliente Uno', fecha_programada: '2026-07-28' }]
  });
  assert.match(message, /Ana/);
  assert.match(message, /Cliente Uno/);
  assert.match(message, /2026-07-28/);
});

test('TDD-TC-039: logs redactan email, teléfono, token y campos secretos', () => {
  const { sanitizeLogDetail } = require('../utils/aiPrivacy');
  const sanitized = sanitizeLogDetail({
    email: 'persona@example.test',
    telefono: '6141234567',
    token: 'secret-token-value',
    message: 'Contactar persona@example.test al 6141234567',
    count: 3
  });
  assert.equal(sanitized.email, '[REDACTED]');
  assert.equal(sanitized.telefono, '[REDACTED]');
  assert.equal(sanitized.token, '[REDACTED]');
  assert.doesNotMatch(JSON.stringify(sanitized), /persona@example|6141234567|secret-token/);
  assert.equal(sanitized.count, 3);
});

test('TDD-TC-040: producción no lee claves desde DB y Outreach persiste atómicamente', () => {
  const agentsSource = fs.readFileSync(path.join(__dirname, '..', 'agentsService.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const databaseSource = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  assert.doesNotMatch(agentsSource, /globalConfig\.(?:gemini_api_key|openrouter_api_key)/);
  assert.match(agentsSource, /AI_EXTERNAL_PROCESSING_ENABLED/);
  assert.match(agentsSource, /db\.transaction/);
  assert.match(serverSource, /API keys must be configured through environment variables/);
  assert.match(databaseSource, /-\s*'gemini_api_key'\s*-\s*'openrouter_api_key'/);
});
