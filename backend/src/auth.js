const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const sign = (user) => jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });

function requireAuth(...roles) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    try {
      req.user = jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Login required' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    next();
  };
}

module.exports = { sign, requireAuth };
