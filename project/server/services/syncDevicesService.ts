// @ts-nocheck
const Route = require('../models/Route');
const Bus = require('../models/Bus');
const Device = require('../models/Device');
const RoutePermit = require('../models/RoutePermit');
const { getEndpoint, getWithRetry } = require('../utils/apiClient');
const { getChangedFields } = require('../utils/diffChecker');
const { toArray, getId, asNumber, serviceSummary } = require('./common');

async function syncDevicesAndBuses() {
  const startedAt = Date.now();
  const counters = { inserted: 0, updated: 0, errors: 0 };
  const routeIds = new Set();

  try {
    const url = getEndpoint('devicesForLiveMap');
    const payload = await getWithRetry(url);
    const rows = toArray(payload);

    const routeMap = new Map();
    const permitMap = new Map();
    const busMap = new Map();
    const deviceMap = new Map();

    for (const row of rows) {
      const routeRaw = row.route || row.routePermit?.route || {};
      const permitRaw = row.routePermit || row.routePermitBus?.routePermit || {};
      const busRaw = row.routePermitBus || row.bus || {};
      const deviceRaw = row.device || row;

      const routeId = getId(routeRaw, ['id', '_id', 'routeID', 'routeId']);
      if (routeId) {
        routeIds.add(routeId);
        routeMap.set(routeId, {
          _id: routeId,
          routeNumber: routeRaw.routeNumber || routeRaw.number,
          startingBusStop: routeRaw.startingBusStop || routeRaw.start,
          endingBusStop: routeRaw.endingBusStop || routeRaw.end,
          routeDistance: asNumber(routeRaw.routeDistance || routeRaw.distance),
        });
      }

      const permitId = getId(permitRaw, ['id', '_id', 'permitId', 'routePermitId']);
      if (permitId) {
        const permitRouteId = routeId || getId(permitRaw.route || {}, ['id', '_id', 'routeId']);
        if (permitRouteId) routeIds.add(permitRouteId);

        permitMap.set(permitId, {
          _id: permitId,
          permitNumber: permitRaw.permitNumber || permitRaw.number,
          routeId: permitRouteId,
          ownerId: String(
            permitRaw.ownerId || permitRaw.ownerID || permitRaw.owner?.id || ''
          ) || undefined,
          routePermitType: permitRaw.routePermitType || permitRaw.permitType,
        });
      }

      const busId = getId(busRaw, ['id', '_id', 'busId']);
      if (busId) {
        busMap.set(busId, {
          _id: busId,
          busNumber: busRaw.busNumber || busRaw.number,
          routePermitId: permitId,
          seatingCapacity: asNumber(busRaw.seatingCapacity),
          driverContact: busRaw.driverContact,
          conductorContact: busRaw.conductorContact,
          totalDistance: asNumber(busRaw.totalDistance),
        });
      }

      const deviceId = getId(deviceRaw, ['id', '_id', 'deviceId']);
      if (deviceId) {
        deviceMap.set(deviceId, {
          _id: deviceId,
          imei: String(deviceRaw.imei || ''),
          simNumber: String(deviceRaw.simNumber || deviceRaw.sim || ''),
          busId,
          isActive: Boolean(deviceRaw.isActive ?? true),
        });
      }
    }

    const [existingRoutes, existingPermits, existingBuses, existingDevices] = await Promise.all([
      Route.find({ _id: { $in: [...routeMap.keys()] } }).lean(),
      RoutePermit.find({ _id: { $in: [...permitMap.keys()] } }).lean(),
      Bus.find({ _id: { $in: [...busMap.keys()] } }).lean(),
      Device.find({ _id: { $in: [...deviceMap.keys()] } }).lean(),
    ]);

    const routeExistingMap = new Map(existingRoutes.map((x) => [x._id, x]));
    const permitExistingMap = new Map(existingPermits.map((x) => [x._id, x]));
    const busExistingMap = new Map(existingBuses.map((x) => [x._id, x]));
    const deviceExistingMap = new Map(existingDevices.map((x) => [x._id, x]));

    const routeOps = [];
    for (const doc of routeMap.values()) {
      const existing = routeExistingMap.get(doc._id);
      if (!existing) {
        routeOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
        continue;
      }
      const changed = getChangedFields(existing, doc);
      if (Object.keys(changed).length > 0) {
        routeOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: changed } } });
      }
    }

    const permitOps = [];
    for (const doc of permitMap.values()) {
      const existing = permitExistingMap.get(doc._id);
      if (!existing) {
        permitOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
        continue;
      }
      const changed = getChangedFields(existing, doc);
      if (Object.keys(changed).length > 0) {
        permitOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: changed } } });
      }
    }

    const busOps = [];
    for (const doc of busMap.values()) {
      const existing = busExistingMap.get(doc._id);
      if (!existing) {
        busOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
        continue;
      }
      const changed = getChangedFields(existing, doc);
      if (Object.keys(changed).length > 0) {
        busOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: changed } } });
      }
    }

    const deviceOps = [];
    for (const doc of deviceMap.values()) {
      const existing = deviceExistingMap.get(doc._id);
      if (!existing) {
        deviceOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
        continue;
      }
      const changed = getChangedFields(existing, doc);
      if (Object.keys(changed).length > 0) {
        deviceOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: changed } } });
      }
    }

    const [routeRes, permitRes, busRes, deviceRes] = await Promise.all([
      routeOps.length ? Route.bulkWrite(routeOps, { ordered: false }) : null,
      permitOps.length ? RoutePermit.bulkWrite(permitOps, { ordered: false }) : null,
      busOps.length ? Bus.bulkWrite(busOps, { ordered: false }) : null,
      deviceOps.length ? Device.bulkWrite(deviceOps, { ordered: false }) : null,
    ]);

    for (const res of [routeRes, permitRes, busRes, deviceRes]) {
      counters.inserted += res?.upsertedCount || 0;
      counters.updated += res?.modifiedCount || 0;
    }
  } catch (error) {
    counters.errors += 1;
    console.error('[syncDevicesAndBuses] API/processing error', error.message);
  }

  const summary = serviceSummary('syncDevicesAndBuses', counters, startedAt, {
    uniqueRouteCount: routeIds.size,
  });

  return {
    ...summary,
    routeIds: [...routeIds],
  };
}

module.exports = { syncDevicesAndBuses };
