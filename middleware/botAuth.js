'use strict';

const { pepper, extractPrefix, hashPresented, hashesEqual, DUMMY_HASH } = require('../utils/botKeys');
const { consumeBotLimit, UNKNOWN_PER_MINUTE } = require('../utils/botRateLimit');
const { errorBody, parseAlcances, listView, detailView, movementView } = require('../utils/botHttp');
const { writeBotAudit, findKeyByPrefix, findLinkedPerson } = require('../utils/botAudit');

const MENSAJE_CLAVE = 'La clave no es válida.';
const MENSAJE_LIMITE = 'La clave superó su límite por minuto.';

function clientAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || 'desconocida');
}

function attachAudit(req, res, context) {
  const started = Date.now();
  let recorded = false;
  const originalJson = res.json.bind(res);
  res.json = body => {
    const status = res.statusCode && res.statusCode >= 100 ? res.statusCode : 200;
    const codigo = context.codigoInterno || (body && body.error ? body.error.codigo : null);
    const persist = () => {
      if (recorded || !context.audit) return Promise.resolve();
      recorded = true;
      return writeBotAudit({
        claveId: context.claveId,
        method: req.method,
        template: context.template,
        status,
        codigo,
        durationMs: Date.now() - started,
        requestId: req.requestId || null
      });
    };
    return persist()
      .then(() => originalJson(body))
      .catch(() => {
        console.error(JSON.stringify({ event: 'bot_audit_failed', request_id: req.requestId || null }));
        if (res.headersSent) return undefined;
        res.statusCode = 500;
        return originalJson(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
      });
  };
}

function sendLimit(res, decision) {
  res.set('Retry-After', String(decision.retryAfter));
  res.set('RateLimit-Remaining', '0');
  return res.status(429).json(errorBody('LIMITE_EXCEDIDO', MENSAJE_LIMITE));
}

function requireBotRead(kind, template) {
  return async function botRead(req, res, next) {
    const context = { audit: false, claveId: null, codigoInterno: null, template };
    attachAudit(req, res, context);
    try {
      if (!pepper()) {
        return res.status(503).json(errorBody('SERVICIO_NO_DISPONIBLE', 'El API de bots no está configurado.'));
      }
      const presented = req.get('x-api-key');
      const prefix = extractPrefix(presented);
      const row = prefix ? await findKeyByPrefix(prefix) : null;
      const storedHash = row && typeof row.hash === 'string' ? row.hash : DUMMY_HASH;
      const matches = hashesEqual(hashPresented(presented || ''), storedHash);
      if (!row || !matches) {
        const decision = consumeBotLimit(`desconocida:${clientAddress(req)}`, UNKNOWN_PER_MINUTE);
        if (!decision.allowed) return sendLimit(res, decision);
        context.audit = true;
        context.codigoInterno = 'NO_AUTENTICADO';
        return res.status(401).json(errorBody('NO_AUTENTICADO', MENSAJE_CLAVE));
      }

      context.claveId = Number(row.id);
      context.audit = true;
      const decision = consumeBotLimit(`clave:${row.id}`, Number(row.limite_por_minuto));
      if (!decision.allowed) {
        context.codigoInterno = 'LIMITE_EXCEDIDO';
        return sendLimit(res, decision);
      }
      if (row.revocada_en) {
        context.codigoInterno = 'CLAVE_REVOCADA';
        return res.status(401).json(errorBody('NO_AUTENTICADO', MENSAJE_CLAVE));
      }
      const alcances = parseAlcances(row.alcances);
      if (!alcances.includes('inventario:leer')) {
        context.codigoInterno = 'ALCANCE_DENEGADO';
        return res.status(403).json(errorBody(
          'ALCANCE_DENEGADO',
          'La clave no incluye el alcance inventario:leer.'
        ));
      }

      let role = row.rol_visibilidad;
      if (row.asesor_id != null) {
        const person = await findLinkedPerson(row.asesor_id);
        if (!person || Number(person.activo) !== 1) {
          context.codigoInterno = 'VINCULO_INVALIDO';
          return res.status(401).json(errorBody('NO_AUTENTICADO', MENSAJE_CLAVE));
        }
        role = person.nivel_rol;
      }
      const view = kind === 'movimientos' ? movementView(role) : (kind === 'detalle' ? detailView(role) : listView(role));
      if (!view) {
        context.codigoInterno = 'ROL_SIN_VISIBILIDAD';
        return res.status(403).json(errorBody('ROL_SIN_VISIBILIDAD', 'El rol no puede consultar esta información.'));
      }
      req.bot = {
        claveId: Number(row.id),
        role,
        view,
        limite: Number(row.limite_por_minuto)
      };
      return next();
    } catch (error) {
      console.error(JSON.stringify({ event: 'bot_auth_failed', request_id: req.requestId || null }));
      context.codigoInterno = 'ERROR_INTERNO';
      return res.status(500).json(errorBody('ERROR_INTERNO', 'No fue posible completar la consulta.'));
    }
  };
}

module.exports = {
  requireBotRead,
  clientAddress
};
