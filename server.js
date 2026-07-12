const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const agentsService = require('./agentsService');
const { getVolumeMultiplier, getNetPrice, getSeasonPrice, calculateItemPricing } = require('./utils/pricing');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'casas_grandes_secret_key_123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// -------------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  const { email, usernameOrEmail, password } = req.body;
  const identifier = usernameOrEmail || email;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/Username and password are required' });
  }
  
  try {
    const user = await db.get(
      'SELECT * FROM asesores WHERE (email = ? OR usuario = ?) AND activo = 1',
      [identifier.trim(), identifier.trim()]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, usuario: user.usuario, nivel_rol: user.nivel_rol, email: user.email },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        nivel_rol: user.nivel_rol,
        email: user.email,
        telefono: user.telefono
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------
// CLIENTS & CRM ENDPOINTS
// -------------------------------------------------------------

app.get('/api/clientes', authenticateToken, async (req, res) => {
  const { asesor_id } = req.query;
  try {
    let query = `
      SELECT c.*, a.nombre as asesor_nombre, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn
      FROM clientes c
      LEFT JOIN asesores a ON c.asesor_id = a.id
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      WHERE c.activo = 1
    `;
    const params = [];
    
    // Non-admins (advisers) can only view their own clients unless they are Directors/Coordinators
    if (req.user.nivel_rol === 'Asesor') {
      query += ` AND c.asesor_id = ?`;
      params.push(req.user.id);
    } else if (asesor_id) {
      query += ` AND c.asesor_id = ?`;
      params.push(asesor_id);
    }
    
    query += ` ORDER BY c.nombre ASC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

app.post('/api/clientes', authenticateToken, async (req, res) => {
  const { nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, ubicacion, superficie_text } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Client name is required' });
  
  try {
    const existing = await db.get('SELECT id FROM clientes WHERE nombre = ?', [nombre.trim()]);
    if (existing) return res.status(400).json({ error: 'A client with this name already exists' });
    
    const assignedAsesor = (asesor_id === null || asesor_id === '') ? null : (asesor_id || req.user.id);
    const ccId = cuenta_clave_id || 1; // Default: General / None
    
    const result = await db.run(`
      INSERT INTO clientes (nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Nuevo', ?, ?)
    `, [nombre.trim(), assignedAsesor, ccId, contacto, telefono, correo, cumpleanos, ubicacion, superficie_text]);
    
    res.status(201).json({ id: result.id, message: 'Client registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

app.put('/api/clientes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { nombre, asesor_id, cuenta_clave_id, contacto, telefono, correo, cumpleanos, estado_status, ubicacion, superficie_text } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Check permissions
    if (req.user.nivel_rol === 'Asesor' && client.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to edit this client' });
    }
    
    await db.run(`
      UPDATE clientes
      SET nombre = ?, asesor_id = ?, cuenta_clave_id = ?, contacto = ?, telefono = ?, correo = ?, cumpleanos = ?, estado_status = ?, ubicacion = ?, superficie_text = ?
      WHERE id = ?
    `, [
      nombre || client.nombre,
      asesor_id !== undefined ? (asesor_id === '' ? null : asesor_id) : client.asesor_id,
      cuenta_clave_id || client.cuenta_clave_id,
      contacto !== undefined ? contacto : client.contacto,
      telefono !== undefined ? telefono : client.telefono,
      correo !== undefined ? correo : client.correo,
      cumpleanos !== undefined ? cumpleanos : client.cumpleanos,
      estado_status || client.estado_status,
      ubicacion !== undefined ? ubicacion : client.ubicacion,
      superficie_text !== undefined ? superficie_text : client.superficie_text,
      id
    ]);
    
    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

app.delete('/api/clientes/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const { id } = req.params;
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    await db.run('UPDATE clientes SET activo = 0, disponible_para_puja = 0 WHERE id = ?', [id]);
    await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

app.post('/api/clientes/bulk-delete', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Client ids are required' });
  }

  try {
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
    const deleted = await db.pool.query(
      `UPDATE clientes
       SET activo = 0, disponible_para_puja = 0
       WHERE activo = 1 AND id IN (${placeholders})`,
      ids
    );
    await db.pool.query(
      `UPDATE crm_pujas
       SET estatus = 'Rechazada'
       WHERE estatus = 'Pendiente' AND cliente_id IN (${placeholders})`,
      ids
    );
    res.json({ message: 'Clients deleted successfully', deleted: deleted.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete clients' });
  }
});

// CRM VISIT LOGS
app.get('/api/clientes/:id/visitas', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const visits = await db.all(`
      SELECT v.*, a.nombre as asesor_nombre
      FROM crm_visitas v
      JOIN asesores a ON v.asesor_id = a.id
      WHERE v.cliente_id = ?
      ORDER BY v.fecha_visita DESC
    `, [id]);
    res.json(visits);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visit logs' });
  }
});

app.post('/api/clientes/:id/visitas', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { comentarios_bitacora, proxima_cita } = req.body;
  if (!comentarios_bitacora) return res.status(400).json({ error: 'Comentarios are required' });
  
  try {
    const client = await db.get('SELECT id FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    const now = new Date().toISOString().slice(0, 10);
    await db.run(`
      INSERT INTO crm_visitas (fecha_visita, cliente_id, asesor_id, comentarios_bitacora, proxima_cita)
      VALUES (?, ?, ?, ?, ?)
    `, [now, id, req.user.id, comentarios_bitacora, proxima_cita || null]);
    
    res.status(201).json({ message: 'Visit logged successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});

// -------------------------------------------------------------
// PRODUCTS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT * FROM productos';
    const params = [];
    if (req.user.nivel_rol !== 'Administrador') {
      query += ' WHERE activo = 1';
    }
    query += ' ORDER BY activo DESC, tipo_categoria DESC, producto ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/productos', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { producto, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, stock_inicial } = req.body;
  if (!producto || !tipo_categoria || list_price_mxn === undefined) {
    return res.status(400).json({ error: 'Missing required product fields' });
  }
  try {
    const existing = await db.get('SELECT id FROM productos WHERE producto = ?', [producto.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'A product with this name already exists' });
    }
    const result = await db.run(`
      INSERT INTO productos (producto, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      producto.trim(),
      tipo_categoria,
      Number(list_price_mxn),
      Number(base_usd) || 0.0,
      Number(descuento_fijo_quimicos) || 0.0,
      Number(objetivo_anual) || 0,
      descontar ? 1 : 0
    ]);
    
    const newProdId = result.id;
    const initialQty = Number(stock_inicial) || 0.0;
    
    // Register initial stock in warehouse if > 0
    if (initialQty > 0) {
      const now = new Date().toISOString();
      await db.run(`
        INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, referencia_factura, asesor_id, notas)
        VALUES (?, 'Entrada de Compra', ?, ?, 0, ?, 'Inventario Inicial', ?, 'Registro de inventario inicial al dar de alta el producto')
      `, [now, newProdId, initialQty, initialQty, req.user.id]);
    }
    
    res.status(201).json({ id: newProdId, message: 'Product created successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { producto, tipo_categoria, list_price_mxn, base_usd, descuento_fijo_quimicos, objetivo_anual, descontar, activo } = req.body;
  if (!producto || !tipo_categoria || list_price_mxn === undefined) {
    return res.status(400).json({ error: 'Missing required product fields' });
  }
  try {
    const prod = await db.get('SELECT * FROM productos WHERE id = ?', [id]);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    
    const duplicate = await db.get('SELECT id FROM productos WHERE producto = ? AND id != ?', [producto.trim(), id]);
    if (duplicate) {
      return res.status(400).json({ error: 'Another product with this name already exists' });
    }
    
    const activeVal = (activo === undefined || activo === null) ? prod.activo : (activo ? 1 : 0);
    
    await db.run(`
      UPDATE productos
      SET producto = ?, tipo_categoria = ?, list_price_mxn = ?, base_usd = ?, descuento_fijo_quimicos = ?, objetivo_anual = ?, descontar = ?, activo = ?
      WHERE id = ?
    `, [
      producto.trim(),
      tipo_categoria,
      Number(list_price_mxn),
      Number(base_usd) || 0.0,
      Number(descuento_fijo_quimicos) || 0.0,
      Number(objetivo_anual) || 0,
      descontar ? 1 : 0,
      activeVal,
      id
    ]);
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/productos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  try {
    const prod = await db.get('SELECT * FROM productos WHERE id = ?', [id]);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    
    await db.run('UPDATE productos SET activo = 0 WHERE id = ?', [id]);
    res.json({ message: 'Product deactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate product' });
  }
});

// -------------------------------------------------------------
// CONFIGURATION ENDPOINTS
// -------------------------------------------------------------

app.get('/api/temporadas', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM temporadas ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seasons' });
  }
});

app.get('/api/cuentas-clave', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM cuentas_clave ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch key account tiers' });
  }
});

app.get('/api/asesores', authenticateToken, async (req, res) => {
  try {
    let query = 'SELECT id, nombre, usuario, nivel_rol, email, telefono, activo, cumpleanos, calificacion FROM asesores';
    const params = [];
    if (req.user.nivel_rol !== 'Administrador') {
      query += ' WHERE activo = 1';
    }
    query += ' ORDER BY activo DESC, nombre ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch advisers' });
  }
});

