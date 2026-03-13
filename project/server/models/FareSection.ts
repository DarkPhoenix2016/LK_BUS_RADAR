// @ts-nocheck
const mongoose = require('mongoose');

const FareSectionSchema = new mongoose.Schema(
  {
    section: { type: Number, required: true, unique: true },
    stops:   { type: Number, required: true },
    price:   { type: Number, required: true },
  },
  { versionKey: false, timestamps: true }
);

module.exports =
  mongoose.models.FareSection || mongoose.model('FareSection', FareSectionSchema);
