const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');

const { User } = require('../models/User');
const { sendResetEmail } = require('../utils/email');
const { signJwt } = require('../utils/jwt');
const { forgotPasswordLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Thiếu email hoặc mật khẩu' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email đã được sử dụng' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    return res.json({ message: 'Đăng ký thành công', uid: user._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Thiếu email hoặc mật khẩu' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });

    const token = signJwt(user);
    return res.json({ token, uid: user._id, email: user.email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// POST /auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const emailSchema = z.object({ email: z.string().email() });
    const parse = emailSchema.safeParse(req.body || {});
    const SAFE_RESPONSE = { message: 'Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.' };
    if (!parse.success) return res.json(SAFE_RESPONSE);

    const { email } = parse.data;
    const user = await User.findOne({ email });
    if (!user) return res.json(SAFE_RESPONSE);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.resetPassword = { tokenHash, expiresAt, usedAt: null, attempts: 0 };
    await user.save();

    const base = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
    const resetUrl = `${base}/reset-password?uid=${user._id}&token=${token}`;
    try {
      await sendResetEmail(user.email, resetUrl);
    } catch (mailErr) {
      console.warn('Send mail failed:', mailErr?.message);
    }

    return res.json(SAFE_RESPONSE);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { uid, token, newPassword } = req.body || {};
    if (!uid || !token || !newPassword) return res.status(400).json({ message: 'Thiếu dữ liệu' });

    const user = await User.findById(uid);
    if (!user || !user.resetPassword?.tokenHash) {
      return res.status(400).json({ message: 'Token không hợp lệ' });
    }

    if (user.resetPassword.usedAt) {
      return res.status(400).json({ message: 'Token đã được sử dụng' });
    }
    if (new Date() > new Date(user.resetPassword.expiresAt)) {
      return res.status(400).json({ message: 'Token đã hết hạn' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== user.resetPassword.tokenHash) {
      user.resetPassword.attempts = (user.resetPassword.attempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: 'Token không hợp lệ' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    user.resetPassword.usedAt = new Date();
    user.sessionsVersion += 1;
    await user.save();

    return res.json({ message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

module.exports = router;

