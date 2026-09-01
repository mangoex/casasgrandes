const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('TDD-TC-018: el arranque no borra planeación por ausencia de cotizaciones', () => {
  const source = read('db.js');
  assert.doesNotMatch(
    source,
    /quoteCountRes[\s\S]{0,300}DELETE FROM planificacion_semanal/,
    'initSchema no puede inferir que la planeación es descartable'
  );
});

test('TDD-TC-019: la cookie de sesión aplica controles de navegador', () => {
  const { buildSessionCookieOptions } = require('../utils/security');
  const development = buildSessionCookieOptions({ production: false, maxAgeMs: 60_000 });
  const production = buildSessionCookieOptions({ production: true, maxAgeMs: 60_000 });

  assert.equal(development.httpOnly, true);
  assert.equal(development.sameSite, 'strict');
  assert.equal(development.path, '/');
  assert.equal(development.maxAge, 60_000);
  assert.equal(development.secure, false);
  assert.equal(production.secure, true);
});

test('TDD-TC-020: el frontend no persiste JWT ni usuario en almacenamiento web', () => {
  const source = read('public/js/app.js');
  assert.doesNotMatch(source, /localStorage\.(getItem|setItem)\(['"](?:token|user)['"]/);
  assert.doesNotMatch(source, /sessionStorage\.(getItem|setItem)\(['"](?:token|user)['"]/);
  assert.doesNotMatch(source, /Authorization['"]?\s*:\s*`Bearer/);
});

test('TDD-TC-021: el renderizador codifica HTML y atributos ejecutables', () => {
  const { escapeHtml, renderSafeMarkdown } = require('../public/js/security');
  const hostile = '<img src=x onerror="globalThis.compromised=true">';

  assert.equal(
    escapeHtml(hostile),
    '&lt;img src=x onerror=&quot;globalThis.compromised=true&quot;&gt;'
  );
  const rendered = renderSafeMarkdown(`# Informe\n\n${hostile}\n\n**fin**`);
  assert.match(rendered, /<h3/);
  assert.match(rendered, /<strong>fin<\/strong>/);
  assert.doesNotMatch(rendered, /<img/);
  assert.doesNotMatch(rendered, /onerror="/);
});

test('TDD-TC-022: las contraseñas de alta deben ser explícitas y robustas', () => {
  const { validateInitialPassword } = require('../utils/security');

  assert.equal(validateInitialPassword(undefined).ok, false);
  assert.equal(validateInitialPassword('password123').ok, false);
  assert.equal(validateInitialPassword('corta').ok, false);
  assert.equal(validateInitialPassword('Unica-y-segura-2026').ok, true);
});

test('TDD-TC-023: rutas productivas y formularios no contienen credenciales conocidas', () => {
  const files = [
    'db.js',
    'server.js',
    'migrate.py',
    'migrate_pg.js',
    'public/index.html',
    'public/js/app.js'
  ];
  const source = files.map(file => `${file}\n${read(file)}`).join('\n');

  assert.doesNotMatch(source, /password123/i);
  assert.doesNotMatch(source, /\$2b\$10\$Ly0wcxrAZmfzIOSLPRzwdO3YxJQ2dPT6osFpn0j0hlAT9uK7ojTKm/);
  assert.doesNotMatch(source, /\$2b\$10\$fgcwgOeS3gyws4l95smgDOBhuagB\/mIxKZmg5UgJLAfE5BFXBN0Vq/);
});
