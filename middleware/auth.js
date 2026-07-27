const jwt = require('jsonwebtoken');
const db = require('../db');
const { parseCookies, SESSION_COOKIE_NAME } = require('../utils/security');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  const token = bearerToken || cookieToken;
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  if (req.user && req.authenticatedToken === token) return next();

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  try {
    const currentUser = await db.get(
      `SELECT id, nombre, usuario, nivel_rol, email, telefono, activo, session_version
       FROM asesores
       WHERE id = ?`,
      [claims.id]
    );
    const currentVersion = Number(currentUser?.session_version);
    const tokenVersion = Number(claims.session_version);
    if (!currentUser || Number(currentUser.activo) !== 1 || !Number.isInteger(tokenVersion) || tokenVersion !== currentVersion) {
      return res.status(403).json({ error: 'Session revoked' });
    }
    req.user = {
      id: currentUser.id,
      nombre: currentUser.nombre,
      usuario: currentUser.usuario,
      nivel_rol: currentUser.nivel_rol,
      email: currentUser.email,
      telefono: currentUser.telefono
    };
    req.authenticatedToken = token;
    next();
  } catch (error) {
    console.error('Authentication state validation failed:', error.message);
    return res.status(503).json({ error: 'Authentication service unavailable' });
  }
}

function requireProgramacionManager(req, res, next) {
  if (!['Administrador', 'Coordinador'].includes(req.user.nivel_rol)) {
    return res.status(403).json({ error: 'Programación requiere permisos de Administrador o Coordinador' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireProgramacionManager,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
