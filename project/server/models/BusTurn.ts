// @ts-nocheck
const mongoose = require('mongoose');

const BusTurnSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    runningSlotId: { type: String, required: true, index: true },
    deviceId: { type: String, index: true },
    busTurnStatus: String,
    loadingStartingTime: String,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.BusTurn || mongoose.model('BusTurn', BusTurnSchema);
