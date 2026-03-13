// @ts-nocheck
const mongoose = require('mongoose');

const RunningNumberSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    runningNumber: String,
    busType: String,
    adminModified: { type: Map, of: Boolean, default: {} },
  },
  { versionKey: false, timestamps: true }
);

module.exports =
  mongoose.models.RunningNumber || mongoose.model('RunningNumber', RunningNumberSchema);
