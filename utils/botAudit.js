'use strict';

const db = require('../db');

function missingSchema(error) {
  return Boolean(error && (error.code === '42P01' || error.code === '42703'));
}

async function withBotSchema(work) {
  try {
    return await work();
  } catch (error) {
    if (!missingSchema(error) || typeof db.ensureBotSchema !== 'function') throw error;
    await db.ensureBotSchema();
    return work();
  }
}

async function writeBotAudit(entry) {
  const params = [
    entry.claveId == null ? null : Number(entry.claveId),
    entry.method,
    entry.template,
    Number(entry.status),
    entry.codigo || null,
    Math.max(0, Number(entry.durationMs) || 0),
    entry.requestId || null
  ];
  await withBotSchema(async () => {
    await db.run(`
      DELETE FROM bot_llamadas
      WHERE creado_en < NOW() - INTERVAL '180 days'
      /* bot:auditoria-purga */
    `);
    await db.run(`
      INSERT INTO bot_llamadas
        (clave_id, metodo, ruta_plantilla, codigo_http, codigo_error, duracion_ms, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      /* bot:auditoria-alta */
    `, params);
  });
}

async function findKeyByPrefix(prefix) {
  return withBotSchema(() => db.get(`
    SELECT id, nombre, prefijo, hash, alcances, asesor_id, rol_visibilidad,
           limite_por_minuto, creada_en, revocada_en
    FROM bot_claves
    WHERE prefijo = ?
    /* bot:clave-prefijo */
  `, [prefix]));
}

async function findKeyById(id) {
  return withBotSchema(() => db.get(`
    SELECT id, nombre, prefijo, alcances, asesor_id, rol_visibilidad,
           limite_por_minuto, creada_en, revocada_en
    FROM bot_claves
    WHERE id = ?
    /* bot:clave-id */
  `, [id]));
}

async function findLinkedPerson(asesorId) {
  return db.get(`
    SELECT id, nivel_rol, activo
    FROM asesores
    WHERE id = ?
    /* bot:asesor-vinculo */
  `, [asesorId]);
}

module.exports = {
  missingSchema,
  withBotSchema,
  writeBotAudit,
  findKeyByPrefix,
  findKeyById,
  findLinkedPerson
};
