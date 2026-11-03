'use strict';

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test-only-chg026-bdd-secret-at-least-32-chars';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.SKIP_INIT_SCHEMA = 'true';
process.env.PGSSL = 'false';

module.exports = {
  TEST_JWT_SECRET
};
