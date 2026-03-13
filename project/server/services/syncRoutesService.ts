// @ts-nocheck
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const SyncReview = require('../models/SyncReview');
const { getEndpoint, getWithRetry } = require('../utils/apiClient');
const { buildAdminModifiedUnset, replaceReviewItems, splitSyncChanges } = require('../utils/diffChecker');
const { serviceSummary } = require('./common');

async function syncAllRoutes() {
    const startedAt = Date.now();
    const counters = { inserted: 0, updated: 0, errors: 0, queued: 0 };
    const routeIds = [];

    try {
        const url = getEndpoint('allRoutes');
        const payload = await getWithRetry(url);

        const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
        if (rows.length === 0) {
            return { ...serviceSummary('syncAllRoutes', counters, startedAt), routeIds };
        }

        const routeMap = new Map();
        const busStopMap = new Map();

        for (const row of rows) {
            const routeId = String(row.id ?? '');
            if (!routeId) continue;
            routeIds.push(routeId);

            for (const stopObj of [row.start, row.end]) {
                if (!stopObj) continue;
                const stopId = String(stopObj.id ?? '');
                if (!stopId || busStopMap.has(stopId)) continue;
                busStopMap.set(stopId, {
                    _id: stopId,
                    name: stopObj.name ?? '',
                    type: stopObj.type ?? 'geofence',
                    latitude: stopObj.latitude != null ? parseFloat(stopObj.latitude) : null,
                    longitude: stopObj.longitude != null ? parseFloat(stopObj.longitude) : null,
                    geoFenceRadius: stopObj.geoFenceRadius ?? 100,
                    isActive: stopObj.isActive ?? true,
                });
            }

            routeMap.set(routeId, {
                _id: routeId,
                routeNumber: row.routeNumber ?? '',
                routeDistance: row.routeDistance != null ? parseFloat(row.routeDistance) : null,
                startingBusStop: row.start ? String(row.start.id ?? '') : null,
                endingBusStop: row.end ? String(row.end.id ?? '') : null,
                isActive: row.isActive ?? true,
            });
        }

        const [existingRoutes, existingStops] = await Promise.all([
            Route.find({ _id: { $in: [...routeMap.keys()] } }).lean(),
            BusStop.find({ _id: { $in: [...busStopMap.keys()] } }).lean(),
        ]);

        const routeExistingMap = new Map(existingRoutes.map((x) => [String(x._id), x]));
        const stopExistingMap = new Map(existingStops.map((x) => [String(x._id), x]));

        // Routes: inserts apply directly, updates go to review
        const routeOps = [];
        const reviewItems = [];
        const reviewScopes = [];
        for (const doc of routeMap.values()) {
            const existing = routeExistingMap.get(doc._id);
            if (!existing) {
                routeOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
            } else {
                const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, doc);
                reviewScopes.push({ entityId: `Route:${doc._id}`, fields: scopeFields });

                if (Object.keys(directUpdates).length > 0) {
                    routeOps.push({
                        updateOne: {
                            filter: { _id: doc._id },
                            update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
                        },
                    });
                }

                for (const [field, incomingValue] of Object.entries(reviewChanges)) {
                    reviewItems.push({
                        entityType: 'Route',
                        entityId: `Route:${doc._id}`,
                        queryFilter: { _id: doc._id },
                        routeId: String(doc._id),
                        field,
                        label: `Route "${existing.routeNumber || doc._id}" — ${field}`,
                        currentValue: existing[field] ?? null,
                        incomingValue,
                    });
                }
            }
        }

        // BusStops: inserts apply directly, updates go to review
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
                        routeId: '',
                        field,
                        label: `Bus Stop "${existing.name || doc._id}" — ${field}`,
                        currentValue: existing[field] ?? null,
                        incomingValue,
                    });
                }
            }
        }

        const [routeRes, stopRes] = await Promise.all([
            routeOps.length ? Route.bulkWrite(routeOps, { ordered: false }) : null,
            stopOps.length ? BusStop.bulkWrite(stopOps, { ordered: false }) : null,
        ]);

        for (const res of [routeRes, stopRes]) {
            counters.inserted += res?.upsertedCount || 0;
            counters.updated += res?.modifiedCount || 0;
        }

        counters.queued = await replaceReviewItems(SyncReview, reviewItems, reviewScopes);

        console.log(`[syncAllRoutes] routes=${routeMap.size} stops=${busStopMap.size} inserted=${counters.inserted} updated=${counters.updated} queued=${counters.queued}`);
    } catch (error) {
        counters.errors += 1;
        console.error('[syncAllRoutes] error', error.message);
    }

    return { ...serviceSummary('syncAllRoutes', counters, startedAt), routeIds };
}

module.exports = { syncAllRoutes };
