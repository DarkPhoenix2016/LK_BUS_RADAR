// @ts-nocheck
const mongoose = require('mongoose');

const syncReviewSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId:   { type: String, required: true, index: true },
    queryFilter:{ type: mongoose.Schema.Types.Mixed, required: true },
    routeId:    { type: String, default: '', index: true },
    field:      { type: String, required: true },
    label:      { type: String, default: '' },
    currentValue:  { type: mongoose.Schema.Types.Mixed },
    incomingValue: { type: mongoose.Schema.Types.Mixed },
    status:     { type: String, enum: ['pending', 'approved', 'ignored'], default: 'pending', index: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

syncReviewSchema.index({ entityId: 1, field: 1, status: 1 });
syncReviewSchema.index({ routeId: 1, status: 1 });

module.exports = mongoose.models.SyncReview || mongoose.model('SyncReview', syncReviewSchema);
