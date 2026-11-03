'use strict';

module.exports = {
  default: {
    require: [
      'features/support/preload.js',
      'features/support/world.js',
      'features/support/hooks.js',
      'features/step_definitions/**/*.js'
    ],
    paths: ['features/**/*.feature'],
    format: ['progress']
  }
};
