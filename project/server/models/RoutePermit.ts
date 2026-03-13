// @ts-nocheck
const mongoose = require('mongoose');

const RoutePermitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    permitNumber: String,
    routeId: { type: String, index: true },
    ownerId: String,
    routePermitType: String,
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.RoutePermit || mongoose.model('RoutePermit', RoutePermitSchema);
