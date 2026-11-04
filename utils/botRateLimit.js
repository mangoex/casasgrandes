'use strict';

const WINDOW_MS = 60_000;
const UNKNOWN_PER_MINUTE = 30;

function createRateLimiter({ now = () => Date.now() } = {}) {
  const buckets = new Map();

  function consume(bucketId, limit) {
    const time = now();
    const windowStart = Math.floor(time / WINDOW_MS) * WINDOW_MS;
    for (const key of buckets.keys()) {
      const stamp = Number(key.slice(0, key.indexOf('\n')));
      if (stamp < windowStart) buckets.delete(key);
    }
    const storageKey = `${windowStart}\n${bucketId}`;
    const used = buckets.get(storageKey) || 0;
    const retryAfter = Math.max(1, Math.ceil((windowStart + WINDOW_MS - time) / 1000));
    if (used >= limit) {
      return { allowed: false, remaining: 0, retryAfter };
    }
    buckets.set(storageKey, used + 1);
    return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfter };
  }

  return {
    consume,
    reset() {
      buckets.clear();
    }
  };
}

let nowFn = () => Date.now();
const limiter = createRateLimiter({ now: () => nowFn() });

module.exports = {
  UNKNOWN_PER_MINUTE,
  createRateLimiter,
  consumeBotLimit: (bucketId, limit) => limiter.consume(bucketId, limit),
  resetBotRateLimit() {
    limiter.reset();
  },
  setBotClock(fn) {
    nowFn = typeof fn === 'function' ? fn : () => Date.now();
    limiter.reset();
  }
};
