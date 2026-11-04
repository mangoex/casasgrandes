'use strict';

const crypto = require('node:crypto');

const DUMMY_HASH = crypto.createHash('sha256').update('clave-ausente').digest('hex');

function pepper() {
  return String(process.env.BOT_API_KEY_PEPPER || '').trim();
}

function hashKey(secret, clave) {
  return crypto.createHash('sha256').update(String(secret)).update(String(clave)).digest('hex');
}

function hashesEqual(leftHex, rightHex) {
  if (!/^[0-9a-f]{64}$/i.test(String(leftHex || '')) || !/^[0-9a-f]{64}$/i.test(String(rightHex || ''))) {
    return false;
  }
  const left = Buffer.from(String(leftHex), 'hex');
  const right = Buffer.from(String(rightHex), 'hex');
  return crypto.timingSafeEqual(left, right);
}

function generateKey() {
  const prefix = `cgbot_${crypto.randomBytes(4).toString('hex')}`;
  const clave = `${prefix}.${crypto.randomBytes(32).toString('base64url')}`;
  return { prefix, clave };
}

function extractPrefix(clave) {
  const match = /^(cgbot_[0-9a-f]{8})\./.exec(String(clave || ''));
  return match ? match[1] : null;
}

function hashPresented(clave) {
  return hashKey(pepper() || 'sin-pimienta', clave);
}

module.exports = {
  DUMMY_HASH,
  pepper,
  hashKey,
  hashesEqual,
  generateKey,
  extractPrefix,
  hashPresented
};
