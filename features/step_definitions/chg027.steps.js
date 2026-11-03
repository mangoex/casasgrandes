'use strict';

// CHG-027 está especificado y no implementado.
// Cada paso devuelve skipped para que Cucumber cargue el Gherkin sin
// ejecutar la aplicación y sin fallar la suite. Quitar estos retornos
// forma parte de TDD-TC-130, cuando exista el comportamiento.
// La cantidad de argumentos tiene que coincidir con los grupos del paso:
// Cucumber rechaza una función cuya aridad no corresponde.

const { Given, When, Then } = require('@cucumber/cucumber');

function omitido() {
  return 'skipped';
}

Given('un bot CHG-027 con clave vigente, alcance {string} y rol {string}', function (alcance, rol) {
  void alcance;
  void rol;
  return omitido();
});

Given(
  'un bot CHG-027 con clave vigente, alcance {string}, rol {string} y límite {int} por minuto',
  function (alcance, rol, limite) {
    void alcance;
    void rol;
    void limite;
    return omitido();
  }
);

Given('un bot CHG-027 con clave revocada y alcance {string}', function (alcance) {
  void alcance;
  return omitido();
});

Given('un híbrido de demostración con existencia física {int} y reserva activa {int}', function (fisico, reservado) {
  void fisico;
  void reservado;
  return omitido();
});

Given('un híbrido de demostración con lote {string} y tamaño {string}', function (lote, tamano) {
  void lote;
  void tamano;
  return omitido();
});

Given('un movimiento de demostración ligado a un cliente ficticio', function () {
  return omitido();
});

Given('un administrador ficticio autenticado en la sesión web', function () {
  return omitido();
});

When('el bot CHG-027 consulta la salud sin clave', function () {
  return omitido();
});

When('el bot CHG-027 consulta el inventario de productos', function () {
  return omitido();
});

When('el bot CHG-027 consulta el inventario de productos tres veces', function () {
  return omitido();
});

When('el bot CHG-027 consulta el detalle del híbrido de demostración', function () {
  return omitido();
});

When('el bot CHG-027 consulta los movimientos recientes', function () {
  return omitido();
});

When('el bot CHG-027 consulta el inventario sin clave', function () {
  return omitido();
});

When('crea una clave CHG-027 de alcance {string} ligada al rol {string}', function (alcance, rol) {
  void alcance;
  void rol;
  return omitido();
});

When('consulta el listado de claves CHG-027', function () {
  return omitido();
});

When('revoca esa clave CHG-027', function () {
  return omitido();
});

Then('el bot CHG-027 recibe estado {int}', function (estado) {
  void estado;
  return omitido();
});

Then('el cuerpo del bot CHG-027 solo indica salud', function () {
  return omitido();
});

Then('el disponible del híbrido de demostración es {int}', function (disponible) {
  void disponible;
  return omitido();
});

Then('el detalle incluye el lote {string} y el tamaño {string}', function (lote, tamano) {
  void lote;
  void tamano;
  return omitido();
});

Then('el cuerpo del bot CHG-027 no contiene nombre de cliente, correo, teléfono ni precio', function () {
  return omitido();
});

Then('el cuerpo del bot CHG-027 no contiene lote ni tamaño', function () {
  return omitido();
});

Then('el cuerpo del bot CHG-027 no contiene existencia física ni reservado', function () {
  return omitido();
});

Then('la auditoría CHG-027 no guarda la clave presentada', function () {
  return omitido();
});

Then('el código de error del bot CHG-027 es {string}', function (codigo) {
  void codigo;
  return omitido();
});

Then('existe una fila de auditoría CHG-027 sin cuerpo, sin clave y sin datos de cliente', function () {
  return omitido();
});

Then('la respuesta de alta incluye la clave en claro una sola vez', function () {
  return omitido();
});

Then('el listado no incluye la clave en claro', function () {
  return omitido();
});

Then('la clave revocada recibe estado {int} al consultar el inventario', function (estado) {
  void estado;
  return omitido();
});
