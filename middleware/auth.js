const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'casas_grandes_jwt_secret_key_2026_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

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

function requireAdmin(req, res, next) {
  if (!req.user || req.user.nivel_rol !== 'Administrador') {
    return res.status(403).json({ error: 'Permisos de Administrador requeridos' });
  }
  next();
}

function requireAdminOrCoordinador(req, res, next) {
  if (!req.user || !['Administrador', 'Coordinador'].includes(req.user.nivel_rol)) {
    return res.status(403).json({ error: 'Permisos de Administrador o Coordinador requeridos' });
  }
  next();
}

function requireProgramacionManager(req, res, next) {
  return requireAdminOrCoordinador(req, res, next);
}

function requireWarehouseOperator(req, res, next) {
  const allowed = ['Administrador', 'Coordinador', 'Almacen', 'Director'];
  if (!req.user || !allowed.includes(req.user.nivel_rol)) {
    return res.status(403).json({ error: 'Permisos insuficientes para operar almacén.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireAdminOrCoordinador,
  requireProgramacionManager,
  requireWarehouseOperator,
  JWT_SECRET,
  JWT_EXPIRES_IN
};


