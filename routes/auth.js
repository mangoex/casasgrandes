const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const {
  buildSessionCookieOptions,
  SESSION_COOKIE_NAME
} = require('../utils/security');
const {
  createFixedWindowStore,
  createRateLimitMiddleware,
  hashRateLimitKey
} = require('../utils/rateLimiter');

const router = express.Router();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginIpStore = createFixedWindowStore({
  windowMs: LOGIN_WINDOW_MS,
  maxAttempts: 50,
  maxEntries: 10_000
});
const loginAccountStore = createFixedWindowStore({
  windowMs: LOGIN_WINDOW_MS,
  maxAttempts: 10,
  maxEntries: 10_000
});
const rateLimitMessage = 'Demasiados intentos de acceso. Intenta nuevamente más tarde.';
const loginIpLimiter = createRateLimitMiddleware({
  store: loginIpStore,
  keyGenerator: req => hashRateLimitKey(`ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`),
  message: rateLimitMessage
});
const loginAccountLimiter = createRateLimitMiddleware({
  store: loginAccountStore,
  keyGenerator: req => hashRateLimitKey(`account:${req.body?.usernameOrEmail || req.body?.email || 'missing'}`),
  message: rateLimitMessage
});

// POST /api/auth/login
router.post('/login', loginIpLimiter, loginAccountLimiter, async (req, res) => {
  const { email, usernameOrEmail, password } = req.body;
  const identifier = usernameOrEmail || email;
  if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier || !password) {
    return res.status(400).json({ error: 'Email/Username and password are required' });
  }
  if (identifier.length > 254 || password.length > 256) {
    return res.status(400).json({ error: 'Invalid email/username or password' });
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
      {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        nivel_rol: user.nivel_rol,
        email: user.email,
        session_version: Number(user.session_version || 1)
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    const responseBody = {
      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        nivel_rol: user.nivel_rol,
        email: user.email,
        telefono: user.telefono
      }
    };
    if (req.get('x-auth-mode') === 'bearer') {
      responseBody.token = token;
    } else {
      res.cookie(SESSION_COOKIE_NAME, token, buildSessionCookieOptions());
    }
    res.json(responseBody);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, async (req, res) => {
  const options = buildSessionCookieOptions();
  await db.run(
    'UPDATE asesores SET session_version = session_version + 1 WHERE id = ?',
    [req.user.id]
  );
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path
  });
  res.status(204).end();
});

module.exports = router;
