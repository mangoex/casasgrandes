function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

function createGracefulShutdown({
  server,
  stopScheduler,
  closeDatabase,
  timeoutMs = 10_000,
  logger = console,
  forceExit
}) {
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('server.close must be available');
  }
  if (typeof stopScheduler !== 'function' || typeof closeDatabase !== 'function') {
    throw new TypeError('shutdown collaborators must be functions');
  }

  let shutdownPromise;
  return function shutdown(signal = 'manual') {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error(`Graceful shutdown timed out after ${timeoutMs}ms`);
        logger.error(JSON.stringify({
          event: 'shutdown_timed_out',
          signal,
          timeout_ms: timeoutMs
        }));
        reject(error);
        forceExit?.(1);
      }, timeoutMs);
      logger.info(JSON.stringify({ event: 'shutdown_started', signal }));
      (async () => {
        const drainResults = await Promise.allSettled([
          closeHttpServer(server),
          Promise.resolve().then(stopScheduler)
        ]);
        const databaseResult = await Promise.resolve()
          .then(closeDatabase)
          .then(
            () => ({ status: 'fulfilled' }),
            reason => ({ status: 'rejected', reason })
          );
        const failure = [...drainResults, databaseResult]
          .find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
      })()
        .then(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          logger.info(JSON.stringify({ event: 'shutdown_completed', signal }));
          resolve();
        })
        .catch(error => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          logger.error(JSON.stringify({
            event: 'shutdown_failed',
            signal
          }));
          reject(error);
        });
    });

    return shutdownPromise;
  };
}

module.exports = {
  createGracefulShutdown
};
