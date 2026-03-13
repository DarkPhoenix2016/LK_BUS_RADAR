// @ts-nocheck
const mongoose = require('mongoose');

const BusStandContactSchema = new mongoose.Schema(
  {
    location: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true, uppercase: true },
    phoneNumber: { type: String, required: true, trim: true },
  },
  { versionKey: false, timestamps: true }
);

BusStandContactSchema.index({ district: 1 });
BusStandContactSchema.index({ location: 'text' });

module.exports =
  mongoose.models.BusStandContact ||
  mongoose.model('BusStandContact', BusStandContactSchema);
