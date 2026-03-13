// @ts-nocheck
const mongoose = require('mongoose');

const PointTransactionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['topup', 'booking_payment', 'journey_payment', 'refund'],
      required: true,
    },
    amount: { type: Number, required: true }, // positive = credit, negative = debit
    balanceAfter: { type: Number, required: true },
    description: { type: String, default: '' },
    bookingId: { type: String, default: null },
    journeyId: { type: String, default: null },
  },
  { versionKey: false, timestamps: true }
);

PointTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PointTransaction ||
  mongoose.model('PointTransaction', PointTransactionSchema);
