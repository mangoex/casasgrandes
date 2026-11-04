'use strict';

const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { After, Before, Given, When, Then } = require('@cucumber/cucumber');
const { installBotFixture } = require('../../test/support/botFixture');
const { generateKey, hashKey } = require('../../utils/botKeys');
const { resetBotRateLimit } = require('../../utils/botRateLimit');
const { foldText } = require('../../utils/botHttp');
const { TEST_JWT_SECRET } = require('../support/preload');
const { testBotPepper } = require('../../test/support/botPepper');

const PEPPER = testBotPepper();
const ADMIN = {
  id: 4,
  nombre: 'Admin Ficticio',
  usuario: 'admin.ficticio',
  nivel_rol: 'Administrador',
  email: 'admin.ficticio@example.test',
  telefono: null,
  activo: 1,
  session_version: 1
};

Before({ tags: '@no-implementado' }, function skipUnimplemented() {
  return 'skipped';
});

Before({ tags: '@chg027' }, function prepareBot() {
  process.env.BOT_API_KEY_PEPPER = PEPPER;
  resetBotRateLimit();
  this.bot = installBotFixture({ sessionUser: ADMIN });
  this.presentedKey = '';
});

After({ tags: '@chg027' }, function restoreBot() {
  if (this.bot) this.bot.restore();
  resetBotRateLimit();
});

function seedKey(world, { alcance, rol, limite = 60, revoked = false }) {
  const generated = generateKey();
  const state = world.bot.state;
  state.keys.push({
    id: state.nextKeyId,
    nombre: 'Bot ficticio',
    prefijo: generated.prefix,
    hash: hashKey(PEPPER, generated.clave),
    alcances: JSON.stringify([alcance]),
    asesor_id: null,
    rol_visibilidad: rol,
    limite_por_minuto: limite,
    creada_en: new Date().toISOString(),
    revocada_en: revoked ? '2026-11-03T15:00:00.000Z' : null
  });
  state.nextKeyId += 1;
  world.apiKey = generated.clave;
}

Given('un bot CHG-027 con clave vigente, alcance {string} y rol {string}', function (alcance, rol) {
  seedKey(this, { alcance, rol });
});

Given(
  'un bot CHG-027 con clave vigente, alcance {string}, rol {string} y límite {int} por minuto',
  function (alcance, rol, limite) {
    seedKey(this, { alcance, rol, limite });
  }
);

Given('un bot CHG-027 con clave revocada y alcance {string}', function (alcance) {
  seedKey(this, { alcance, rol: 'Almacen', revoked: true });
});

function ensureDemoProduct(world, fisico = 140, reservado = 40) {
  const state = world.bot.state;
  const row = {
    id: 7,
    nombre: 'Híbrido Demostración',
    clave: 'HIB-DEMO',
    categoria: 'Híbrido',
    existencia_fisica: fisico,
    reservado,
    _foldedNombre: foldText('Híbrido Demostración'),
    _foldedClave: foldText('HIB-DEMO'),
    _foldedCategoria: foldText('Híbrido')
  };
  const existing = state.products.find(product => product.id === 7);
  if (existing) Object.assign(existing, row);
  else state.products.push(row);
  world.demoProductId = 7;
}

Given('un híbrido de demostración con existencia física {int} y reserva activa {int}', function (fisico, reservado) {
  ensureDemoProduct(this, fisico, reservado);
});

Given('un híbrido de demostración con lote {string} y tamaño {string}', function (lote, tamano) {
  ensureDemoProduct(this);
  this.bot.state.lots.push({ producto_id: 7, lote, tamano, existencia_fisica: 90 });
  this.bot.state.sizesPhysical.push({ producto_id: 7, tamano, existencia_fisica: 90 });
  this.bot.state.sizesReserved.push({ producto_id: 7, tamano, reservado: 30 });
  this.demoProductId = 7;
});

