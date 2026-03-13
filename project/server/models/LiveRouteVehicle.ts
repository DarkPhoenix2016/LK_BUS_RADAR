// @ts-nocheck
const mongoose = require('mongoose');

const LiveRouteVehicleSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, index: true },
    deviceId: { type: String, required: true, index: true },
    busNumber: String,
    lat: Number,
    lon: Number,
    timestamp: Date,
  },
  { versionKey: false, timestamps: true }
);

LiveRouteVehicleSchema.index({ routeId: 1, deviceId: 1 }, { unique: true });
LiveRouteVehicleSchema.index({ routeId: 1, timestamp: -1 });

module.exports =
  mongoose.models.LiveRouteVehicle || mongoose.model('LiveRouteVehicle', LiveRouteVehicleSchema);
