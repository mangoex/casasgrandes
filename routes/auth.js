const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
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
      { expiresIn: JWT_EXPIRES_IN }
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

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
