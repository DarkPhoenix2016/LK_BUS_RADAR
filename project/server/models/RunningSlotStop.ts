// @ts-nocheck
const mongoose = require('mongoose');

const RunningSlotStopSchema = new mongoose.Schema(
  {
    slotId: { type: String, required: true, index: true },
    stopId: { type: String, required: true, index: true },
    weekdayTime: String,
    weekendTime: String,
    adminModified: { type: Map, of: Boolean, default: {} },
  },
  { versionKey: false, timestamps: true }
);

RunningSlotStopSchema.index({ slotId: 1, stopId: 1 }, { unique: true });

module.exports =
  mongoose.models.RunningSlotStop || mongoose.model('RunningSlotStop', RunningSlotStopSchema);
