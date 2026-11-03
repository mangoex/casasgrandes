'use strict';

const { Given, When } = require('@cucumber/cucumber');
const db = require('../../db');

Given('que el servidor HTTP acepta solicitudes', function () {
  this.app();
});

Given('que PostgreSQL de readiness falla con un detalle interno', function () {
  db.checkReadiness = async () => {
    throw new Error('postgres://secret@internal/database');
  };
});

When('se consulta {string}', async function (path) {
  this.response = await this.http().get(path);
});
