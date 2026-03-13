// @ts-nocheck
const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    routeNumber: String,
    startingBusStop: String,
    endingBusStop: String,
    routeDistance: Number,
    isActive: { type: Boolean, default: true },
    priceFullJourney: Number,
    averageCompletionTime: Number, // stored in minutes
    adminModified: { type: Map, of: Boolean, default: {} },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Route || mongoose.model('Route', RouteSchema);
