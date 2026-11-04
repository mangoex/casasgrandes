'use strict';

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const { pepper, generateKey, hashKey } = require('../utils/botKeys');
const {
  errorBody,
  SERVICE_ROLES,
  parseAlcances,
  toIso,
  encodeCursor,
  readLimit,
  decodeCursor,
  unknownQuery
} = require('../utils/botHttp');
const { withBotSchema, findKeyById, findLinkedPerson } = require('../utils/botAudit');

const router = express.Router();

function requirePepper(req, res, next) {
  if (!pepper()) {
    return res.status(503).json(errorBody('SERVICIO_NO_DISPONIBLE', 'El API de bots no está configurado.'));
  }
  return next();
}

function authenticateAdmin(req, res, next) {
  const fake = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      if (this.statusCode === 503) {
        return res.status(503).json(errorBody('SERVICIO_NO_DISPONIBLE', 'El API de bots no está configurado.'));
      }
      return res.status(401).json(errorBody('NO_AUTENTICADO', 'La sesión no es válida.'));
    },
    setHeader() {},
    getHeader() { return undefined; }
  };
  return authenticateToken(req, fake, () => {
    if (!req.user || req.user.nivel_rol !== 'Administrador') {
      return res.status(403).json(errorBody('ROL_SIN_VISIBILIDAD', 'Solo un administrador puede administrar claves.'));
    }
    return next();
  });
}

function publicKey(row, clave) {
  const body = {
    id: Number(row.id),
    nombre: row.nombre,
    prefijo: row.prefijo,
    alcances: parseAlcances(row.alcances),
    asesor_id: row.asesor_id == null ? null : Number(row.asesor_id),
    rol_visibilidad: row.rol_visibilidad || null,
    limite_por_minuto: Number(row.limite_por_minuto),
    activa: row.revocada_en == null,
    creada_en: toIso(row.creada_en),
    revocada_en: row.revocada_en ? toIso(row.revocada_en) : null
  };
  if (clave) {
    return {
      id: body.id,
      nombre: body.nombre,
      prefijo: body.prefijo,
      clave,
      alcances: body.alcances,
      asesor_id: body.asesor_id,
      rol_visibilidad: body.rol_visibilidad,
      limite_por_minuto: body.limite_por_minuto,
      activa: true,
      creada_en: body.creada_en,
      revocada_en: null
    };
  }
  return body;
}

function validateNewKey(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'El cuerpo no es válido.';
  const allowed = new Set(['nombre', 'alcances', 'limite_por_minuto', 'asesor_id', 'rol_visibilidad']);
  if (Object.keys(body).some(key => !allowed.has(key))) return 'El cuerpo incluye un campo no declarado.';
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return 'Falta un campo del contrato.';
  }
  const nombre = String(body.nombre || '').trim();
  if (!nombre || nombre.length > 80) return 'El nombre de la clave no es válido.';
  if (!Array.isArray(body.alcances) || body.alcances.length !== 1 || body.alcances[0] !== 'inventario:leer') {
    return 'El alcance de este corte es inventario:leer.';
  }
  if (!Number.isInteger(body.limite_por_minuto) || body.limite_por_minuto < 1 || body.limite_por_minuto > 600) {
    return 'El límite por minuto debe estar entre 1 y 600.';
  }
  const hasPerson = body.asesor_id != null;
  const hasRole = body.rol_visibilidad != null;
  if (hasPerson === hasRole) return 'Hace falta exactamente un vínculo: asesor_id o rol_visibilidad.';
  if (hasPerson && (!Number.isInteger(body.asesor_id) || body.asesor_id < 1)) return 'El asesor_id no es válido.';
  if (hasRole && !SERVICE_ROLES.includes(body.rol_visibilidad)) return 'El rol de visibilidad no está autorizado.';
  return '';
}

router.use(requirePepper);

