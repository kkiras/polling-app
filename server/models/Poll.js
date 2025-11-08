const mongoose = require('mongoose');
const Counter = require('./Counter');

const OptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    votes: { type: Number, default: 0 },
  },
  { _id: false }
);

const BallotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    optionIndex: { type: Number, required: true },
  },
  { _id: false }
);

const PollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [OptionSchema], validate: v => Array.isArray(v) && v.length >= 2 },
    likesCount: { type: Number, default: 0 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    ballots: { type: [BallotSchema], default: [] },
    serverSeq: { type: Number, index: true },
  },
  { timestamps: true }
);

PollSchema.index({ createdAt: -1 });

PollSchema.pre('save', async function (next) {
  if (this.serverSeq != null) return next();
  try {
    const c = await Counter.findByIdAndUpdate(
      'poll_serverSeq',
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.serverSeq = c.seq;
    next();
  } catch (err) {
    next(err);
  }
});

const Poll = mongoose.model('Poll', PollSchema);

module.exports = { Poll };
