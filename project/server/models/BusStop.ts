// @ts-nocheck
const mongoose = require('mongoose');

const BusStopSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: String,
    latitude: Number,
    longitude: Number,
    type: String,
    geoFenceRadius: Number,
    adminModified: { type: Map, of: Boolean, default: {} },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.BusStop || mongoose.model('BusStop', BusStopSchema);
