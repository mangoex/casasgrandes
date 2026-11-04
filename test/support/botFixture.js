'use strict';

const db = require('../../db');

function createBotState() {
  return {
    keys: [],
    calls: [],
    products: [],
    movements: [],
    reservations: [],
    lots: [],
    sizesPhysical: [],
    sizesReserved: [],
    sessionUser: null,
    nextKeyId: 1,
    sqlLog: []
  };
}

function parseAlcances(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function installBotFixture(initial = {}) {
  const state = createBotState();
  Object.assign(state, initial);
  const originals = {
    get: db.get,
    all: db.all,
    run: db.run,
    transaction: db.transaction
  };

  db.get = async (sql, params = []) => {
    const text = String(sql);
    state.sqlLog.push(text);
    if (text.includes('session_version') && text.includes('FROM asesores')) {
      return state.sessionUser;
    }
    if (text.includes('bot:asesor-vinculo')) {
      const id = Number(params[0]);
      if (state.sessionUser && Number(state.sessionUser.id) === id) return state.sessionUser;
      return (state.people || []).find(person => Number(person.id) === id) || null;
    }
    if (text.includes('bot:clave-prefijo')) {
      return state.keys.find(key => key.prefijo === params[0]) || null;
    }
    if (text.includes('bot:clave-id')) {
      return state.keys.find(key => Number(key.id) === Number(params[0])) || null;
    }
    if (text.includes('bot:producto')) {
      return state.products.find(product => Number(product.id) === Number(params[0])) || null;
    }
    return null;
  };

  db.all = async (sql, params = []) => {
    const text = String(sql);
    state.sqlLog.push(text);
    if (text.includes('bot:claves-lista')) {
      const hasCursor = text.includes('WHERE id < ?');
      const cursor = hasCursor ? Number(params[0]) : null;
      const limit = Number(params[params.length - 1]);
      return state.keys
        .filter(key => cursor == null || Number(key.id) < cursor)
        .sort((left, right) => Number(right.id) - Number(left.id))
        .slice(0, limit)
        .map(key => ({
          id: key.id,
          nombre: key.nombre,
          prefijo: key.prefijo,
          alcances: key.alcances,
          asesor_id: key.asesor_id,
          rol_visibilidad: key.rol_visibilidad,
          limite_por_minuto: key.limite_por_minuto,
          creada_en: key.creada_en,
          revocada_en: key.revocada_en
        }));
    }
    if (text.includes('bot:productos')) return filterProducts(state, params);
    if (text.includes('bot:lotes')) {
      return state.lots.filter(lot => Number(lot.producto_id) === Number(params[0]));
    }
    if (text.includes('bot:tamanos-fisico')) {
      return state.sizesPhysical.filter(row => Number(row.producto_id) === Number(params[0]));
    }
    if (text.includes('bot:tamanos-reserva')) {
      return state.sizesReserved.filter(row => Number(row.producto_id) === Number(params[0]));
    }
    if (text.includes('bot:movimientos')) return filterMovements(state, params, text);
    return [];
  };

  db.run = async (sql, params = []) => {
    const text = String(sql);
    state.sqlLog.push(text);
    if (text.includes('bot:auditoria-purga')) return { id: null, changes: 0 };
    if (text.includes('bot:auditoria-alta')) {
      const row = {
        clave_id: params[0],
        metodo: params[1],
        ruta_plantilla: params[2],
        codigo_http: params[3],
        codigo_error: params[4],
        duracion_ms: params[5],
        request_id: params[6]
      };
      state.calls.push(row);
      return { id: state.calls.length, changes: 1 };
    }
    if (text.includes('bot:clave-alta')) {
      const row = {
        id: state.nextKeyId,
        nombre: params[0],
        prefijo: params[1],
        hash: params[2],
        alcances: params[3],
        asesor_id: params[4],
        rol_visibilidad: params[5],
        limite_por_minuto: params[6],
        creada_por: params[7],
        creada_en: new Date().toISOString(),
        revocada_en: null
      };
      state.nextKeyId += 1;
      state.keys.push(row);
      return { id: row.id, changes: 1 };
    }
    if (text.includes('bot:clave-revocar')) {
      const key = state.keys.find(item => Number(item.id) === Number(params[0]));
      if (!key) return { id: null, changes: 0 };
      if (!key.revocada_en) key.revocada_en = new Date().toISOString();
      return { id: key.id, changes: 1 };
    }
    return { id: null, changes: 0 };
  };

  db.transaction = async callback => callback({
    get: db.get,
    all: db.all,
    run: db.run
  });

  return {
    state,
    parseAlcances,
    restore() {
      db.get = originals.get;
      db.all = originals.all;
      db.run = originals.run;
      db.transaction = originals.transaction;
    }
  };
}

function filterProducts(state, params) {
  // Misma posición que utils/botInventory.js: id, id, texto, texto, texto, categoría, categoría, límite.
  const afterId = params[0] == null ? 0 : Number(params[0]);
  const needle = String(params[2] || '');
  const categoria = String(params[5] || '');
  const limit = Number(params[7]);
  return state.products
    .filter(product => Number(product.id) > afterId)
    .filter(product => !needle || product._foldedNombre.includes(needle) || product._foldedClave.includes(needle))
    .filter(product => !categoria || product._foldedCategoria === categoria)
    .sort((left, right) => Number(left.id) - Number(right.id))
    .slice(0, limit);
}

function filterMovements(state, params, text) {
  let productId = null;
  let beforeId = null;
  const values = [...params];
  if (text.includes('m.producto_id = ?')) productId = Number(values.shift());
  if (text.includes('m.id < ?')) beforeId = Number(values.shift());
  const limit = Number(values[0]);
  return state.movements
    .filter(row => productId == null || Number(row.producto_id) === productId)
    .filter(row => beforeId == null || Number(row.id) < beforeId)
    .sort((left, right) => Number(right.id) - Number(left.id))
    .slice(0, limit);
}

module.exports = {
  installBotFixture,
  createBotState
};
