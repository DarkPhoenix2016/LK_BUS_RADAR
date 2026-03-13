// @ts-nocheck
const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    imei: String,
    simNumber: String,
    busId: { type: String, index: true },
    isActive: Boolean,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Device || mongoose.model('Device', DeviceSchema);