app.post('/api/asesores', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, password, calificacion } = req.body;
  if (!nombre || !usuario || !nivel_rol || !email) {
    return res.status(400).json({ error: 'Missing required advisor fields' });
  }
  try {
    const existing = await db.get('SELECT id FROM asesores WHERE email = ? OR usuario = ?', [email.trim(), usuario.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'An advisor with this email or username already exists' });
    }
    const rawPassword = password || 'password123';
    const password_hash = await bcrypt.hash(rawPassword, 10);
    const califVal = (calificacion === undefined || calificacion === null || calificacion === '') ? 5.0 : Number(calificacion);
    const result = await db.run(`
      INSERT INTO asesores (nombre, usuario, nivel_rol, email, telefono, cumpleanos, password_hash, activo, calificacion)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, password_hash, califVal]);
    res.status(201).json({ id: result.id, message: 'Advisor registered successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create advisor' });
  }
});

app.put('/api/asesores/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, activo, password, calificacion } = req.body;
  if (!nombre || !usuario || !nivel_rol || !email) {
    return res.status(400).json({ error: 'Missing required advisor fields' });
  }
  try {
    const adv = await db.get('SELECT * FROM asesores WHERE id = ?', [id]);
    if (!adv) return res.status(404).json({ error: 'Advisor not found' });

    const duplicate = await db.get('SELECT id FROM asesores WHERE (email = ? OR usuario = ?) AND id != ?', [email.trim(), usuario.trim(), id]);
    if (duplicate) {
      return res.status(400).json({ error: 'Another advisor with this email or username already exists' });
    }

    let passwordHash = adv.password_hash;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const activeVal = (activo === undefined || activo === null) ? adv.activo : (activo ? 1 : 0);
    const califVal = (calificacion === undefined || calificacion === null || calificacion === '') ? adv.calificacion : Number(calificacion);

    await db.run(`
      UPDATE asesores
      SET nombre = ?, usuario = ?, nivel_rol = ?, email = ?, telefono = ?, cumpleanos = ?, password_hash = ?, activo = ?, calificacion = ?
      WHERE id = ?
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, passwordHash, activeVal, califVal, id]);
    res.json({ message: 'Advisor updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update advisor' });
  }
});

app.delete('/api/asesores/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  try {
    const adv = await db.get('SELECT * FROM asesores WHERE id = ?', [id]);
    if (!adv) return res.status(404).json({ error: 'Advisor not found' });

    await db.run('UPDATE asesores SET activo = 0 WHERE id = ?', [id]);
    await db.run('UPDATE clientes SET asesor_id = NULL WHERE asesor_id = ?', [id]);
    res.json({ message: 'Advisor deactivated and their clients unassigned successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate advisor' });
  }
});

// -------------------------------------------------------------
// CATALOGO DE CICLOS & METAS GLOBALES API
// -------------------------------------------------------------

app.get('/api/ciclos', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM ciclos ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los ciclos agrícolas' });
  }
});

app.post('/api/ciclos', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar ciclos' });
  }
  const { nombre, activo } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del ciclo es requerido' });
  }
  try {
    const result = await db.run('INSERT INTO ciclos (nombre, activo) VALUES (?, ?) ON CONFLICT (nombre) DO NOTHING', [nombre, activo !== undefined ? activo : 1]);
    res.status(201).json({ id: result.id, nombre, activo: activo !== undefined ? activo : 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar el ciclo agrícola' });
  }
});

app.put('/api/ciclos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar ciclos' });
  }
  const { id } = req.params;
  const { nombre, activo } = req.body;
  try {
    await db.run('UPDATE ciclos SET nombre = ?, activo = ? WHERE id = ?', [nombre, activo, id]);
    res.json({ message: 'Ciclo agrícola actualizado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el ciclo agrícola' });
  }
});

app.delete('/api/ciclos/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Permisos de administrador requeridos' });
  }
  const { id } = req.params;
  try {
    await db.run('DELETE FROM ciclos WHERE id = ?', [id]);
    res.json({ message: 'Ciclo agrícola eliminado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el ciclo agrícola' });
  }
});

app.get('/api/metas-globales', authenticateToken, async (req, res) => {
  const { ciclo_id } = req.query;
  try {
    let query = `
      SELECT mg.*, p.producto, p.tipo_categoria, p.list_price_mxn 
      FROM metas_globales mg
      JOIN productos p ON mg.producto_id = p.id
    `;
    const params = [];
    if (ciclo_id) {
      query += ' WHERE mg.ciclo_id = ?';
      params.push(ciclo_id);
    }
    query += ' ORDER BY p.producto ASC';
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las metas globales' });
  }
});

app.post('/api/metas-globales', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Permisos insuficientes para administrar metas globales' });
  }
  const { ciclo_id, producto_id, cantidad_objetivo, monto_objetivo_mxn } = req.body;
  if (!ciclo_id || !producto_id) {
    return res.status(400).json({ error: 'El ciclo y el producto son requeridos' });
  }
  try {
    await db.run(`
      INSERT INTO metas_globales (ciclo_id, producto_id, cantidad_objetivo, monto_objetivo_mxn)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (ciclo_id, producto_id) 
      DO UPDATE SET 
        cantidad_objetivo = EXCLUDED.cantidad_objetivo,
        monto_objetivo_mxn = EXCLUDED.monto_objetivo_mxn
    `, [ciclo_id, producto_id, cantidad_objetivo || 0.0, monto_objetivo_mxn || 0.0]);
    res.json({ success: true, message: 'Meta global configurada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al configurar la meta global' });
  }
});

app.delete('/api/metas-globales/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Permisos de administrador requeridos' });
  }
  const { id } = req.params;
  try {
    await db.run('DELETE FROM metas_globales WHERE id = ?', [id]);
    res.json({ message: 'Meta global eliminada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la meta global' });
  }
});

// -------------------------------------------------------------
// QUOTING & CALCULATING ENGINE
// -------------------------------------------------------------

// getVolumeMultiplier is imported from utils/pricing.js
// The canonical volume discount scale (aligned with cotizador.py):
//   < 40 bolsas  -> 1.00 (no discount)
//   < 60 bolsas  -> 0.95 (5%)
//   < 80 bolsas  -> 0.90 (10%)
//   < 90 bolsas  -> 0.85 (15%)
//   >= 90 bolsas -> 0.80 (20%)

app.post('/api/cotizaciones/calcular', authenticateToken, async (req, res) => {
  const { cliente_id, items, temporada_id, cuenta_clave_id } = req.body;
  
  if (!cliente_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'cliente_id and non-empty items array are required' });
  }
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ?', [cliente_id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    // Determine key account tier and season
    const ccId = cuenta_clave_id || client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    // Calculate total quantity of discountable seeds first to get correct volume scale
    let totalDiscountableSeeds = 0;
    const dbItems = [];
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ?', [item.producto_id]);
      if (!prod) return res.status(404).json({ error: `Product ID ${item.producto_id} not found` });
      
      dbItems.push({ item, prod });
      if (prod.descontar === 1) {
        totalDiscountableSeeds += item.cantidad;
      }
    }
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    const calculatedItems = [];
    let grandTotal = 0.0;
    
    // Get current month (1-12) to look up promotional discount configured in Programación
    const currentMonth = new Date().getMonth() + 1;
    
    for (const { item, prod } of dbItems) {
      const listPrice = prod.list_price_mxn;
      let seasonPrice = listPrice;
      let netPrice = 0.0;
      
      // Step 1: Calculate season price (except for chemicals)
      if (prod.tipo_categoria === 'Agroquímico') {
        seasonPrice = listPrice;
      } else {
        const discount = activeSeason ? activeSeason.descuento_porcentaje : 0.0;
        const action = activeSeason ? activeSeason.estado_operacion : 'Sumar';
        if (action === 'Restar') {
          seasonPrice = listPrice * (1 - discount / 100.0);
        } else {
          seasonPrice = listPrice * (1 + discount / 100.0);
        }
      }
      
      // Step 2: Calculate net price
      if (prod.descontar === 1) {
        // Seeds eligible for volume + key account discount
        const baseUsd = prod.base_usd;
        const usdPriceForTier = Math.round((baseUsd * volMultiplier) * 100) / 100;
        const exchangeRate = 18.70;
        const mxnVolumePrice = Math.round(usdPriceForTier * 4.00 * exchangeRate);
        netPrice = mxnVolumePrice - keyAccountDesc;
      } else if (prod.tipo_categoria === 'Híbrido') {
        // Seeds with season price but NO volume/key account discount
        netPrice = Math.round(seasonPrice);
      } else {
        // Chemicals: List price minus flat catalog discount
        netPrice = seasonPrice - prod.descuento_fijo_quimicos;
      }
      
      // Step 3: Look up maximum advisor promo discount for this product/month
      // Configured in Programación Mensual (crm_precios_mensuales.promo_dinero)
      const promoRow = await db.get(
        'SELECT promo_dinero FROM crm_precios_mensuales WHERE producto_id = ? AND mes = ?',
        [prod.id, currentMonth]
      );
      const maxDiscountMxn = promoRow ? (promoRow.promo_dinero || 0.0) : 0.0;
      
      const subtotal = netPrice * item.cantidad;
      grandTotal += subtotal;
      
      calculatedItems.push({
        producto_id: prod.id,
        producto_nombre: prod.producto,
        tipo_categoria: prod.tipo_categoria,
        cantidad: item.cantidad,
        precio_lista: listPrice,
        precio_temporada: seasonPrice,
        precio_neto: netPrice,
        max_discount_mxn: maxDiscountMxn,
        subtotal
      });
    }
    

    res.json({
      cliente_nombre: client.nombre,
      cuenta_clave_nombre: keyAccount ? keyAccount.tier_name : 'General',
      temporada_nombre: activeSeason ? activeSeason.actividad : 'Precio Lleno',
      vol_multiplier: volMultiplier,
      total_discountable_seeds: totalDiscountableSeeds,
      items: calculatedItems,
      total_mxn: grandTotal,
      // For APARTADO conditions: requires $2,000 pesos deposit per bag of seed
      anticipo_requerido: totalDiscountableSeeds * 2000.0
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pricing calculation failed' });
  }
});

