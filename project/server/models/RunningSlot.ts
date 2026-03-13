// @ts-nocheck
const mongoose = require('mongoose');

const RunningSlotSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    routeId: { type: String, required: true, index: true },
    runningNumberId: { type: String, required: true, index: true },
    busId: { type: String, default: null, index: true },
    direction: String,
    adminModified: { type: Map, of: Boolean, default: {} },
    maxBookableSeats: { type: Number, default: 10 },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.RunningSlot || mongoose.model('RunningSlot', RunningSlotSchema);
