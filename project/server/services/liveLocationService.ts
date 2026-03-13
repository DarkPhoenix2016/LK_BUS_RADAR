// @ts-nocheck
const LiveVehicle = require('../models/LiveVehicle');
const LiveRouteVehicle = require('../models/LiveRouteVehicle');
const { getEndpoint, getWithRetry } = require('../utils/apiClient');
const { toArray, getId, asNumber, asDate, serviceSummary } = require('./common');

async function updateLiveVehicleLocations() {
  const startedAt = Date.now();
  const counters = { inserted: 0, updated: 0, errors: 0 };

  try {
    const url = getEndpoint('devicesForLiveMap');
    const payload = await getWithRetry(url);
    const rows = toArray(payload);

    const liveOps = [];
    const liveRouteOps = [];

    for (const row of rows) {
      const deviceRaw = row.device || row;
      const busRaw = row.routePermitBus || row.bus || {};
      // Route is nested: row.routePermitBus.routePermit.route
      const routeRaw = row.route || row.routePermit?.route || busRaw.routePermit?.route || {};

      const deviceId = getId(deviceRaw, ['id', '_id', 'deviceId']);
      if (!deviceId) continue;

      const busId = getId(busRaw, ['id', '_id', 'busId']) || undefined;
      const routeId =
        getId(routeRaw, ['id', '_id', 'routeId', 'routeID']) ||
        (busRaw.routePermit?.routeId ? String(busRaw.routePermit.routeId) : undefined);


      const lat = asNumber(row.latitude || row.lat || deviceRaw.latitude || deviceRaw.lat);
      const lon = asNumber(row.longitude || row.lon || row.lng || deviceRaw.longitude || deviceRaw.lon);
      const speed = asNumber(row.speed || deviceRaw.speed);
      const heading = asNumber(row.heading || row.bearing || deviceRaw.heading);
      const timestamp = asDate(row.timestamp || row.gpsTime || deviceRaw.timestamp || Date.now());
      const isOnline = Boolean(row.isOnline ?? deviceRaw.isOnline ?? true);

      const liveSet = { lat, lon, speed, heading, timestamp, isOnline };
      if (busId) liveSet.busId = busId;
      if (routeId) liveSet.routeId = routeId;

      liveOps.push({
        updateOne: {
          filter: { _id: deviceId },
          update: {
            $setOnInsert: { _id: deviceId },
            $set: liveSet,
          },
          upsert: true,
        },
      });

      if (routeId) {
        liveRouteOps.push({
          updateOne: {
            filter: { routeId, deviceId },
            update: {
              $setOnInsert: {
                routeId,
                deviceId,
                busNumber: busRaw.busNumber || busRaw.number,
              },
              $set: {
                lat,
                lon,
                timestamp,
              },
            },
            upsert: true,
          },
        });
      }
    }

    const [liveRes, liveRouteRes] = await Promise.all([
      liveOps.length ? LiveVehicle.bulkWrite(liveOps, { ordered: false }) : null,
      liveRouteOps.length ? LiveRouteVehicle.bulkWrite(liveRouteOps, { ordered: false }) : null,
    ]);

    counters.inserted += (liveRes?.upsertedCount || 0) + (liveRouteRes?.upsertedCount || 0);
    counters.updated += (liveRes?.modifiedCount || 0) + (liveRouteRes?.modifiedCount || 0);
  } catch (error) {
    counters.errors += 1;
    console.error('[updateLiveVehicleLocations] API/processing error', error.message);
  }

  return serviceSummary('updateLiveVehicleLocations', counters, startedAt);
}

module.exports = { updateLiveVehicleLocations };
