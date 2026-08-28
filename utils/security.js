const SESSION_COOKIE_NAME = 'auth_token';
const DEFAULT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function buildSessionCookieOptions({
  production = process.env.NODE_ENV === 'production',
  maxAgeMs = DEFAULT_SESSION_MAX_AGE_MS
} = {}) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: Boolean(production),
    path: '/',
    maxAge: maxAgeMs
  };
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return cookies;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
      return cookies;
    }, {});
}

function validateInitialPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    return { ok: false, error: 'La contraseña debe tener al menos 12 caracteres.' };
  }

  const normalized = password.trim().toLowerCase();
  const knownWeakPasswords = new Set([
    'password',
    'password123',
    'contraseña',
    'contrasena',
    'administrador',
    'admin123456'
  ]);
  if (knownWeakPasswords.has(normalized)) {
    return { ok: false, error: 'La contraseña indicada es demasiado común.' };
  }

  return { ok: true };
}

module.exports = {
  DEFAULT_SESSION_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  parseCookies,
  validateInitialPassword
};
