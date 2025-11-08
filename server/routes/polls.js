const express = require('express');
const { Poll } = require('../models/Poll');
const { requireAuth } = require('../middleware/auth');
const { getIO } = require('../realtime/io');

const router = express.Router();

// Create a new poll (auth required)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { question, options } = req.body || {};
    if (!question || !Array.isArray(options)) {
      return res.status(400).json({ message: 'Thiếu dữ liệu' });
    }
    const texts = options.map(o => (typeof o === 'string' ? o.trim() : '')).filter(Boolean);
    if (texts.length < 2) {
      return res.status(400).json({ message: 'Cần ít nhất 2 lựa chọn' });
    }

    const poll = await Poll.create({
      question: String(question).trim(),
      options: texts.map(t => ({ text: t, votes: 0 })),
      likesCount: 0,
      userId: req.user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ballots: [],
    });
    try {
      const io = getIO();
      if (io) {
        const obj = poll.toObject();
        delete obj.ballots;
        io.emit('polls:new', obj);
      }
    } catch (_) {}
    return res.status(201).json(poll);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Get my polls (auth required)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const polls = await Poll.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(polls);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Explore polls (public, last 7 days by expiresAt)
router.get('/explore', async (req, res) => {
  try {
    const now = new Date();
    const after = req.query.after ? Number(req.query.after) : null;
    const cond = { expiresAt: { $gt: now } };
    if (after != null && !Number.isNaN(after)) {
      cond.serverSeq = { $gt: after };
    }
    let query = Poll.find(cond);
    if (after != null && !Number.isNaN(after)) {
      query = query.sort({ serverSeq: 1 });
    } else {
      query = query.sort({ createdAt: -1 }).limit(20);
    }
    const polls = await query;

    // Attempt to enrich with isMine/hasVoted if Authorization header exists
    const header = req.headers['authorization'] || '';
    let uid = null;
    try {
      const parts = header.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(parts[1], process.env.JWT_SECRET);
        uid = payload?.uid || null;
      }
    } catch (_) {}

    const result = polls.map((p) => {
      const obj = p.toObject();
      if (uid) {
        obj.isMine = String(p.userId) === String(uid);
        obj.hasVoted = Array.isArray(p.ballots) && p.ballots.some(b => String(b.userId) === String(uid));
      } else {
        obj.isMine = false;
        obj.hasVoted = false;
      }
      delete obj.ballots; // do not expose ballots list
      return obj;
    });

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Vote once per poll (auth required)
router.post('/:id/vote', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { optionIndex } = req.body || {};
    if (typeof optionIndex !== 'number') {
      return res.status(400).json({ message: 'Thiếu lựa chọn' });
    }
    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ message: 'Không tìm thấy poll' });
    if (poll.userId && String(poll.userId) === String(req.user.id)) {
      return res.status(400).json({ message: 'Không thể tương tác với poll của bạn' });
    }
    if (new Date() > new Date(poll.expiresAt)) {
      return res.status(400).json({ message: 'Poll đã hết hạn' });
    }
    if (Array.isArray(poll.ballots) && poll.ballots.some(b => String(b.userId) === String(req.user.id))) {
      return res.status(400).json({ message: 'Bạn đã bình chọn poll này' });
    }
    if (!poll.options[optionIndex]) {
      return res.status(400).json({ message: 'Lựa chọn không hợp lệ' });
    }
    poll.options[optionIndex].votes = (poll.options[optionIndex].votes || 0) + 1;
    poll.ballots = poll.ballots || [];
    poll.ballots.push({ userId: req.user.id, optionIndex });
    await poll.save();
    // Broadcast real-time update without sensitive fields
    try {
      const io = getIO && getIO();
      if (io) {
        const obj = poll.toObject();
        delete obj.ballots;
        io.emit('polls:update', obj);
      }
    } catch (_) {}
    return res.json({ message: 'Đã ghi nhận bình chọn', poll });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Save/unsave poll to user storage (auth required)
router.post('/:id/save', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ message: 'Không tìm thấy poll' });
    if (String(poll.userId) === String(req.user.id)) {
      return res.status(400).json({ message: 'Không thể lưu poll của bạn' });
    }
    const { User } = require('../models/User');
    const user = await User.findById(req.user.id).select('savedPolls');
    if (!user.savedPolls) user.savedPolls = [];
    if (user.savedPolls.some(pid => String(pid) === String(id))) {
      return res.json({ saved: true });
    }
    user.savedPolls.push(id);
    await user.save();
    poll.likesCount = (poll.likesCount || 0) + 1;
    await poll.save();
    return res.json({ saved: true, likesCount: poll.likesCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

router.delete('/:id/save', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const poll = await Poll.findById(id);
    if (!poll) return res.status(404).json({ message: 'Không tìm thấy poll' });
    const { User } = require('../models/User');
    const user = await User.findById(req.user.id).select('savedPolls');
    const before = user.savedPolls?.length || 0;
    user.savedPolls = (user.savedPolls || []).filter(pid => String(pid) !== String(id));
    await user.save();
    if ((poll.likesCount || 0) > 0 && before !== user.savedPolls.length) {
      poll.likesCount -= 1;
      await poll.save();
    }
    return res.json({ saved: false, likesCount: poll.likesCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

// Get saved polls for current user
router.get('/saved', requireAuth, async (req, res) => {
  try {
    const { User } = require('../models/User');
    const user = await User.findById(req.user.id).select('savedPolls');
    const ids = user.savedPolls || [];
    const polls = await Poll.find({ _id: { $in: ids } }).sort({ createdAt: -1 });
    const now = new Date();
    const result = polls.map(p => {
      const obj = p.toObject();
      obj.expired = now > new Date(p.expiresAt);
      const myBallot = (p.ballots || []).find(b => String(b.userId) === String(req.user.id));
      obj.myOptionIndex = myBallot ? myBallot.optionIndex : null;
      delete obj.ballots;
      return obj;
    });
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Lỗi máy chủ' });
  }
});

module.exports = router;
