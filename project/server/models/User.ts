// @ts-nocheck
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // Firebase UID
    email: { type: String },
    linkedEmail: { type: String },
    displayName: { type: String },
    phoneNumber: { type: String },
    nic: { type: String },
    phone: { type: String },
    photoURL: { type: String },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    pointBalance: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ linkedEmail: 1 });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
