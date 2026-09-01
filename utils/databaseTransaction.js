function createTransactionApi(client, rewriteQuery) {
  return {
    async get(sql, params = []) {
      const result = await client.query(rewriteQuery(sql), params);
      return result.rows[0];
    },
    async all(sql, params = []) {
      const result = await client.query(rewriteQuery(sql), params);
      return result.rows;
    },
    async run(sql, params = []) {
      const result = await client.query(rewriteQuery(sql), params);
      return {
        id: result.rows[0]?.id || null,
        changes: result.rowCount
      };
    }
  };
}

function createTransactionRunner(pool, rewriteQuery) {
  return async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(createTransactionApi(client, rewriteQuery));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    } finally {
      client.release();
    }
  };
}

module.exports = {
  createTransactionApi,
  createTransactionRunner
};