Given('un movimiento de demostración ligado a un cliente ficticio', function () {
  this.bot.state.movements.push({
    id: 501,
    fecha_movimiento: '2026-11-03T15:00:00.000Z',
    tipo_movimiento: 'Entrada de demostración',
    producto_id: 7,
    producto_nombre: 'Híbrido Demostración',
    cantidad_entrante: 90,
    cantidad_saliente: 0,
    existencias_resultantes: 140,
    ciclo_agricola: 'OI-DEMO',
    lote: 'LOTE-DEMO-1',
    tamano: 'BT1'
  });
});

Given('un movimiento manual de demostración de tipo {string} con lote {string}', function (tipo, lote) {
  this.bot.state.movements.push({
    id: 502,
    fecha_movimiento: '2026-11-03T16:00:00.000Z',
    tipo_movimiento: tipo,
    producto_id: 7,
    producto_nombre: 'Híbrido Demostración',
    cantidad_entrante: 90,
    cantidad_saliente: 0,
    existencias_resultantes: 140,
    ciclo_agricola: 'OI-DEMO',
    lote,
    tamano: 'BT1'
  });
});

Given('un administrador ficticio autenticado en la sesión web', function () {
  this.token = jwt.sign(
    { id: ADMIN.id, nivel_rol: ADMIN.nivel_rol, session_version: ADMIN.session_version },
    TEST_JWT_SECRET
  );
});

When('el bot CHG-027 consulta la salud sin clave', async function () {
  this.response = await this.http().get('/api/v1/bot/health');
});

When('el bot CHG-027 consulta el inventario de productos', async function () {
  this.response = await this.http().get('/api/v1/bot/inventario/productos').set('X-Api-Key', this.apiKey);
});

When('el bot CHG-027 consulta el inventario de productos tres veces', async function () {
  for (let index = 0; index < 3; index += 1) {
    this.response = await this.http().get('/api/v1/bot/inventario/productos').set('X-Api-Key', this.apiKey);
  }
});

When('el bot CHG-027 consulta el detalle del híbrido de demostración', async function () {
  this.response = await this.http()
    .get(`/api/v1/bot/inventario/productos/${this.demoProductId || 7}`)
    .set('X-Api-Key', this.apiKey);
});

When('el bot CHG-027 consulta los movimientos recientes', async function () {
  this.response = await this.http().get('/api/v1/bot/inventario/movimientos').set('X-Api-Key', this.apiKey);
});

When('el bot CHG-027 consulta el inventario sin clave', async function () {
  this.presentedKey = '';
  this.response = await this.http().get('/api/v1/bot/inventario/productos');
});

When('el bot CHG-027 busca el inventario con {string}', async function (texto) {
  this.response = await this.http()
    .get('/api/v1/bot/inventario/productos')
    .query({ q: texto })
    .set('X-Api-Key', this.apiKey);
});