router.post('/claves', authenticateAdmin, async (req, res) => {
  const message = validateNewKey(req.body);
  if (message) return res.status(400).json(errorBody('VALIDACION', message));
  try {
    if (req.body.asesor_id != null) {
      const person = await findLinkedPerson(req.body.asesor_id);
      if (!person || Number(person.activo) !== 1) {
        return res.status(400).json(errorBody('VALIDACION', 'La persona vinculada no está activa.'));
      }
    }
    const created = await insertKey(req);
    const row = await findKeyById(created.id);
    return res.status(201).json(publicKey(row, created.clave));
  } catch (error) {
    console.error(JSON.stringify({ event: 'bot_key_create_failed', request_id: req.requestId || null }));
    return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
  }
});

router.get('/claves', authenticateAdmin, async (req, res) => {
  try {
    const page = await readPage(req.query);
    if (!page.ok) return res.status(400).json(errorBody('VALIDACION', 'El parámetro no forma parte del contrato.'));
    const params = [];
    let where = '';
    if (page.cursor) {
      where = 'WHERE id < ?';
      params.push(page.cursor);
    }
    params.push(page.limit + 1);
    const rows = await withBotSchema(() => db.all(`
      SELECT id, nombre, prefijo, alcances, asesor_id, rol_visibilidad,
             limite_por_minuto, creada_en, revocada_en
      FROM bot_claves
      ${where}
      ORDER BY id DESC
      LIMIT ?
      /* bot:claves-lista */
    `, params));
    const extra = rows.length > page.limit;
    const datos = (extra ? rows.slice(0, page.limit) : rows).map(row => publicKey(row));
    const siguiente = extra ? encodeCursor(datos[datos.length - 1].id) : null;
    return res.json({ datos, paginacion: { limite: page.limit, siguiente } });
  } catch (error) {
    console.error(JSON.stringify({ event: 'bot_key_list_failed', request_id: req.requestId || null }));
    return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
  }
});

router.post('/claves/:claveId/revocacion', authenticateAdmin, async (req, res) => {
  const id = Number(req.params.claveId);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json(errorBody('VALIDACION', 'El parámetro no forma parte del contrato.'));
  }
  try {
    const result = await withBotSchema(() => db.run(`
      UPDATE bot_claves
      SET revocada_en = COALESCE(revocada_en, NOW())
      WHERE id = ?
      /* bot:clave-revocar */
    `, [id]));
    if (!result.changes) return res.status(404).json(errorBody('NO_ENCONTRADO', 'La clave no está disponible.'));
    const row = await findKeyById(id);
    return res.json({
      id: Number(row.id),
      activa: false,
      revocada_en: toIso(row.revocada_en)
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'bot_key_revoke_failed', request_id: req.requestId || null }));
    return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
  }
});

async function insertKey(req) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = generateKey();
    try {
      const result = await withBotSchema(() => db.run(`
        INSERT INTO bot_claves
          (nombre, prefijo, hash, alcances, asesor_id, rol_visibilidad, limite_por_minuto, creada_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        /* bot:clave-alta */
      `, [
        String(req.body.nombre).trim(),
        generated.prefix,
        hashKey(pepper(), generated.clave),
        JSON.stringify(req.body.alcances),
        req.body.asesor_id == null ? null : req.body.asesor_id,
        req.body.rol_visibilidad,
        req.body.limite_por_minuto,
        req.user.id
      ]));
      return { id: result.id, clave: generated.clave };
    } catch (error) {
      lastError = error;
      if (error && error.code === '23505') continue;
      throw error;
    }
  }
  throw lastError;
}

function readPage(query) {
  if (unknownQuery(query, new Set(['limite', 'cursor']))) return { ok: false };
  const limit = readLimit(query);
  const cursor = decodeCursor(query.cursor);
  if (!limit.ok || !cursor.ok) return { ok: false };
  return { ok: true, limit: limit.value, cursor: cursor.id };
}

module.exports = router;
