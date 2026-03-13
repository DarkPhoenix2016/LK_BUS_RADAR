// @ts-nocheck
const mongoose = require('mongoose');

const OwnerSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // UUID v7
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    nic: { type: String },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Owner || mongoose.model('Owner', OwnerSchema);
