// @ts-nocheck
const Journey = require('../models/Journey');
const LiveVehicle = require('../models/LiveVehicle');
const User = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const logger = require('../utils/logger');
const {
  haversineKm,
  loadRouteStopsWithCoords,
  lookupFare
} = require('../utils/journeyUtils');

async function autoCompleteJourneys() {
  const activeJourneys = await Journey.find({ status: 'active' }).lean();
  if (!activeJourneys.length) return;

  for (const journey of activeJourneys) {
    try {
      const live = await LiveVehicle.findOne({ _id: journey.deviceId }).lean();
      if (!live?.lat || !live?.lon) continue;

      // Load ordered stops for this journey's direction
      const orderedStops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);

      if (orderedStops.length < 2) continue;

      const lastStop = orderedStops[orderedStops.length - 1];
      const distToLast = haversineKm(
        live.lat, live.lon,
        parseFloat(lastStop.latitude), parseFloat(lastStop.longitude)
      );

      // Auto-complete only if bus is within 300m of the last stop
      if (distToLast > 0.3) continue;

      const alightingIndex = orderedStops.length - 1;
      const stopsTravelled = Math.max(1, Math.abs(alightingIndex - journey.boardingStopIndex));
      const fareInfo = await lookupFare(stopsTravelled);
      const fareCharged = fareInfo.price;

      // Deduct fare unconditionally — allow negative balance (acts as debt cleared on next top-up)
      const updated = await User.findByIdAndUpdate(
        journey.userId,
        { $inc: { pointBalance: -fareCharged } },
        { new: true }
      );

      await PointTransaction.create({
        userId: journey.userId,
        type: 'journey_payment',
        amount: -fareCharged,
        balanceAfter: updated?.pointBalance ?? -fareCharged,
        description: `Auto-completed: ${journey.boardingStopName} → ${lastStop.name || 'Last Stop'} (${stopsTravelled} stops)`,
        journeyId: String(journey._id),
      });

      await Journey.findByIdAndUpdate(journey._id, {
        alightingStopId:    lastStop.stopId,
        alightingStopName:  lastStop.name || 'Last Stop',
        alightingStopIndex: alightingIndex,
        alightingLat:       live.lat,
        alightingLon:       live.lon,
        stopsTravelled,
        fareCharged,
        fareSectionId:  fareInfo.sectionId,
        fareSectionName: fareInfo.sectionName,
        status:  'completed',
        endedAt: new Date(),
      });

      logger.info(`Journey ${journey._id} (user ${journey.userId}) completed at ${lastStop.name}, fare: ${fareCharged}pts, balance: ${updated?.pointBalance ?? 'unknown'}`);
    } catch (err) {
      logger.error(`Error processing journey ${journey._id}: ${err.message}`);
    }
  }
}

module.exports = { autoCompleteJourneys };
