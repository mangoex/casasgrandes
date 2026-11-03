'use strict';

const { setWorldConstructor, World } = require('@cucumber/cucumber');
const request = require('supertest');

class AppWorld extends World {
  app() {
    if (!this._app) {
      this._app = require('../../server').app;
    }
    return this._app;
  }

  http() {
    return request(this.app());
  }
}

setWorldConstructor(AppWorld);