When('crea una clave CHG-027 de alcance {string} ligada al rol {string}', async function (alcance, rol) {
  this.response = await this.http()
    .post('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${this.token}`)
    .send({
      nombre: 'Bot inventario demostración',
      alcances: [alcance],
      limite_por_minuto: 60,
      asesor_id: null,
      rol_visibilidad: rol
    });
  this.created = this.response.body;
  this.apiKey = this.response.body.clave;
});

When('consulta el listado de claves CHG-027', async function () {
  this.listed = await this.http()
    .get('/api/admin/bot/claves')
    .set('Authorization', `Bearer ${this.token}`);
});

When('revoca esa clave CHG-027', async function () {
  this.response = await this.http()
    .post(`/api/admin/bot/claves/${this.created.id}/revocacion`)
    .set('Authorization', `Bearer ${this.token}`);
});

Then('el bot CHG-027 recibe estado {int}', function (estado) {
  assert.equal(this.response.status, estado, JSON.stringify(this.response.body));
});

Then('el cuerpo del bot CHG-027 solo indica salud', function () {
  assert.deepEqual(this.response.body, { status: 'ok' });
  assert.equal(this.bot.state.calls.length, 0);
});

Then('el disponible del híbrido de demostración es {int}', function (disponible) {
  const rows = this.response.body.datos || [];
  const demo = rows.find(row => row.nombre === 'Híbrido Demostración');
  assert.ok(demo, JSON.stringify(this.response.body));
  assert.equal(demo.disponible, disponible);
});

Then('el detalle incluye el lote {string} y el tamaño {string}', function (lote, tamano) {
  const lots = this.response.body.lotes || [];
  assert.equal(lots.some(lot => lot.lote === lote && lot.tamano === tamano), true, JSON.stringify(this.response.body));
});

Then('el cuerpo del bot CHG-027 no contiene nombre de cliente, correo, teléfono ni precio', function () {
  const dumped = JSON.stringify(this.response.body);
  for (const fragment of ['cliente', 'correo', '@', 'telefono', 'teléfono', 'precio', 'factura', 'folio']) {
    assert.equal(dumped.toLowerCase().includes(fragment), false, fragment);
  }
});

Then('el cuerpo del bot CHG-027 no contiene lote ni tamaño', function () {
  const dumped = JSON.stringify(this.response.body).toLowerCase();
  assert.equal(dumped.includes('lote'), false);
  assert.equal(dumped.includes('tamano'), false);
  assert.equal(dumped.includes('tamaño'), false);
});

Then('el cuerpo del bot CHG-027 no contiene existencia física ni reservado', function () {
  const dumped = JSON.stringify(this.response.body);
  assert.equal(dumped.includes('existencia_fisica'), false);
  assert.equal(dumped.includes('reservado'), false);
});

Then('el cuerpo del bot CHG-027 no contiene el libro de tamaños', function () {
  assert.equal(Object.hasOwn(this.response.body, 'tamanos'), false);
  assert.equal(JSON.stringify(this.response.body).includes('tamanos'), false);
});

Then('el movimiento de demostración tiene tipo {string} y lote {string}', function (tipo, lote) {
  const rows = this.response.body.datos || [];
  assert.equal(rows.some(row => row.tipo === tipo && row.lote === lote), true, JSON.stringify(rows));
});

Then('el cuerpo del bot CHG-027 no contiene el campo tamano', function () {
  const dumped = JSON.stringify(this.response.body);
  assert.equal(dumped.includes('tamano'), false);
});

Then('la auditoría CHG-027 no guarda la clave presentada', function () {
  const dumped = JSON.stringify(this.bot.state.calls);
  assert.equal(dumped.includes('X-Api-Key'), false);
  if (this.presentedKey) assert.equal(dumped.includes(this.presentedKey), false);
  assert.equal(this.bot.state.calls.every(row => row.clave_id == null), true);
});

Then('el código de error del bot CHG-027 es {string}', function (codigo) {
  assert.equal(this.response.body.error.codigo, codigo);
});

Then('existe una fila de auditoría CHG-027 sin cuerpo, sin clave y sin datos de cliente', function () {
  const row = this.bot.state.calls.at(-1);
  assert.ok(row);
  assert.equal(row.ruta_plantilla, '/api/v1/bot/inventario/productos');
  const dumped = JSON.stringify(row);
  assert.equal(dumped.includes(this.apiKey), false);
  assert.equal(dumped.includes('cliente'), false);
  assert.equal(Object.hasOwn(row, 'cuerpo'), false);
});

Then('la respuesta de alta incluye la clave en claro una sola vez', function () {
  assert.equal(this.response.status, 201, JSON.stringify(this.response.body));
  assert.equal(typeof this.created.clave, 'string');
  assert.equal(this.created.clave.length >= 8, true);
  assert.equal(JSON.stringify(this.bot.state.keys).includes(this.created.clave), false);
});

Then('el listado no incluye la clave en claro', function () {
  assert.equal(this.listed.status, 200, JSON.stringify(this.listed.body));
  assert.equal(JSON.stringify(this.listed.body).includes(this.created.clave), false);
});

Then('la clave revocada recibe estado {int} al consultar el inventario', async function (estado) {
  const response = await this.http()
    .get('/api/v1/bot/inventario/productos')
    .set('X-Api-Key', this.apiKey);
  assert.equal(response.status, estado, JSON.stringify(response.body));
  assert.equal(response.body.error.codigo, 'NO_AUTENTICADO');
});
