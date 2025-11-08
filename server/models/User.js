const mongoose = require('mongoose');

const ResetPasswordSchema = new mongoose.Schema(
  {
    tokenHash: { type: String },
    expiresAt: { type: Date },
    usedAt: { type: Date },
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, index: true, required: true },
    passwordHash: { type: String, required: true },
    sessionsVersion: { type: Number, default: 0 },
    resetPassword: { type: ResetPasswordSchema, default: undefined },
    savedPolls: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Poll' }],
  },
  { timestamps: true }
);

const User = mongoose.model('User', UserSchema);

module.exports = { User };
