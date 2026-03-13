// @ts-nocheck
const mongoose = require('mongoose');

const BusSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    busNumber: String,
    routePermitId: { type: String, index: true },
    seatingCapacity: Number,
    driverContact: String,
    conductorContact: String,
    totalDistance: Number,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Bus || mongoose.model('Bus', BusSchema);
