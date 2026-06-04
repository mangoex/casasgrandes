const db = require('../db');

async function check() {
  try {
    console.log("Checking database tables...");
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("Tables in database:", tables.map(t => t.name).join(", "));
    
    for (const tableName of ['metas_ventas', 'planificacion_semanal']) {
      const exists = tables.some(t => t.name === tableName);
      if (exists) {
        console.log(`\nSchema for ${tableName}:`);
        const schema = await db.all(`PRAGMA table_info(${tableName})`);
        console.table(schema);
        const rows = await db.all(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`Number of records in ${tableName}:`, rows[0].count);
      } else {
        console.log(`\nTable ${tableName} does NOT exist!`);
      }
    }
  } catch (err) {
    console.error("Error checking database:", err);
  }
}

check();
