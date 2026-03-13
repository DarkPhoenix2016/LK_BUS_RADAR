// @ts-nocheck
const mongoose = require('mongoose');

const ConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    label: { type: String, default: '' },
    values: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { versionKey: false, timestamps: true }
);

module.exports = mongoose.models.Config || mongoose.model('Config', ConfigSchema);