// CREATE QUOTATION / ORDER
app.post('/api/cotizaciones', authenticateToken, async (req, res) => {
  const { cliente_id, ciclo_agricola, condiciones_pago, temporada_id, items, financiera, notas } = req.body;
  
  if (!cliente_id || !ciclo_agricola || !condiciones_pago || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing required header or items list' });
  }
  
  try {
    // Generate unique Folio
    const date = new Date();
    const prefix = `CG-${date.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const mesShort = date.toLocaleString('es-MX', { month: 'short' }).toUpperCase().slice(0, 3);
    const now = date.toISOString().slice(0, 10);
    
    // First run the pricing calculation
    const calcReq = { body: { cliente_id, items, temporada_id } };
    let calcResData;
    
    // Manual local function call logic to compute pricing safely
    const client = await db.get('SELECT * FROM clientes WHERE id = ?', [cliente_id]);
    const ccId = client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    let totalDiscountableSeeds = 0;
    const calculatedItems = [];
    let grandTotal = 0.0;
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ?', [item.producto_id]);
      if (prod.descontar === 1) totalDiscountableSeeds += item.cantidad;
      calculatedItems.push({ item, prod });
    }
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    
    for (const row of calculatedItems) {
      const prod = row.prod;
      const item = row.item;
      let seasonPrice = prod.list_price_mxn;
      
      if (prod.tipo_categoria !== 'Agroquímico') {
        const discount = activeSeason ? activeSeason.descuento_porcentaje : 0.0;
        const action = activeSeason ? activeSeason.estado_operacion : 'Sumar';
        seasonPrice = action === 'Restar' ? 
          prod.list_price_mxn * (1 - discount / 100.0) : 
          prod.list_price_mxn * (1 + discount / 100.0);
      }
      
      let netPrice = 0.0;
      if (prod.descontar === 1) {
        const usdPriceForTier = Math.round((prod.base_usd * volMultiplier) * 100) / 100;
        netPrice = Math.round(usdPriceForTier * 4.00 * 18.70) - keyAccountDesc;
      } else if (prod.tipo_categoria === 'Híbrido') {
        netPrice = Math.round(seasonPrice);
      } else {
        netPrice = seasonPrice - prod.descuento_fijo_quimicos;
      }
      
      row.netPrice = netPrice;
      row.subtotal = netPrice * item.cantidad;
      grandTotal += row.subtotal;
    }
    
    const anticipoApartado = condiciones_pago === 'APARTADO' ? totalDiscountableSeeds * 2000.0 : 0.0;
    
    // Status logic: if payment conditions are credit, or manual note, might need review. Let's make it 'Autorizada' by default
    const defaultStatus = 'Autorizada';
    
    const result = await db.run(`
      INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [now, cliente_id, req.user.id, ciclo_agricola, condiciones_pago, prefix, mesShort, defaultStatus, grandTotal, anticipoApartado, notas, financiera || null]);
    
    const cotId = result.id;
    
    for (const row of calculatedItems) {
      await db.run(`
        INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `, [cotId, row.item.producto_id, temporada_id || activeSeason.id, row.item.cantidad, row.prod.list_price_mxn, row.netPrice, row.subtotal]);
    }
    
    res.status(201).json({ id: cotId, folio: prefix, total_mxn: grandTotal, status: defaultStatus, message: 'Quotation submitted successfully' });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create quotation' });
  }
});

// FETCH QUOTATIONS
app.get('/api/cotizaciones', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT q.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM cotizaciones q
      JOIN clientes c ON q.cliente_id = c.id
      JOIN asesores a ON q.asesor_id = a.id
    `;
    const params = [];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` WHERE q.asesor_id = ?`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY q.fecha_creacion DESC`;
    const quotes = await db.all(query, params);
    
    // Fetch details for each quote
    for (const q of quotes) {
      q.items = await db.all(`
        SELECT d.*, p.producto as producto_nombre, p.tipo_categoria
        FROM cotizacion_detalles d
        JOIN productos p ON d.producto_id = p.id
        WHERE d.cotizacion_id = ?
      `, [q.id]);
    }
    
    res.json(quotes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

app.put('/api/cotizaciones/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { estatus } = req.body;
  if (!estatus) return res.status(400).json({ error: 'Status is required' });
  
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    if (req.user.nivel_rol === 'Asesor' && q.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Check if stock is currently deducted (indicated by a Salida movement for this quote)
    const stockDeducted = await db.get(
      "SELECT id FROM almacen_movimientos WHERE cotizacion_id = ? AND tipo_movimiento LIKE 'Salida%' LIMIT 1",
      [id]
    );
    
    const now = new Date().toISOString();
    const dateOnly = now.slice(0, 10);
    const items = await db.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
    
    if (estatus === 'Vendido' || estatus === 'Entregado') {
      // If stock has not been deducted yet, deduct it now
      if (!stockDeducted) {
        for (const item of items) {
          const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock - item.cantidad_ordenada;
          
          await db.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Salida por Pedido', ?, 0, ?, ?, ?, ?, ?, ?)
          `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Salida registrada por cambio de estatus de cotización a ${estatus}`]);
        }
      }
      
      // Update quantity delivered based on state
      if (estatus === 'Entregado') {
        await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = cantidad_ordenada WHERE cotizacion_id = ?', [id]);
      } else {
        await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = 0 WHERE cotizacion_id = ?', [id]);
      }
      
    } else if (estatus === 'Borrador' || estatus === 'Autorizada') {
      // Revert stock if it was previously deducted
      if (stockDeducted) {
        for (const item of items) {
          const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
          const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
          const new_stock = current_stock + item.cantidad_ordenada;
          
          await db.run(`
            INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
            VALUES (?, 'Reversión por Cancelación', ?, ?, 0, ?, ?, ?, ?, ?)
          `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión de stock por cambio de estatus de cotización a ${estatus}`]);
        }
      }
      
      // Reset quantity delivered
      await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = 0 WHERE cotizacion_id = ?', [id]);
    }
    
    await db.run('UPDATE cotizaciones SET estatus = ? WHERE id = ?', [estatus, id]);
    
    res.json({ message: 'Quotation status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE QUOTATION
app.delete('/api/cotizaciones/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    // Authorization check
    if (req.user.nivel_rol === 'Asesor') {
      if (q.asesor_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to delete this quote' });
      }
    }
    
    // Check if stock is currently deducted and revert it
    const stockDeducted = await db.get(
      "SELECT id FROM almacen_movimientos WHERE cotizacion_id = ? AND tipo_movimiento LIKE 'Salida%' LIMIT 1",
      [id]
    );
    
    if (stockDeducted) {
      const now = new Date().toISOString();
      const items = await db.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
      for (const item of items) {
        const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
        const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
        const new_stock = current_stock + item.cantidad_ordenada;
        
        await db.run(`
          INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
          VALUES (?, 'Reversión por Eliminación', ?, ?, 0, ?, ?, ?, ?, ?)
        `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión de stock por eliminación de cotización`]);
      }
    }
    
    await db.run('DELETE FROM cotizaciones WHERE id = ?', [id]);
    res.json({ message: 'Quotation deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

// EDIT QUOTATION (HEADER & DETAILS)
app.put('/api/cotizaciones/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ciclo_agricola, condiciones_pago, financiera, notas, temporada_id, items } = req.body;
  
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items array is required' });
  }
  
  try {
    const q = await db.get('SELECT * FROM cotizaciones WHERE id = ?', [id]);
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    
    if (req.user.nivel_rol === 'Asesor' && q.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to edit this quote' });
    }
    
    // Step 1: Revert stock if currently deducted
    const stockDeducted = await db.get(
      "SELECT id FROM almacen_movimientos WHERE cotizacion_id = ? AND tipo_movimiento LIKE 'Salida%' LIMIT 1",
      [id]
    );
    const now = new Date().toISOString();
    
    if (stockDeducted) {
      const oldItems = await db.all('SELECT * FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
      for (const item of oldItems) {
        const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [item.producto_id]);
        const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
        const new_stock = current_stock + item.cantidad_ordenada;
        
        await db.run(`
          INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
          VALUES (?, 'Reversión por Edición', ?, ?, 0, ?, ?, ?, ?, ?)
        `, [now, item.producto_id, item.cantidad_ordenada, new_stock, id, req.user.id, q.folio_cotizacion, `Reversión de stock por edición de cotización`]);
      }
    }
    
    // Step 2: Calculate pricing for new items
    const client = await db.get('SELECT * FROM clientes WHERE id = ?', [q.cliente_id]);
    const ccId = client.cuenta_clave_id || 1;
    const keyAccount = await db.get('SELECT * FROM cuentas_clave WHERE id = ?', [ccId]);
    const keyAccountDesc = keyAccount ? keyAccount.descuento_mxn : 0.0;
    
    const activeSeason = temporada_id ? 
      await db.get('SELECT * FROM temporadas WHERE id = ?', [temporada_id]) : 
      await db.get("SELECT * FROM temporadas WHERE actividad = 'Temporada (Precio Lleno)'");
      
    let totalDiscountableSeeds = 0;
    const calculatedRows = [];
    
    for (const item of items) {
      const prod = await db.get('SELECT * FROM productos WHERE id = ?', [item.producto_id]);
      if (!prod) return res.status(404).json({ error: `Product ID ${item.producto_id} not found` });
      
      if (prod.descontar === 1) {
        totalDiscountableSeeds += item.cantidad;
      }
      calculatedRows.push({ item, prod });
    }
    
    // Using canonical getVolumeMultiplier imported from utils/pricing.js
    
    const volMultiplier = getVolumeMultiplier(totalDiscountableSeeds);
    let grandTotal = 0.0;
    
    for (const row of calculatedRows) {
      const prod = row.prod;
      const item = row.item;
      let seasonPrice = prod.list_price_mxn;
      
      if (prod.tipo_categoria !== 'Agroquímico') {
        const discount = activeSeason ? activeSeason.descuento_porcentaje : 0.0;
        const action = activeSeason ? activeSeason.estado_operacion : 'Sumar';
        seasonPrice = action === 'Restar' ? 
          prod.list_price_mxn * (1 - discount / 100.0) : 
          prod.list_price_mxn * (1 + discount / 100.0);
      }
      
      let netPrice = 0.0;
      if (prod.descontar === 1) {
        const usdPriceForTier = Math.round((prod.base_usd * volMultiplier) * 100) / 100;
        netPrice = Math.round(usdPriceForTier * 4.00 * 18.70) - keyAccountDesc;
      } else if (prod.tipo_categoria === 'Híbrido') {
        netPrice = Math.round(seasonPrice);
      } else {
        netPrice = seasonPrice - prod.descuento_fijo_quimicos;
      }
      
      row.netPrice = netPrice;
      row.subtotal = netPrice * item.cantidad;
      grandTotal += row.subtotal;
    }
    
    // Step 3: Delete old details
    await db.run('DELETE FROM cotizacion_detalles WHERE cotizacion_id = ?', [id]);
    
    // Step 4: Insert new details
    for (const row of calculatedRows) {
      await db.run(`
        INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `, [id, row.item.producto_id, temporada_id || (activeSeason ? activeSeason.id : 1), row.item.cantidad, row.prod.list_price_mxn, row.netPrice, row.subtotal]);
    }
    
    // Update header
    const anticipoApartado = condiciones_pago === 'APARTADO' ? totalDiscountableSeeds * 2000.0 : 0.0;
    
    await db.run(`
      UPDATE cotizaciones
      SET ciclo_agricola = ?, condiciones_pago = ?, financiera = ?, notas = ?, total_mxn = ?, anticipo_apartado = ?
      WHERE id = ?
    `, [ciclo_agricola, condiciones_pago, financiera || null, notas || null, grandTotal, anticipoApartado, id]);
    
    // Step 5: Re-deduct stock if state is Sold or Delivered
    if (q.estatus === 'Vendido' || q.estatus === 'Entregado') {
      for (const row of calculatedRows) {
        const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [row.item.producto_id]);
        const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
        const new_stock = current_stock - row.item.cantidad;
        
        await db.run(`
          INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, cotizacion_id, asesor_id, referencia_factura, notas)
          VALUES (?, 'Salida por Pedido (Editado)', ?, 0, ?, ?, ?, ?, ?, ?)
        `, [now, row.item.producto_id, row.item.cantidad, new_stock, id, req.user.id, q.folio_cotizacion, `Salida registrada por cambio de detalles de cotización`]);
      }
      
      if (q.estatus === 'Entregado') {
        await db.run('UPDATE cotizacion_detalles SET cantidad_entregada = cantidad_ordenada WHERE cotizacion_id = ?', [id]);
      }
    }
    
    res.json({ message: 'Quotation updated successfully', total_mxn: grandTotal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update quotation' });
  }
});

// -------------------------------------------------------------
// WAREHOUSE & INVENTORY ENDPOINTS
// -------------------------------------------------------------

app.get('/api/almacen/existencias', authenticateToken, async (req, res) => {
  try {
    const products = await db.all('SELECT id, producto, tipo_categoria, list_price_mxn FROM productos WHERE activo = 1');
    const existencias = [];
    
    for (const p of products) {
      const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [p.id]);
      existencias.push({
        id: p.id,
        producto: p.producto,
        tipo_categoria: p.tipo_categoria,
        existencias: last_move ? last_move.existencias_resultantes : 0.0
      });
    }
    res.json(existencias);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock existencias' });
  }
});

app.get('/api/almacen/movimientos', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT m.*, p.producto as producto_nombre, a.nombre as asesor_nombre, c.folio_cotizacion
      FROM almacen_movimientos m
      JOIN productos p ON m.producto_id = p.id
      LEFT JOIN asesores a ON m.asesor_id = a.id
      LEFT JOIN cotizaciones c ON m.cotizacion_id = c.id
      ORDER BY m.id DESC LIMIT 300
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch warehouse movements' });
  }
});

