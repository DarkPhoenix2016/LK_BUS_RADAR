// @ts-nocheck
const mongoose = require('mongoose');

const RouteStopSchema = new mongoose.Schema(
  {
    routeId: { type: String, required: true, index: true },
    stopId: { type: String, required: true, index: true },
    direction: { type: String, enum: ['UP', 'DOWN'], required: true },
    displayOrder: { type: Number, required: true },
    adminModified: { type: Map, of: Boolean, default: {} },
  },
  { versionKey: false, timestamps: true }
);

RouteStopSchema.index({ routeId: 1, stopId: 1, direction: 1 }, { unique: true });

module.exports = mongoose.models.RouteStop || mongoose.model('RouteStop', RouteStopSchema);
