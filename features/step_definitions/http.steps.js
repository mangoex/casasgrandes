'use strict';

const assert = require('node:assert/strict');
const { Then } = require('@cucumber/cucumber');

Then('la respuesta es {int}', function (status) {
  assert.equal(this.response.status, status, JSON.stringify(this.response.body));
});

Then('el cuerpo JSON es:', function (docString) {
  assert.deepEqual(this.response.body, JSON.parse(docString));
});

Then('la respuesta no contiene {string}', function (fragment) {
  assert.equal(JSON.stringify(this.response.body).includes(fragment), false);
});