app.post('/api/almacen/movimientos', authenticateToken, async (req, res) => {
  const { producto_id, tipo_movimiento, cantidad_entrante, cantidad_saliente, referencia_factura, notas } = req.body;
  if (!producto_id || !tipo_movimiento) {
    return res.status(400).json({ error: 'producto_id and tipo_movimiento are required' });
  }
  
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Almacen' && req.user.nivel_rol !== 'Acopio') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const prod = await db.get('SELECT * FROM productos WHERE id = ?', [producto_id]);
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    
    const last_move = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [producto_id]);
    const current_stock = last_move ? last_move.existencias_resultantes : 0.0;
    
    const ent = Number(cantidad_entrante) || 0.0;
    const sal = Number(cantidad_saliente) || 0.0;
    
    if (tipo_movimiento.startsWith('Salida') && current_stock < sal) {
      return res.status(400).json({ error: 'Insufficient stock in warehouse' });
    }
    
    const new_stock = current_stock + ent - sal;
    const now = new Date().toISOString();
    
    await db.run(`
      INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, referencia_factura, asesor_id, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [now, tipo_movimiento, producto_id, ent, sal, new_stock, referencia_factura || null, req.user.id, notas]);
    
    res.status(201).json({ existencias: new_stock, message: 'Stock movement logged successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record movement' });
  }
});

// INTERNAL UAN-32 PRODUCTION
app.post('/api/almacen/produccion-uan32', authenticateToken, async (req, res) => {
  const { cantidad_solub_toneladas } = req.body;
  if (!cantidad_solub_toneladas || Number(cantidad_solub_toneladas) <= 0) {
    return res.status(400).json({ error: 'cantidad_solub_toneladas must be a positive number' });
  }
  
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Almacen') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const solub = await db.get("SELECT id FROM productos WHERE producto LIKE '%Solub 45%'");
    const uan = await db.get("SELECT id FROM productos WHERE producto = 'UAN-32'");
    
    if (!solub || !uan) return res.status(404).json({ error: 'Solub 45 or UAN-32 products not found in catalog' });
    
    const last_solub = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [solub.id]);
    const current_solub = last_solub ? last_solub.existencias_resultantes : 0.0;
    
    const solub_to_deduct = Number(cantidad_solub_toneladas);
    if (current_solub < solub_to_deduct) {
      return res.status(400).json({ error: `Insufficient stock of Novatec Solub 45 (Current: ${current_solub} Tons)` });
    }
    
    // Conversion formula: 2000 Liters of UAN-32 per 1 Ton of Solub 45
    const uan_to_add = solub_to_deduct * 2000.0;
    
    const last_uan = await db.get('SELECT existencias_resultantes FROM almacen_movimientos WHERE producto_id = ? ORDER BY id DESC LIMIT 1', [uan.id]);
    const current_uan = last_uan ? last_uan.existencias_resultantes : 0.0;
    
    const new_solub = current_solub - solub_to_deduct;
    const new_uan = current_uan + uan_to_add;
    
    const now = new Date().toISOString();
    
    // Deduct Solub
    await db.run(`
      INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, asesor_id, notas)
      VALUES (?, 'Conversión Producción UAN-32', ?, 0, ?, ?, ?, 'Salida de materia prima para producción interna UAN-32')
    `, [now, solub.id, solub_to_deduct, new_solub, req.user.id]);
    
    // Add UAN
    await db.run(`
      INSERT INTO almacen_movimientos (fecha_movimiento, tipo_movimiento, producto_id, cantidad_entrante, cantidad_saliente, existencias_resultantes, asesor_id, notas)
      VALUES (?, 'Conversión Producción UAN-32', ?, ?, 0, ?, ?, 'Entrada de producto terminado por producción interna')
    `, [now, uan.id, uan_to_add, new_uan, req.user.id]);
    
    res.json({
      solub_existencias: new_solub,
      uan_existencias: new_uan,
      uan_produced_liters: uan_to_add,
      message: 'UAN-32 production successfully completed and stock updated.'
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'UAN-32 conversion process failed' });
  }
});

// -------------------------------------------------------------
// DASHBOARD & ANALYTICS ENDPOINTS
// -------------------------------------------------------------

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const ciclo = req.query.ciclo_agricola || 'O-I 2026';
    
    // 1. Clients Count
    let clientsSql = 'SELECT count(*) as count FROM clientes WHERE activo = 1';
    const clientsParams = [];
    if (req.user.nivel_rol === 'Asesor') {
      clientsSql += ' AND asesor_id = ?';
      clientsParams.push(req.user.id);
    }
    const clientsCount = await db.get(clientsSql, clientsParams);

    // 2. Promesa de Venta (Borrador/Autorizada)
    let promesaSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE estatus IN ('Borrador', 'Autorizada') AND ciclo_agricola = ?";
    const promesaParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      promesaSql += ' AND asesor_id = ?';
      promesaParams.push(req.user.id);
    }
    const promesaRes = await db.get(promesaSql, promesaParams);

    // 3. Ventas Contado (Contado + Vendido/Entregado)
    let contadoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE condiciones_pago = 'Contado' AND estatus IN ('Vendido', 'Entregado') AND ciclo_agricola = ?";
    const contadoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      contadoSql += ' AND asesor_id = ?';
      contadoParams.push(req.user.id);
    }
    const contadoRes = await db.get(contadoSql, contadoParams);

    // 4. Ventas Crédito (Crédito + Entregado)
    let creditoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE (condiciones_pago LIKE '%Crédito%' OR condiciones_pago LIKE '%Credito%') AND estatus = 'Entregado' AND ciclo_agricola = ?";
    const creditoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      creditoSql += ' AND asesor_id = ?';
      creditoParams.push(req.user.id);
    }
    const creditoRes = await db.get(creditoSql, creditoParams);

    // 5. Monto Recuperado (Crédito + Vendido)
    let recuperadoSql = "SELECT COALESCE(SUM(total_mxn), 0.0) as total FROM cotizaciones WHERE (condiciones_pago LIKE '%Crédito%' OR condiciones_pago LIKE '%Credito%') AND estatus = 'Vendido' AND ciclo_agricola = ?";
    const recuperadoParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      recuperadoSql += ' AND asesor_id = ?';
      recuperadoParams.push(req.user.id);
    }
    const recuperadoRes = await db.get(recuperadoSql, recuperadoParams);

    const promesa_sales_mxn = promesaRes ? promesaRes.total : 0.0;
    const contado_sales_mxn = contadoRes ? contadoRes.total : 0.0;
    const credito_sales_mxn = creditoRes ? creditoRes.total : 0.0;
    const recuperado_sales_mxn = recuperadoRes ? recuperadoRes.total : 0.0;
    const total_sales_mxn = contado_sales_mxn + recuperado_sales_mxn;

    // 6. Real quantities for goals
    let realSql = `
      SELECT 
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Híbrido' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_semilla,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto ILIKE '%Faena%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_faena,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto ILIKE '%Clavis%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_clavis,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Agroquímico' AND p.producto NOT ILIKE '%Faena%' AND p.producto NOT ILIKE '%Clavis%' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_cropprotection,
        COALESCE(SUM(CASE WHEN p.tipo_categoria = 'Fertilizante' THEN cd.cantidad_ordenada ELSE 0 END), 0) as real_cosecha
      FROM cotizacion_detalles cd
      JOIN productos p ON cd.producto_id = p.id
      JOIN cotizaciones c ON cd.cotizacion_id = c.id
      WHERE c.estatus IN ('Vendido', 'Entregado') AND c.ciclo_agricola = ?
    `;
    const realParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      realSql += ' AND c.asesor_id = ?';
      realParams.push(req.user.id);
    }
    const realRes = await db.get(realSql, realParams);

    // 7. Target quantities (metas)
    let targetsSql = `
      SELECT 
        COALESCE(SUM(bolsas_objetivo), 0) as target_semilla,
        COALESCE(SUM(meta_faena), 0) as target_faena,
        COALESCE(SUM(meta_clavis), 0) as target_clavis,
        COALESCE(SUM(meta_cropprotection), 0) as target_cropprotection,
        COALESCE(SUM(meta_cosecha), 0) as target_cosecha,
        COALESCE(SUM(monto_objetivo_mxn), 0.0) as target_monto
      FROM metas_ventas
      WHERE ciclo_agricola = ? AND activo = 1
    `;
    const targetsParams = [ciclo];
    if (req.user.nivel_rol === 'Asesor') {
      targetsSql += ' AND asesor_id = ?';
      targetsParams.push(req.user.id);
    }
    const targetsRes = await db.get(targetsSql, targetsParams);

    const goals_progress = [
      { category: 'Semilla', target: targetsRes ? targetsRes.target_semilla : 0, real: realRes ? realRes.real_semilla : 0, unit: 'bolsas' },
      { category: 'Agroquímicos (Faena)', target: targetsRes ? targetsRes.target_faena : 0, real: realRes ? realRes.real_faena : 0, unit: 'L/kg' },
      { category: 'Agroquímicos (Clavis)', target: targetsRes ? targetsRes.target_clavis : 0, real: realRes ? realRes.real_clavis : 0, unit: 'L/kg' },
      { category: 'Agroquímicos (Crop Protection)', target: targetsRes ? targetsRes.target_cropprotection : 0, real: realRes ? realRes.real_cropprotection : 0, unit: 'L/kg' },
      { category: 'Cosecha', target: targetsRes ? targetsRes.target_cosecha : 0, real: realRes ? realRes.real_cosecha : 0, unit: 'toneladas' }
    ];

    // 8. Performance cards for active advisors
    const performanceSql = `
      SELECT 
        a.id, 
        a.nombre, 
        a.usuario, 
        a.email, 
        a.telefono, 
        COALESCE(a.calificacion, 5.0) as calificacion,
        COALESCE(c.client_count, 0) as client_count,
        COALESCE(q.quote_count, 0) as quote_count,
        COALESCE(s.sales_total, 0.0) as sales_total,
        COALESCE(p.plan_completed, 0) as plan_completed,
        COALESCE(p.plan_expired, 0) as plan_expired,
        COALESCE(p.plan_total, 0) as plan_total
      FROM asesores a
      LEFT JOIN (
        SELECT asesor_id, COUNT(*) as client_count 
        FROM clientes 
        WHERE activo = 1 
        GROUP BY asesor_id
      ) c ON c.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, COUNT(*) as quote_count 
        FROM cotizaciones 
        WHERE ciclo_agricola = ?
        GROUP BY asesor_id
      ) q ON q.asesor_id = a.id
      LEFT JOIN (
        SELECT asesor_id, SUM(total_mxn) as sales_total 
        FROM cotizaciones 
        WHERE estatus IN ('Vendido', 'Entregado') AND ciclo_agricola = ?
        GROUP BY asesor_id
      ) s ON s.asesor_id = a.id
      LEFT JOIN (
        SELECT 
          asesor_id, 
          COUNT(*) as plan_total,
          SUM(CASE WHEN realizada = 1 THEN 1 ELSE 0 END) as plan_completed,
          SUM(CASE WHEN realizada = 3 THEN 1 ELSE 0 END) as plan_expired
        FROM planificacion_semanal 
        GROUP BY asesor_id
      ) p ON p.asesor_id = a.id
      WHERE a.activo = 1 AND a.nivel_rol = 'Asesor'
      ORDER BY sales_total DESC, a.nombre ASC
    `;
    const performance = await db.all(performanceSql, [ciclo, ciclo]);

    // Backward compatible
    let visitsSql = `
      SELECT a.nombre as adviser, count(v.id) as count
      FROM asesores a
      LEFT JOIN crm_visitas v ON v.asesor_id = a.id
      WHERE a.activo = 1
    `;
    const visitsParams = [];
    if (req.user.nivel_rol === 'Asesor') {
      visitsSql += ' AND a.id = ?';
      visitsParams.push(req.user.id);
    }
    visitsSql += ' GROUP BY a.id ORDER BY count DESC';
    const visits = await db.all(visitsSql, visitsParams);

    res.json({
      total_clients: clientsCount ? Number(clientsCount.count) : 0,
      promesa_sales_mxn: Number(promesa_sales_mxn),
      contado_sales_mxn: Number(contado_sales_mxn),
      credito_sales_mxn: Number(credito_sales_mxn),
      recuperado_sales_mxn: Number(recuperado_sales_mxn),
      total_sales_mxn: Number(total_sales_mxn),
      goals_progress,
      advisers_visits: visits,
      advisers_performance: performance
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Direct assignment of client to advisor
app.put('/api/asignacion/clientes/:id/asesor', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { asesor_id } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    const oldAsesorId = client.asesor_id;
    await db.run('UPDATE clientes SET asesor_id = ?, disponible_para_puja = 0 WHERE id = ?', [asesor_id || null, id]);
    
    // Create notifications for changes
    if (asesor_id && Number(oldAsesorId) !== Number(asesor_id)) {
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [asesor_id, `Se te ha asignado al agricultor: ${client.nombre}`]);
    }
    
    if (oldAsesorId && Number(oldAsesorId) !== Number(asesor_id)) {
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [oldAsesorId, `Se te ha retirado del agricultor: ${client.nombre}`]);
    }
    
    // Reject any pending bids and notify those advisors
    const pendingBids = await db.all("SELECT id, asesor_id FROM crm_pujas WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    for (const b of pendingBids) {
      if (asesor_id && Number(b.asesor_id) === Number(asesor_id)) {
        await db.run("UPDATE crm_pujas SET estatus = 'Aprobada' WHERE id = ?", [b.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [b.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue Aprobada y se te ha asignado.`]);
      } else {
        await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [b.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [b.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue rechazada (asignado a otro asesor).`]);
      }
    }
    
    res.json({ message: 'Client advisor assigned successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign client advisor' });
  }
});

// Fetch clients without advisors
app.get('/api/asignacion/sin-asesor', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT c.*, cc.tier_name as cuenta_clave_nombre, cc.descuento_mxn
      FROM clientes c
      LEFT JOIN cuentas_clave cc ON c.cuenta_clave_id = cc.id
      WHERE c.activo = 1 AND c.asesor_id IS NULL
      ORDER BY c.nombre ASC
    `;
    const clients = await db.all(query);
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch unassigned clients' });
  }
});

