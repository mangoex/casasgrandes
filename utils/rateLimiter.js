'use strict';

const crypto = require('node:crypto');

function createFixedWindowStore({
  windowMs,
  maxAttempts,
  maxEntries = 10_000,
  now = Date.now
}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) throw new TypeError('windowMs must be a positive integer');
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new TypeError('maxAttempts must be a positive integer');
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) throw new TypeError('maxEntries must be a positive integer');

  const entries = new Map();

  function pruneExpired(timestamp) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= timestamp) entries.delete(key);
    }
  }

  function hasCapacity(timestamp) {
    pruneExpired(timestamp);
    return entries.size < maxEntries;
  }

  return {
    consume(key) {
      const timestamp = now();
      let entry = entries.get(key);
      if (entry && entry.expiresAt <= timestamp) {
        entries.delete(key);
        entry = null;
      }
      if (!entry) {
        if (!hasCapacity(timestamp)) {
          const earliestExpiry = Math.min(...[...entries.values()].map(value => value.expiresAt));
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.max(Math.ceil((earliestExpiry - timestamp) / 1000), 1)
          };
        }
        entry = { count: 0, expiresAt: timestamp + windowMs };
        entries.set(key, entry);
      }

      entry.count += 1;
      return {
        allowed: entry.count <= maxAttempts,
        remaining: Math.max(maxAttempts - entry.count, 0),
        retryAfterSeconds: Math.max(Math.ceil((entry.expiresAt - timestamp) / 1000), 1)
      };
    },

    refund(key) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) entries.delete(key);
    },

    get size() {
      return entries.size;
    }
  };
}

function hashRateLimitKey(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex');
}

function createRateLimitMiddleware({ store, keyGenerator, message }) {
  return function rateLimit(req, res, next) {
    const key = keyGenerator(req);
    const result = store.consume(key);
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(result.retryAfterSeconds));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({ error: message });
    }

    res.once('finish', () => {
      if (res.statusCode < 400) store.refund(key);
    });
    return next();
  };
}

module.exports = {
  createFixedWindowStore,
  createRateLimitMiddleware,
  hashRateLimitKey
};
