// @ts-nocheck
const mongoose = require('mongoose');

const JourneySchema = new mongoose.Schema(
  {
    userId:             { type: String, required: true, index: true },
    deviceId:           { type: String, required: true, index: true },
    routeId:            { type: String, required: true },
    direction:          { type: String, enum: ['UP', 'DOWN'], required: true },

    boardingStopId:     { type: String, required: true },
    boardingStopName:   { type: String, default: '' },
    boardingStopIndex:  { type: Number, required: true },
    boardingLat:        { type: Number },
    boardingLon:        { type: Number },

    alightingStopId:    { type: String, default: null },
    alightingStopName:  { type: String, default: null },
    alightingStopIndex: { type: Number, default: null },
    alightingLat:       { type: Number, default: null },
    alightingLon:       { type: Number, default: null },

    stopsTravelled:     { type: Number, default: null },
    fareCharged:        { type: Number, default: null },

    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },

    // Display fields (denormalized at boarding)
    busNumber:      { type: String, default: null },
    routeNumber:    { type: String, default: null },
    routeStartName: { type: String, default: null },
    routeEndName:   { type: String, default: null },

    startedAt: { type: Date, default: Date.now },
    endedAt:   { type: Date, default: null },
  },
  { versionKey: false, timestamps: true }
);

JourneySchema.index({ userId: 1, status: 1 });
JourneySchema.index({ userId: 1, createdAt: -1 });

module.exports =
  mongoose.models.Journey || mongoose.model('Journey', JourneySchema);