// Update client biddable status
app.put('/api/clientes/:id/puja-status', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { disponible_para_puja } = req.body;
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    
    await db.run('UPDATE clientes SET disponible_para_puja = ? WHERE id = ?', [disponible_para_puja ? 1 : 0, id]);
    
    // If removed from biddable pool, clean up pending bids
    if (!disponible_para_puja) {
      await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE cliente_id = ? AND estatus = 'Pendiente'", [id]);
    }
    
    res.json({ message: 'Client bidding status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update client bidding status' });
  }
});

// Get bids list
app.get('/api/asignacion/pujas', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT p.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM crm_pujas p
      JOIN clientes c ON p.cliente_id = c.id
      JOIN asesores a ON p.asesor_id = a.id
    `;
    const params = [];
    if (req.user.nivel_rol === 'Asesor') {
      query += ` WHERE p.asesor_id = ?`;
      params.push(req.user.id);
    }
    query += ` ORDER BY p.creado_en DESC`;
    
    const bids = await db.all(query, params);
    res.json(bids);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bids' });
  }
});

// Submit a bid (Advisor only)
app.post('/api/asignacion/pujas', authenticateToken, async (req, res) => {
  const { cliente_id, justificacion } = req.body;
  const asesor_id = req.user.id;
  
  if (!cliente_id || !justificacion) {
    return res.status(400).json({ error: 'cliente_id and justificacion are required' });
  }
  
  try {
    const client = await db.get('SELECT * FROM clientes WHERE id = ? AND activo = 1', [cliente_id]);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.disponible_para_puja) {
      return res.status(400).json({ error: 'Client is not available for bidding' });
    }
    if (client.asesor_id !== null) {
      return res.status(400).json({ error: 'Client already has an advisor assigned' });
    }
    
    const existing = await db.get(
      "SELECT * FROM crm_pujas WHERE cliente_id = ? AND asesor_id = ? AND estatus = 'Pendiente'",
      [cliente_id, asesor_id]
    );
    
    if (existing) {
      await db.run(
        "UPDATE crm_pujas SET justificacion = ?, creado_en = CURRENT_TIMESTAMP WHERE id = ?",
        [justificacion, existing.id]
      );
      return res.json({ message: 'Bid updated successfully', bidId: existing.id });
    }
    
    const result = await db.run(
      "INSERT INTO crm_pujas (cliente_id, asesor_id, justificacion) VALUES (?, ?, ?)",
      [cliente_id, asesor_id, justificacion]
    );
    res.json({ message: 'Bid placed successfully', bidId: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place bid' });
  }
});

// Approve or reject a bid (Admin only)
app.post('/api/asignacion/pujas/:id/decision', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { id } = req.params;
  const { decision } = req.body;
  
  if (decision !== 'Aprobada' && decision !== 'Rechazada') {
    return res.status(400).json({ error: "Decision must be 'Aprobada' or 'Rechazada'" });
  }
  
  try {
    const bid = await db.get('SELECT * FROM crm_pujas WHERE id = ?', [id]);
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.estatus !== 'Pendiente') {
      return res.status(400).json({ error: 'Decision has already been made on this bid' });
    }
    
    if (decision === 'Aprobada') {
      const client = await db.get('SELECT * FROM clientes WHERE id = ?', [bid.cliente_id]);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (client.asesor_id !== null) {
        return res.status(400).json({ error: 'Client already has an advisor assigned' });
      }
      
      const oldAsesorId = client.asesor_id;
      await db.run('UPDATE clientes SET asesor_id = ?, disponible_para_puja = 0 WHERE id = ?', [bid.asesor_id, bid.cliente_id]);
      await db.run("UPDATE crm_pujas SET estatus = 'Aprobada' WHERE id = ?", [id]);
      
      // Notify approved advisor
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [bid.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue Aprobada. Se te ha asignado el cliente.`]);
        
      if (oldAsesorId && Number(oldAsesorId) !== Number(bid.asesor_id)) {
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [oldAsesorId, `Se te ha retirado del agricultor: ${client.nombre}`]);
      }
      
      // Reject and notify other pending candidates
      const otherBids = await db.all("SELECT id, asesor_id FROM crm_pujas WHERE cliente_id = ? AND id != ? AND estatus = 'Pendiente'", [bid.cliente_id, id]);
      for (const ob of otherBids) {
        await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [ob.id]);
        await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
          [ob.asesor_id, `Tu propuesta para el agricultor ${client.nombre} fue rechazada (asignado a otro asesor).`]);
      }
      
      res.json({ message: 'Bid approved and client assigned successfully' });
    } else {
      await db.run("UPDATE crm_pujas SET estatus = 'Rechazada' WHERE id = ?", [id]);
      
      const client = await db.get('SELECT nombre FROM clientes WHERE id = ?', [bid.cliente_id]);
      const clientName = client ? client.nombre : 'desconocido';
      
      // Notify rejected advisor
      await db.run('INSERT INTO crm_notificaciones (asesor_id, mensaje) VALUES (?, ?)', 
        [bid.asesor_id, `Tu propuesta para el agricultor ${clientName} fue rechazada.`]);
        
      res.json({ message: 'Bid rejected successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process decision' });
  }
});

