const jwt = require('jsonwebtoken');
const { User } = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = parts[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.uid).select('sessionsVersion');
    if (!user || user.sessionsVersion !== payload.v) {
      return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ' });
    }
    req.user = { id: payload.uid, v: payload.v };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = { requireAuth };

