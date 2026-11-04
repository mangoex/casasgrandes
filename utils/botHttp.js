'use strict';

const FOLD_FROM = 'ÁÀÄÂáàäâÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔóòöôÚÙÜÛúùüûÑñÝýŸÿ';
const FOLD_TO = 'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnYyYy';

const SERVICE_ROLES = Object.freeze([
  'Administrador',
  'Coordinador',
  'Director',
  'Asesor',
  'Almacen',
  'Acopio'
]);

function errorBody(codigo, mensaje) {
  return { error: { codigo, mensaje } };
}

function foldText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sqlFold(column) {
  return `lower(translate(${column}, '${FOLD_FROM}', '${FOLD_TO}'))`;
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, char => `\\${char}`);
}

function round3(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 1000) / 1000;
}

function toIso(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

function encodeCursor(id) {
  return Buffer.from(`v1:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(value) {
  if (value === undefined) return { ok: true, id: null };
  if (Array.isArray(value)) return { ok: false };
  try {
    const text = Buffer.from(String(value), 'base64url').toString('utf8');
    const match = /^v1:(\d+)$/.exec(text);
    if (!match) return { ok: false };
    const id = Number(match[1]);
    if (!Number.isInteger(id) || id < 1) return { ok: false };
    return { ok: true, id };
  } catch {
    return { ok: false };
  }
}

function unknownQuery(query, allowed) {
  return Object.keys(query).some(key => !allowed.has(key) || Array.isArray(query[key]));
}

function readLimit(query) {
  if (query.limite === undefined) return { ok: true, value: 50 };
  if (Array.isArray(query.limite) || !/^[1-9]\d*$/.test(String(query.limite))) return { ok: false };
  const value = Number(query.limite);
  if (value < 1 || value > 100) return { ok: false };
  return { ok: true, value };
}

function clip(value, max) {
  const text = value == null ? '' : String(value);
  return text.length > max ? text.slice(0, max) : text;
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

function listView(role) {
  if (role === 'Asesor') return 'asesor';
  if (['Administrador', 'Coordinador', 'Director', 'Almacen', 'Acopio'].includes(role)) return 'operativo';
  return null;
}

function detailView(role) {
  if (role === 'Asesor') return 'asesor';
  if (role === 'Almacen') return 'almacen';
  if (role === 'Administrador') return 'administrador';
  if (['Coordinador', 'Director', 'Acopio'].includes(role)) return 'operativo';
  return null;
}

function movementView(role) {
  if (role === 'Almacen') return 'almacen';
  if (['Administrador', 'Coordinador', 'Director', 'Acopio'].includes(role)) return 'operativo';
  return null;
}

module.exports = {
  FOLD_FROM,
  FOLD_TO,
  SERVICE_ROLES,
  errorBody,
  foldText,
  sqlFold,
  escapeLike,
  round3,
  toIso,
  encodeCursor,
  decodeCursor,
  unknownQuery,
  readLimit,
  clip,
  parseAlcances,
  listView,
  detailView,
  movementView
};
