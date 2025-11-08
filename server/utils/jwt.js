const jwt = require('jsonwebtoken');

function signJwt(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET');
  return jwt.sign({ uid: user._id.toString(), v: user.sessionsVersion }, secret, {
    expiresIn: '7d',
  });
}

module.exports = { signJwt };

