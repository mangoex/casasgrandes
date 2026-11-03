'use strict';

const { After } = require('@cucumber/cucumber');
const db = require('../../db');

const originals = {
  get: db.get,
  all: db.all,
  transaction: db.transaction,
  checkReadiness: db.checkReadiness
};

After(function restoreDatabaseDoubles() {
  db.get = originals.get;
  db.all = originals.all;
  db.transaction = originals.transaction;
  db.checkReadiness = originals.checkReadiness;
});