// Fetch AI matching metrics
app.get('/api/asignacion/metricas-AI', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  try {
    const advisorsQuery = `
      SELECT 
        a.id as asesor_id,
        a.nombre,
        COALESCE(SUM(CASE WHEN q.estatus IN ('Vendido', 'Entregado') THEN q.total_mxn ELSE 0 END), 0) as total_sales_mxn,
        COUNT(CASE WHEN p.realizada = 1 THEN 1 END) as completed_visits,
        COUNT(p.id) as total_visits,
        COUNT(CASE WHEN p.realizada = 0 THEN 1 END) as pending_visits
      FROM asesores a
      LEFT JOIN cotizaciones q ON q.asesor_id = a.id
      LEFT JOIN planificacion_semanal p ON p.asesor_id = a.id
      WHERE a.activo = 1 AND a.nivel_rol = 'Asesor'
      GROUP BY a.id, a.nombre
    `;
    const advisorsMetrics = await db.all(advisorsQuery);
    
    const clientsQuery = `
      SELECT 
        c.id as cliente_id,
        c.nombre,
        COALESCE(SUM(q.total_mxn), 0) as total_purchase_mxn
      FROM clientes c
      LEFT JOIN cotizaciones q ON q.cliente_id = c.id AND q.estatus IN ('Vendido', 'Entregado')
      WHERE c.activo = 1 AND c.asesor_id IS NULL
      GROUP BY c.id, c.nombre
    `;
    const clientsMetrics = await db.all(clientsQuery);
    
    res.json({
      advisors: advisorsMetrics,
      clients: clientsMetrics
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matching metrics' });
  }
});

// -------------------------------------------------------------
// SALES TARGETS (METAS) ENDPOINTS
// -------------------------------------------------------------

app.get('/api/metas', authenticateToken, async (req, res) => {
  const { ciclo_agricola } = req.query;
  const ciclo = ciclo_agricola || 'O-I 2026';
  try {
    let query = `
      SELECT m.*, a.nombre as asesor_nombre
      FROM metas_ventas m
      LEFT JOIN asesores a ON m.asesor_id = a.id
      WHERE m.activo = 1 AND m.ciclo_agricola = ?
    `;
    const params = [ciclo];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` AND m.asesor_id = ?`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY a.nombre ASC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metas' });
  }
});

app.post('/api/metas', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  const { 
    asesor_id, 
    ciclo_agricola, 
    monto_objetivo_mxn, 
    bolsas_objetivo,
    meta_faena,
    meta_clavis,
    meta_cropprotection,
    meta_cosecha
  } = req.body;
  if (!asesor_id || !ciclo_agricola) {
    return res.status(400).json({ error: 'asesor_id and ciclo_agricola are required' });
  }
  
  try {
    // Check if target already exists (upsert)
    const existing = await db.get(
      'SELECT id FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ? AND activo = 1',
      [asesor_id, ciclo_agricola]
    );
    
    if (existing) {
      await db.run(`
        UPDATE metas_ventas
        SET monto_objetivo_mxn = ?, bolsas_objetivo = ?,
            meta_faena = ?, meta_clavis = ?, meta_cropprotection = ?, meta_cosecha = ?
        WHERE id = ?
      `, [
        Number(monto_objetivo_mxn) || 0.0, 
        Number(bolsas_objetivo) || 0,
        Number(meta_faena) || 0.0,
        Number(meta_clavis) || 0.0,
        Number(meta_cropprotection) || 0.0,
        Number(meta_cosecha) || 0.0,
        existing.id
      ]);
      res.json({ message: 'Meta updated successfully' });
    } else {
      await db.run(`
        INSERT INTO metas_ventas (
          asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo,
          meta_faena, meta_clavis, meta_cropprotection, meta_cosecha
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        asesor_id, 
        ciclo_agricola, 
        Number(monto_objetivo_mxn) || 0.0, 
        Number(bolsas_objetivo) || 0,
        Number(meta_faena) || 0.0,
        Number(meta_clavis) || 0.0,
        Number(meta_cropprotection) || 0.0,
        Number(meta_cosecha) || 0.0
      ]);
      res.status(201).json({ message: 'Meta created successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save meta' });
  }
});

// -------------------------------------------------------------
// WEEKLY PLANNING & FORECASTING ENDPOINTS
// -------------------------------------------------------------

function getLocalISODate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const localDate = new Date(d.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().slice(0, 10);
}

app.get('/api/planificacion', authenticateToken, async (req, res) => {
  const { fecha_inicio, fecha_fin, asesor_id } = req.query;
  try {
    const localToday = getLocalISODate();
    // Auto transition expired plans (realizada = 0 and in the past) to vencida (realizada = 3)
    await db.run(
      "UPDATE planificacion_semanal SET realizada = 3 WHERE realizada = 0 AND fecha_programada < ?",
      [localToday]
    );

    let query = `
      SELECT p.*, c.nombre as cliente_nombre, a.nombre as asesor_nombre
      FROM planificacion_semanal p
      JOIN clientes c ON p.cliente_id = c.id
      JOIN asesores a ON p.asesor_id = a.id
      WHERE 1=1
    `;
    const params = [];
    
    if (req.user.nivel_rol === 'Asesor') {
      query += ` AND p.asesor_id = ?`;
      params.push(req.user.id);
    } else if (asesor_id && asesor_id !== 'ALL') {
      query += ` AND p.asesor_id = ?`;
      params.push(Number(asesor_id));
    }
    
    if (fecha_inicio && fecha_fin) {
      query += ` AND p.fecha_programada BETWEEN ? AND ?`;
      params.push(fecha_inicio, fecha_fin);
    }
    
    query += ` ORDER BY p.fecha_programada ASC, c.nombre ASC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch planning' });
  }
});

app.post('/api/planificacion', authenticateToken, async (req, res) => {
  const { cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn } = req.body;
  if (!cliente_id || !fecha_programada) {
    return res.status(400).json({ error: 'cliente_id and fecha_programada are required' });
  }
  try {
    const result = await db.run(`
      INSERT INTO planificacion_semanal (asesor_id, cliente_id, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, realizada)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `, [
      req.user.id,
      cliente_id,
      fecha_programada,
      objetivo_visita || null,
      Number(pronostico_bolsas) || 0,
      Number(pronostico_monto_mxn) || 0.0
    ]);
    res.status(201).json({ id: result.id, message: 'Plan scheduled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

app.put('/api/planificacion/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { realizada, comentarios_resultado, fecha_programada, objetivo_visita, pronostico_bolsas, pronostico_monto_mxn, bitacora, cliente_id } = req.body;
  
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this plan' });
    }
    
    if (plan.realizada === 3) {
      return res.status(400).json({ error: 'No se puede modificar una planificación vencida.' });
    }
    
    let visitId = plan.visita_id;
    // Auto log CRM visit note if visit completed and bitacora note is provided
    if (Number(realizada) === 1 && bitacora && bitacora.trim().length > 0 && !plan.visita_id) {
      const now = new Date().toISOString().slice(0, 10);
      const vResult = await db.run(`
        INSERT INTO crm_visitas (fecha_visita, cliente_id, asesor_id, comentarios_bitacora)
        VALUES (?, ?, ?, ?)
      `, [now, plan.cliente_id, plan.asesor_id, bitacora.trim()]);
      visitId = vResult.id;
    }
    
    await db.run(`
      UPDATE planificacion_semanal
      SET realizada = ?,
          fecha_programada = ?,
          objetivo_visita = ?,
          pronostico_bolsas = ?,
          pronostico_monto_mxn = ?,
          visita_id = ?,
          cliente_id = ?
      WHERE id = ?
    `, [
      realizada !== undefined ? Number(realizada) : plan.realizada,
      fecha_programada || plan.fecha_programada,
      objetivo_visita !== undefined ? objetivo_visita : plan.objetivo_visita,
      pronostico_bolsas !== undefined ? Number(pronostico_bolsas) : plan.pronostico_bolsas,
      pronostico_monto_mxn !== undefined ? Number(pronostico_monto_mxn) : plan.pronostico_monto_mxn,
      visitId,
      cliente_id !== undefined ? Number(cliente_id) : plan.cliente_id,
      id
    ]);
    
    res.json({ message: 'Plan updated successfully', visita_id: visitId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

app.post('/api/planificacion/:id/convertir-cotizacion', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to convert this plan' });
    }
    
    const date = new Date();
    const prefix = `CG-${date.getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const mesShort = date.toLocaleString('es-MX', { month: 'short' }).toUpperCase().slice(0, 3);
    const now = date.toISOString().slice(0, 10);
    
    const cicloAgricola = 'O-I 2026';
    const condicionesPago = 'CONTADO';
    const estatus = 'Borrador';
    const totalMxn = plan.pronostico_monto_mxn || 0.0;
    
    const result = await db.run(`
      INSERT INTO cotizaciones (fecha_creacion, cliente_id, asesor_id, ciclo_agricola, condiciones_pago, folio_cotizacion, mes, estatus, total_mxn, anticipo_apartado, notas, financiera)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 'Creado automáticamente desde planificación semanal', NULL)
    `, [now, plan.cliente_id, plan.asesor_id, cicloAgricola, condicionesPago, prefix, mesShort, estatus, totalMxn]);
    
    const cotId = result.id;
    
    // Automatically insert default product details if forecast has bags
    if (plan.pronostico_bolsas > 0) {
      const defaultProduct = await db.get("SELECT * FROM productos WHERE tipo_categoria = 'Híbrido' AND activo = 1 ORDER BY id ASC LIMIT 1");
      if (defaultProduct) {
        const precioNeto = plan.pronostico_monto_mxn ? Math.round((plan.pronostico_monto_mxn / plan.pronostico_bolsas) * 100) / 100 : defaultProduct.list_price_mxn;
        await db.run(`
          INSERT INTO cotizacion_detalles (cotizacion_id, producto_id, temporada_id, cantidad_ordenada, cantidad_entregada, precio_lista_unitario, precio_neto_unitario, subtotal_mxn)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `, [cotId, defaultProduct.id, 1, plan.pronostico_bolsas, defaultProduct.list_price_mxn, precioNeto, plan.pronostico_monto_mxn]);
      }
    }
    
    await db.run('UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?', [id]);
    
    res.status(201).json({ id: cotId, folio: prefix, message: 'Plan successfully converted to Prospecto' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert plan' });
  }
});

app.delete('/api/planificacion/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const plan = await db.get('SELECT * FROM planificacion_semanal WHERE id = ?', [id]);
    if (!plan) return res.status(404).json({ error: 'Planning not found' });
    
    if (req.user.nivel_rol === 'Asesor' && plan.asesor_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this plan' });
    }
    
    await db.run('DELETE FROM planificacion_semanal WHERE id = ?', [id]);
    res.json({ message: 'Plan deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete plan' });
  }
});

// -------------------------------------------------------------
// PROYECCIONES REPORT ENDPOINT
// -------------------------------------------------------------

app.get('/api/dashboard/proyecciones', authenticateToken, async (req, res) => {
  const ciclo = req.query.ciclo_agricola || 'O-I 2026';
  try {
    const advisors = await db.all('SELECT id, nombre FROM asesores WHERE activo = 1');
    const results = [];
    
    for (const adv of advisors) {
      if (req.user.nivel_rol === 'Asesor' && req.user.id !== adv.id) {
        continue;
      }
      
      const meta = await db.get(
        'SELECT monto_objetivo_mxn, bolsas_objetivo FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ? AND activo = 1',
        [adv.id, ciclo]
      );
      
      const real = await db.get(`
        SELECT SUM(q.total_mxn) as total_real, SUM(d.cantidad_ordenada) as bolsas_real
        FROM cotizaciones q
        LEFT JOIN cotizacion_detalles d ON q.id = d.cotizacion_id
        WHERE q.asesor_id = ? AND q.ciclo_agricola = ? AND (q.estatus = 'Vendido' OR q.estatus = 'Entregado')
      `, [adv.id, ciclo]);
      
      const forecast = await db.get(`
        SELECT SUM(pronostico_monto_mxn) as total_forecast, SUM(pronostico_bolsas) as bolsas_forecast
        FROM planificacion_semanal
        WHERE asesor_id = ? AND realizada = 0
      `, [adv.id]);
      
      results.push({
        asesor_id: adv.id,
        asesor_nombre: adv.nombre,
        meta_mxn: meta ? meta.monto_objetivo_mxn : 0.0,
        meta_bolsas: meta ? meta.bolsas_objetivo : 0,
        real_mxn: real ? (real.total_real || 0.0) : 0.0,
        real_bolsas: real ? (real.bolsas_real || 0) : 0,
        forecast_mxn: forecast ? (forecast.total_forecast || 0.0) : 0.0,
        forecast_bolsas: forecast ? (forecast.bolsas_forecast || 0) : 0
      });
    }
    
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch proyecciones' });
  }
});

// -------------------------------------------------------------
// NOTIFICATIONS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/notificaciones', authenticateToken, async (req, res) => {
  try {
    const query = 'SELECT * FROM crm_notificaciones WHERE asesor_id = ? ORDER BY creado_en DESC LIMIT 20';
    const rows = await db.all(query, [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// =============================================================
// AI AGENTS MANAGEMENT ENDPOINTS
// =============================================================

// Middleware to authorize Admin or Coordinator
function authorizeAgentAdmin(req, res, next) {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Acceso denegado: Se requiere rol Administrador o Coordinador' });
  }
  next();
}

app.get('/api/agentes/config', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const rows = await db.all('SELECT agente_id, nombre, activo, configuracion, ultima_ejecucion FROM crm_agentes_config');
    // Fetch global config if exists to check API key
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    const globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    
    const provider = globalConfig.provider || 'gemini';
    const hasGeminiKey = !!(globalConfig.gemini_api_key || process.env.GEMINI_API_KEY);
    const hasOpenRouterKey = !!(globalConfig.openrouter_api_key || process.env.OPENROUTER_API_KEY);
    const openrouterModel = globalConfig.openrouter_model || 'google/gemini-2.5-flash';
    
    // Mask API keys
    let maskedGeminiKey = '';
    if (globalConfig.gemini_api_key) {
      maskedGeminiKey = globalConfig.gemini_api_key.substring(0, 8) + '...';
    } else if (process.env.GEMINI_API_KEY) {
      maskedGeminiKey = process.env.GEMINI_API_KEY.substring(0, 8) + '...';
    }

    let maskedOpenRouterKey = '';
    if (globalConfig.openrouter_api_key) {
      maskedOpenRouterKey = globalConfig.openrouter_api_key.substring(0, 8) + '...';
    } else if (process.env.OPENROUTER_API_KEY) {
      maskedOpenRouterKey = process.env.OPENROUTER_API_KEY.substring(0, 8) + '...';
    }

    res.json({
      configs: rows.filter(r => r.agente_id !== 'global'),
      provider,
      hasGeminiKey,
      maskedGeminiKey,
      hasOpenRouterKey,
      maskedOpenRouterKey,
      openrouterModel
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuraciones' });
  }
});

app.post('/api/agentes/config', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { configs, provider, gemini_api_key, openrouter_api_key, openrouter_model } = req.body;
  try {
    // 1. Fetch current global config
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    let globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    
    if (provider) globalConfig.provider = provider;
    
    // Update keys if provided and not masked placeholder
    if (gemini_api_key !== undefined) {
      const val = gemini_api_key.trim();
      if (val && !val.includes('...')) {
        globalConfig.gemini_api_key = val;
        process.env.GEMINI_API_KEY = val;
      }
    }
    
    if (openrouter_api_key !== undefined) {
      const val = openrouter_api_key.trim();
      if (val && !val.includes('...')) {
        globalConfig.openrouter_api_key = val;
        process.env.OPENROUTER_API_KEY = val;
      }
    }
    
    if (openrouter_model !== undefined) {
      globalConfig.openrouter_model = openrouter_model.trim();
    }

    // Save global settings
    if (globalRow) {
      await db.run(
        "UPDATE crm_agentes_config SET configuracion = ? WHERE agente_id = 'global'",
        [JSON.stringify(globalConfig)]
      );
    } else {
      await db.run(
        "INSERT INTO crm_agentes_config (agente_id, nombre, activo, configuracion) VALUES ('global', 'Global Config', 1, ?)",
        [JSON.stringify(globalConfig)]
      );
    }

    // 2. Update agent active status and customized settings
    if (configs && Array.isArray(configs)) {
      for (const c of configs) {
        await db.run(
          'UPDATE crm_agentes_config SET activo = ?, configuracion = ? WHERE agente_id = ?',
          [c.activo ? 1 : 0, typeof c.configuracion === 'object' ? JSON.stringify(c.configuracion) : c.configuracion, c.agente_id]
        );
      }
    }

    res.json({ success: true, message: 'Configuraciones actualizadas' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar configuraciones' });
  }
});

app.post('/api/agentes/ejecutar', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { agente_id, ciclo_id } = req.body;
  try {
    const globalRow = await db.get("SELECT configuracion FROM crm_agentes_config WHERE agente_id = 'global'");
    const globalConfig = JSON.parse(globalRow?.configuracion || '{}');
    const provider = globalConfig.provider || 'gemini';
    let apiKey = '';

    if (provider === 'openrouter') {
      apiKey = globalConfig.openrouter_api_key || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'OPENROUTER_API_KEY no configurada. Configure su API Key antes de ejecutar los agentes.' });
      }
    } else {
      apiKey = globalConfig.gemini_api_key || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'GEMINI_API_KEY no configurada. Configure su API Key antes de ejecutar los agentes.' });
      }
    }

    const result = await agentsService.executeAgent(agente_id, apiKey, ciclo_id);
    res.json({ success: true, result });
  } catch (err) {
    console.error(`Error executing agent manually: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agentes/logs', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const logs = await db.all('SELECT * FROM crm_agentes_logs ORDER BY creado_en DESC LIMIT 50');
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar logs' });
  }
});

app.get('/api/agentes/ceo/propuesta', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    const proposal = await db.get('SELECT * FROM crm_ceo_propuestas WHERE estatus = \'Pendiente\' ORDER BY creado_en DESC LIMIT 1');
    res.json(proposal || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar propuesta de metas' });
  }
});

app.post('/api/agentes/ceo/aplicar', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  const { propuesta_id } = req.body;
  try {
    const proposal = await db.get('SELECT * FROM crm_ceo_propuestas WHERE id = ?', [propuesta_id]);
    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    const goals = JSON.parse(proposal.propuesta_json);
    const today = new Date();
    let ciclo = `PV ${today.getFullYear()}`;
    if (proposal.ciclo_id) {
      const dbCiclo = await db.get('SELECT nombre FROM ciclos WHERE id = ?', [proposal.ciclo_id]);
      if (dbCiclo) {
        ciclo = dbCiclo.nombre;
      }
    }

    for (const g of goals) {
      // Check if advisor has meta for this cycle
      const existing = await db.get('SELECT id FROM metas_ventas WHERE asesor_id = ? AND ciclo_agricola = ?', [g.asesor_id, ciclo]);
      
      if (existing) {
        await db.run(
          `UPDATE metas_ventas SET 
            monto_objetivo_mxn = ?, 
            bolsas_objetivo = ?, 
            meta_faena = ?, 
            meta_clavis = ?, 
            meta_cropprotection = ?, 
            meta_cosecha = ?,
            activo = 1
           WHERE id = ?`,
          [g.monto_objetivo_mxn, g.bolsas_objetivo, g.meta_faena, g.meta_clavis, g.meta_cropprotection, g.meta_cosecha, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO metas_ventas (
            asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo,
            meta_faena, meta_clavis, meta_cropprotection, meta_cosecha, activo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [g.asesor_id, ciclo, g.monto_objetivo_mxn, g.bolsas_objetivo, g.meta_faena, g.meta_clavis, g.meta_cropprotection, g.meta_cosecha]
        );
      }
    }

    await db.run('UPDATE crm_ceo_propuestas SET estatus = \'Aplicada\' WHERE id = ?', [propuesta_id]);
    
    // Log success
    await db.run(
      'INSERT INTO crm_agentes_logs (agente_id, tipo_evento, mensaje) VALUES (?, ?, ?)',
      ['ceo', 'info', `Propuesta de metas (ID ${propuesta_id}) aprobada y aplicada con éxito para el ciclo ${ciclo}`]
    );

    res.json({ success: true, message: 'Metas propuestas aplicadas con éxito.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aplicar las metas de ventas' });
  }
});

app.get('/api/agentes/coordinador/seguimientos', authenticateToken, authorizeAgentAdmin, async (req, res) => {
  try {
    // Read last coordinator run logs that succeeded
    const log = await db.get("SELECT detalle, creado_en FROM crm_agentes_logs WHERE agente_id = 'coordinador' AND tipo_evento = 'success' ORDER BY creado_en DESC LIMIT 1");
    if (!log) {
      return res.json([]);
    }
    const followUps = JSON.parse(log.detalle || '[]');
    res.json({
      creado_en: log.creado_en,
      followUps
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los seguimientos' });
  }
});

// -------------------------------------------------------------
// PROGRAMACIÓN (ETAPAS & PRECIOS MENSUALES) ENDPOINTS
// -------------------------------------------------------------

app.get('/api/programacion/etapas', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM crm_etapas_programacion ORDER BY fecha_inicio ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stages' });
  }
});

app.post('/api/programacion/etapas', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Admin or Coordinator privileges required' });
  }
  const { id, clave, nombre, fecha_inicio, fecha_fin, color } = req.body;
  if (!clave || !nombre || !fecha_inicio || !fecha_fin || !color) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    if (id) {
      await db.run(
        'UPDATE crm_etapas_programacion SET clave = ?, nombre = ?, fecha_inicio = ?, fecha_fin = ?, color = ? WHERE id = ?',
        [clave.trim(), nombre.trim(), fecha_inicio, fecha_fin, color, id]
      );
      res.json({ success: true, message: 'Stage updated successfully' });
    } else {
      const existing = await db.get('SELECT id FROM crm_etapas_programacion WHERE clave = ?', [clave.trim()]);
      if (existing) {
        return res.status(400).json({ error: 'A stage with this key already exists' });
      }
      await db.run(
        'INSERT INTO crm_etapas_programacion (clave, nombre, fecha_inicio, fecha_fin, color) VALUES (?, ?, ?, ?, ?)',
        [clave.trim(), nombre.trim(), fecha_inicio, fecha_fin, color]
      );
      res.status(201).json({ success: true, message: 'Stage created successfully' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save stage' });
  }
});

app.delete('/api/programacion/etapas/:id', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Admin or Coordinator privileges required' });
  }
  const { id } = req.params;
  try {
    await db.run('DELETE FROM crm_etapas_programacion WHERE id = ?', [id]);
    res.json({ success: true, message: 'Stage deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete stage' });
  }
});

app.get('/api/programacion/precios', authenticateToken, async (req, res) => {
  const { producto_id } = req.query;
  if (!producto_id) {
    return res.status(400).json({ error: 'producto_id is required' });
  }
  try {
    const prod = await db.get('SELECT list_price_mxn FROM productos WHERE id = ?', [producto_id]);
    if (!prod) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const listPrice = prod.list_price_mxn;

    const rows = await db.all(
      'SELECT * FROM crm_precios_mensuales WHERE producto_id = ? ORDER BY mes ASC',
      [producto_id]
    );

    const prices = [];
    for (let m = 1; m <= 12; m++) {
      const existing = rows.find(r => r.mes === m);
      if (existing) {
        prices.push(existing);
      } else {
        prices.push({
          producto_id: parseInt(producto_id),
          mes: m,
          precio: listPrice,
          promo_dinero: 0.0,
          promo_porcentaje: 0.0
        });
      }
    }
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch monthly pricing' });
  }
});

app.post('/api/programacion/precios', authenticateToken, async (req, res) => {
  if (req.user.nivel_rol !== 'Administrador' && req.user.nivel_rol !== 'Coordinador') {
    return res.status(403).json({ error: 'Admin or Coordinator privileges required' });
  }
  const { producto_id, precios } = req.body;
  if (!producto_id || !Array.isArray(precios) || precios.length !== 12) {
    return res.status(400).json({ error: 'producto_id and an array of 12 months of prices are required' });
  }
  try {
    for (const row of precios) {
      const { mes, precio, promo_dinero, promo_porcentaje } = row;
      if (mes < 1 || mes > 12) continue;
      await db.run(
        `INSERT INTO crm_precios_mensuales (producto_id, mes, precio, promo_dinero, promo_porcentaje)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (producto_id, mes)
         DO UPDATE SET precio = EXCLUDED.precio, promo_dinero = EXCLUDED.promo_dinero, promo_porcentaje = EXCLUDED.promo_porcentaje`,
        [producto_id, mes, precio || 0.0, promo_dinero || 0.0, promo_porcentaje || 0.0]
      );
    }
    res.json({ success: true, message: 'Monthly pricing saved successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save monthly pricing' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Casas Grandes Sales Management Server running on port ${PORT}`);
  // Initialize agents background scheduler
  agentsService.startBackgroundScheduler();
});
