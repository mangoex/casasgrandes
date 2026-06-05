const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

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
    let query = 'SELECT id, nombre, usuario, nivel_rol, email, telefono, activo, cumpleanos FROM asesores';
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
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, password } = req.body;
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
    const result = await db.run(`
      INSERT INTO asesores (nombre, usuario, nivel_rol, email, telefono, cumpleanos, password_hash, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, password_hash]);
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
  const { nombre, usuario, nivel_rol, email, telefono, cumpleanos, activo, password } = req.body;
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

    await db.run(`
      UPDATE asesores
      SET nombre = ?, usuario = ?, nivel_rol = ?, email = ?, telefono = ?, cumpleanos = ?, password_hash = ?, activo = ?
      WHERE id = ?
    `, [nombre.trim(), usuario.trim(), nivel_rol, email.trim(), telefono || null, cumpleanos || null, passwordHash, activeVal, id]);
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
    res.json({ message: 'Advisor deactivated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to deactivate advisor' });
  }
});

// -------------------------------------------------------------
// QUOTING & CALCULATING ENGINE
// -------------------------------------------------------------

function getVolumeMultiplier(qty) {
  if (qty < 40) return 1.00;
  if (qty < 60) return 0.95;
  if (qty < 80) return 0.90;
  if (qty < 90) return 0.85;
  return 0.80;
}

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
      
      const subtotal = netPrice * item.cantidad;
      grandTotal += subtotal;
      
      calculatedItems.append = calculatedItems.push({
        producto_id: prod.id,
        producto_nombre: prod.producto,
        tipo_categoria: prod.tipo_categoria,
        cantidad: item.cantidad,
        precio_lista: listPrice,
        precio_temporada: seasonPrice,
        precio_neto: netPrice,
        subtotal
      });
    }
    
    res.json({
      cliente_nombre: client.nombre,
      cuenta_clave_nombre: keyAccount ? keyAccount.tier_name : 'General',
      temporada_nombre: activeSeason ? activeSeason.actividad : 'Precio Lleno',
      vol_multiplier,
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
    let clientsSql = 'SELECT count(*) as count FROM clientes WHERE activo = 1';
    let quotesSql = "SELECT count(*) as count FROM cotizaciones WHERE estatus = 'Borrador' OR estatus = 'Autorizada'";
    let salesSql = "SELECT sum(total_mxn) as total FROM cotizaciones WHERE estatus = 'Vendido'";
    const params = [];

    if (req.user.nivel_rol === 'Asesor') {
      clientsSql += ' AND asesor_id = ?';
      quotesSql += ' AND asesor_id = ?';
      salesSql += ' AND asesor_id = ?';
      params.push(req.user.id);
    }

    const clientsCount = await db.get(clientsSql, params);
    const quotesCount = await db.get(quotesSql, params);
    const salesTotal = await db.get(salesSql, params);
    
    // Visits by adviser
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
      total_clients: clientsCount ? clientsCount.count : 0,
      active_quotes: quotesCount ? quotesCount.count : 0,
      total_sales_mxn: salesTotal ? salesTotal.total : 0.0,
      advisers_visits: visits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
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
  const { asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo } = req.body;
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
        SET monto_objetivo_mxn = ?, bolsas_objetivo = ?
        WHERE id = ?
      `, [Number(monto_objetivo_mxn) || 0.0, Number(bolsas_objetivo) || 0, existing.id]);
      res.json({ message: 'Meta updated successfully' });
    } else {
      await db.run(`
        INSERT INTO metas_ventas (asesor_id, ciclo_agricola, monto_objetivo_mxn, bolsas_objetivo)
        VALUES (?, ?, ?, ?)
      `, [asesor_id, ciclo_agricola, Number(monto_objetivo_mxn) || 0.0, Number(bolsas_objetivo) || 0]);
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
    
    await db.run('UPDATE planificacion_semanal SET realizada = 1 WHERE id = ?', [id]);
    
    res.status(201).json({ id: result.id, folio: prefix, message: 'Plan successfully converted to Prospecto' });
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

// Start Server
app.listen(PORT, () => {
  console.log(`Casas Grandes Sales Management Server running on port ${PORT}`);
});
