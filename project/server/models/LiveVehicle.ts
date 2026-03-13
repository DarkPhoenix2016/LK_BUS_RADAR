// @ts-nocheck
const mongoose = require('mongoose');

const LiveVehicleSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    busId: { type: String, index: true },
    routeId: { type: String, index: true },
    lat: Number,
    lon: Number,
    speed: Number,
    heading: Number,
    timestamp: Date,
    isOnline: Boolean,
  },
  { versionKey: false, timestamps: true }
);

LiveVehicleSchema.index({ routeId: 1, timestamp: -1 });

module.exports = mongoose.models.LiveVehicle || mongoose.model('LiveVehicle', LiveVehicleSchema);
