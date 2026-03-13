// @ts-nocheck
const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      unique: true,
      default: () => 'BK' + Date.now().toString(36).toUpperCase(),
    },
    userId: { type: String, required: true, index: true },
    routeId: { type: String, required: true, index: true },
    slotId: { type: String, required: true },
    travelDate: { type: Date, required: true },
    direction: { type: String, enum: ['up', 'down'], required: true },
    passengerName: { type: String, required: true },
    passengerEmail: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'confirmed', 'cancelled', 'completed'],
      default: 'draft',
      index: true,
    },
    fareAmount: { type: Number, default: null },
    paidWithPoints: { type: Boolean, default: false },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { versionKey: false, timestamps: true }
);

BookingSchema.index({ userId: 1, travelDate: -1 });

module.exports = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
