const db = require('../db');

async function list() {
  try {
    const advisers = await db.all("SELECT id, nombre, usuario, nivel_rol, email, activo FROM asesores");
    console.log("=== ADVISERS ===");
    console.table(advisers);
    
    const clients = await db.all("SELECT id, nombre, contacto, asesor_id FROM clientes LIMIT 5");
    console.log("=== CLIENTS (LIMIT 5) ===");
    console.table(clients);
  } catch (err) {
    console.error(err);
  }
}

list();
