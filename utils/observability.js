const crypto = require('node:crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeRequestId(value, randomUUID = crypto.randomUUID) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function requestContextMiddleware({
  randomUUID = crypto.randomUUID,
  now = Date.now,
  logger = console
} = {}) {
  return (req, res, next) => {
    const startedAt = now();
    const requestId = normalizeRequestId(req.get('x-request-id'), randomUUID);
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    res.once('finish', () => {
      const event = {
        event: 'http_request_completed',
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Math.max(0, now() - startedAt)
      };
      logger.info(JSON.stringify(event));
    });
    next();
  };
}

function createReadinessCheck({ query, timeoutMs = 2_000 }) {
  if (typeof query !== 'function') throw new TypeError('query must be a function');

  return () => new Promise((resolve, reject) => {
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(
      () => finish(reject)(new Error('Readiness check timed out')),
      timeoutMs
    );
    Promise.resolve()
      .then(query)
      .then(finish(() => resolve(true)), finish(reject));
  });
}

function createHealthHandlers({ checkReadiness }) {
  if (typeof checkReadiness !== 'function') {
    throw new TypeError('checkReadiness must be a function');
  }

  return {
    live(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ status: 'alive' });
    },
    async ready(req, res) {
      res.setHeader('Cache-Control', 'no-store');
      try {
        await checkReadiness();
        return res.status(200).json({ status: 'ready' });
      } catch {
        return res.status(503).json({ status: 'degraded' });
      }
    }
  };
}

module.exports = {
  createHealthHandlers,
  createReadinessCheck,
  normalizeRequestId,
  requestContextMiddleware
};
