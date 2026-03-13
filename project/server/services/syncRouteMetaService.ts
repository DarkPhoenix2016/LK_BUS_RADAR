// @ts-nocheck
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const RouteStop = require('../models/RouteStop');
const SyncReview = require('../models/SyncReview');
const { getEndpoint, getWithRetry } = require('../utils/apiClient');
const { buildAdminModifiedUnset, replaceReviewItems, splitSyncChanges } = require('../utils/diffChecker');
const { getId, asNumber, serviceSummary } = require('./common');

function extractStops(payload, key) {
  const direct = payload?.[key];
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  return [];
}

function extractRoute(payload) {
  if (payload?.route) return payload.route;
  if (payload?.data?.route) return payload.data.route;
  if (payload?.data && !Array.isArray(payload.data)) return payload.data;
  return payload || {};
}

async function syncRouteMeta(routeId) {
  const startedAt = Date.now();
  const counters = { inserted: 0, updated: 0, errors: 0, queued: 0 };

  try {
    const url = getEndpoint('routeMeta', { routeID: routeId });
    const payload = await getWithRetry(url);

    const routeRaw = extractRoute(payload);
    const upStops = extractStops(payload, 'upStops');
    const downStops = extractStops(payload, 'downStops');

    const routeDoc = {
      _id: String(routeId),
      routeNumber: routeRaw.routeNumber || routeRaw.number,
      startingBusStop: routeRaw.startingBusStop || routeRaw.start,
      endingBusStop: routeRaw.endingBusStop || routeRaw.end,
      routeDistance: asNumber(routeRaw.routeDistance || routeRaw.distance),
    };

    // Route: auto-apply untouched fields, queue manual overrides for review
    const existingRoute = await Route.findById(routeDoc._id).lean();
    const reviewItems = [];
    const reviewScopes = [];

    if (!existingRoute) {
      await Route.updateOne({ _id: routeDoc._id }, { $setOnInsert: routeDoc }, { upsert: true });
      counters.inserted += 1;
    } else {
      const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existingRoute, routeDoc);
      reviewScopes.push({ entityId: `Route:${routeDoc._id}`, fields: scopeFields });

      if (Object.keys(directUpdates).length > 0) {
        await Route.updateOne(
          { _id: routeDoc._id },
          { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) }
        );
        counters.updated += 1;
      }

      for (const [field, incomingValue] of Object.entries(reviewChanges)) {
        reviewItems.push({
          entityType: 'Route',
          entityId: `Route:${routeDoc._id}`,
          queryFilter: { _id: routeDoc._id },
          routeId: String(routeId),
          field,
          label: `Route "${existingRoute.routeNumber || routeDoc._id}" — ${field}`,
          currentValue: existingRoute[field] ?? null,
          incomingValue,
        });
      }
    }

    const stopRows = [
      ...upStops.map((stop, idx) => ({ stop, direction: 'UP', displayOrder: idx + 1 })),
      ...downStops.map((stop, idx) => ({ stop, direction: 'DOWN', displayOrder: idx + 1 })),
    ];

    const busStopMap = new Map();
    const routeStopMap = new Map();

    for (const row of stopRows) {
      const stopRaw = row.stop || {};
      const stopId =
        getId(stopRaw, ['id', '_id', 'busStopId', 'stopId']) ||
        (stopRaw.name ? `${routeId}-${row.direction}-${row.displayOrder}-${stopRaw.name}` : null);
      if (!stopId) continue;

      busStopMap.set(stopId, {
        _id: stopId,
        name: stopRaw.name || stopRaw.stopName,
        latitude: asNumber(stopRaw.latitude || stopRaw.lat),
        longitude: asNumber(stopRaw.longitude || stopRaw.lon || stopRaw.lng),
        type: stopRaw.type,
        geoFenceRadius: asNumber(stopRaw.geoFenceRadius || stopRaw.radius),
      });

      const routeStopKey = `${routeId}:${stopId}:${row.direction}`;
      routeStopMap.set(routeStopKey, {
        routeId: String(routeId),
        stopId,
        direction: row.direction,
        displayOrder: row.displayOrder,
      });
    }

    const [existingStops, existingRouteStops, existingRouteStopCount] = await Promise.all([
      BusStop.find({ _id: { $in: [...busStopMap.keys()] } }).lean(),
      RouteStop.find({
        routeId: String(routeId),
        stopId: { $in: [...busStopMap.keys()] },
      }).lean(),
      RouteStop.countDocuments({ routeId: String(routeId) }),
    ]);

    const stopExistingMap = new Map(existingStops.map((x) => [String(x._id), x]));
    const routeStopExistingMap = new Map(
      existingRouteStops.map((x) => [`${x.routeId}:${x.stopId}:${x.direction}`, x])
    );

    // BusStop: inserts apply, updates go to review
    const stopOps = [];
    for (const doc of busStopMap.values()) {
      const existing = stopExistingMap.get(doc._id);
      if (!existing) {
        stopOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
      } else {
        const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, doc);
        reviewScopes.push({ entityId: `BusStop:${doc._id}`, fields: scopeFields });

        if (Object.keys(directUpdates).length > 0) {
          stopOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
            },
          });
        }

        for (const [field, incomingValue] of Object.entries(reviewChanges)) {
          reviewItems.push({
            entityType: 'BusStop',
            entityId: `BusStop:${doc._id}`,
            queryFilter: { _id: doc._id },
            routeId: String(routeId),
            field,
            label: `Bus Stop "${existing.name || doc._id}" — ${field}`,
            currentValue: existing[field] ?? null,
            incomingValue,
          });
        }
      }
    }

    // RouteStop: inserts apply, updates go to review
    const routeStopOps = [];
    for (const [key, doc] of routeStopMap.entries()) {
      const existing = routeStopExistingMap.get(key);
      if (!existing) {
        // If this route already has stops, do not auto-insert new vendor stops.
        // This prevents manual route-path edits from being reintroduced by sync.
        if (existingRouteStopCount === 0) {
          routeStopOps.push({
            updateOne: {
              filter: { routeId: doc.routeId, stopId: doc.stopId, direction: doc.direction },
              update: { $setOnInsert: doc },
              upsert: true,
            },
          });
        }
      } else {
        const nextValues = { displayOrder: doc.displayOrder };
        const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, nextValues);
        reviewScopes.push({ entityId: `RouteStop:${routeId}:${doc.stopId}:${doc.direction}`, fields: scopeFields });

        if (Object.keys(directUpdates).length > 0) {
          routeStopOps.push({
            updateOne: {
              filter: { routeId: doc.routeId, stopId: doc.stopId, direction: doc.direction },
              update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
            },
          });
        }

        for (const [field, incomingValue] of Object.entries(reviewChanges)) {
          reviewItems.push({
            entityType: 'RouteStop',
            entityId: `RouteStop:${routeId}:${doc.stopId}:${doc.direction}`,
            queryFilter: { routeId: doc.routeId, stopId: doc.stopId, direction: doc.direction },
            routeId: String(routeId),
            field,
            label: `Route Stop (${doc.direction}) at stop "${doc.stopId}" — ${field}`,
            currentValue: existing[field] ?? null,
            incomingValue,
          });
        }
      }
    }

    const [stopRes, routeStopRes] = await Promise.all([
      stopOps.length ? BusStop.bulkWrite(stopOps, { ordered: false }) : null,
      routeStopOps.length ? RouteStop.bulkWrite(routeStopOps, { ordered: false }) : null,
    ]);

    counters.inserted += (stopRes?.upsertedCount || 0) + (routeStopRes?.upsertedCount || 0);
    counters.updated += (stopRes?.modifiedCount || 0) + (routeStopRes?.modifiedCount || 0);
    counters.queued = await replaceReviewItems(SyncReview, reviewItems, reviewScopes);
  } catch (error) {
    counters.errors += 1;
    console.error(`[syncRouteMeta:${routeId}] API/processing error`, error.message);
  }

  return serviceSummary(`syncRouteMeta:${routeId}`, counters, startedAt);
}

module.exports = { syncRouteMeta };
