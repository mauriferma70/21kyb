// server/middleware/auth.js
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminLoggedIn) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado. Iniciá sesión en /admin.' });
}

module.exports = { requireAdmin };
