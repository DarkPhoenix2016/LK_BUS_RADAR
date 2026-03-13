// @ts-nocheck
const RunningNumber = require('../models/RunningNumber');
const RunningSlot = require('../models/RunningSlot');
const RunningSlotStop = require('../models/RunningSlotStop');
const BusTurn = require('../models/BusTurn');
const SyncReview = require('../models/SyncReview');
const { getEndpoint, getWithRetry } = require('../utils/apiClient');
const { buildAdminModifiedUnset, getChangedFields, replaceReviewItems, splitSyncChanges } = require('../utils/diffChecker');
const { serviceSummary } = require('./common');

async function syncTimetable(routeId) {
  const startedAt = Date.now();
  const counters = { inserted: 0, updated: 0, errors: 0, queued: 0 };

  try {
    const url = getEndpoint('routeTimetable', { routeID: routeId });
    const payload = await getWithRetry(url);

    const rows = Array.isArray(payload) ? payload : (payload?.data ?? []);
    if (rows.length === 0) {
      return serviceSummary(`syncTimetable:${routeId}`, counters, startedAt);
    }

    const runningNumberMap = new Map();
    const runningSlotMap = new Map();
    const runningSlotStopMap = new Map();
    const busTurnMap = new Map();

    for (const turn of rows) {
      const turnId = String(turn.id ?? '');
      const slot = turn.runningSlot || {};
      const slotId = String(slot.id ?? turn.runningSlotId ?? '');
      const rn = slot.runningNumber || {};
      const rnId = String(rn.id ?? slot.runningNumberId ?? '');

      if (!turnId || !slotId) continue;

      if (rnId && !runningNumberMap.has(rnId)) {
        runningNumberMap.set(rnId, {
          _id: rnId,
          runningNumber: rn.runningNumber ?? '',
          busType: rn.busType ?? '',
        });
      }

      if (!runningSlotMap.has(slotId)) {
        runningSlotMap.set(slotId, {
          _id: slotId,
          routeId: String(routeId),
          runningNumberId: rnId,
          direction: (slot.runningDirection ?? '').toUpperCase() || undefined,
        });
      }

      const slotStops = Array.isArray(slot.runningSlotBusStops) ? slot.runningSlotBusStops : [];
      for (const ss of slotStops) {
        const stopId = String(ss.busStopId ?? ss.busStop?.id ?? '');
        if (!stopId) continue;
        const key = `${slotId}:${stopId}`;
        if (!runningSlotStopMap.has(key)) {
          runningSlotStopMap.set(key, {
            slotId,
            stopId,
            stopName: ss.busStop?.name || stopId,
            weekdayTime: ss.weekdayTime ?? '',
            weekendTime: ss.weekendTime ?? '',
          });
        }
      }

      busTurnMap.set(turnId, {
        _id: turnId,
        runningSlotId: slotId,
        deviceId: turn.deviceId ? String(turn.deviceId) : '',
        busTurnStatus: turn.busTurnStatus ?? '',
        loadingStartingTime: turn.loadingStartingTime ?? '0000',
      });
    }

    const slotStopFilters = [...runningSlotStopMap.values()].map((x) => ({ slotId: x.slotId, stopId: x.stopId }));

    const [existingNumbers, existingSlots, existingStops, existingTurns] = await Promise.all([
      RunningNumber.find({ _id: { $in: [...runningNumberMap.keys()] } }).lean(),
      RunningSlot.find({ _id: { $in: [...runningSlotMap.keys()] } }).lean(),
      slotStopFilters.length ? RunningSlotStop.find({ $or: slotStopFilters }).lean() : Promise.resolve([]),
      BusTurn.find({ _id: { $in: [...busTurnMap.keys()] } }).lean(),
    ]);

    const numberExistingMap = new Map(existingNumbers.map((x) => [String(x._id), x]));
    const slotExistingMap = new Map(existingSlots.map((x) => [String(x._id), x]));
    const stopExistingMap = new Map(existingStops.map((x) => [`${x.slotId}:${x.stopId}`, x]));
    const turnExistingMap = new Map(existingTurns.map((x) => [String(x._id), x]));

    const reviewItems = [];
    const reviewScopes = [];

    // RunningNumber: inserts apply, updates go to review
    const numberOps = [];
    for (const doc of runningNumberMap.values()) {
      const existing = numberExistingMap.get(doc._id);
      if (!existing) {
        numberOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
      } else {
        const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, doc);
        reviewScopes.push({ entityId: `RunningNumber:${doc._id}`, fields: scopeFields });

        if (Object.keys(directUpdates).length > 0) {
          numberOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
            },
          });
        }

        for (const [field, incomingValue] of Object.entries(reviewChanges)) {
          reviewItems.push({
            entityType: 'RunningNumber',
            entityId: `RunningNumber:${doc._id}`,
            queryFilter: { _id: doc._id },
            routeId: String(routeId),
            field,
            label: `Running Number "${existing.runningNumber || doc._id}" — ${field}`,
            currentValue: existing[field] ?? null,
            incomingValue,
          });
        }
      }
    }

    // RunningSlot: inserts apply, updates go to review
    const slotOps = [];
    for (const doc of runningSlotMap.values()) {
      const existing = slotExistingMap.get(doc._id);
      if (!existing) {
        slotOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
      } else {
        const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, doc);
        reviewScopes.push({ entityId: `RunningSlot:${doc._id}`, fields: scopeFields });

        if (Object.keys(directUpdates).length > 0) {
          slotOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
            },
          });
        }

        for (const [field, incomingValue] of Object.entries(reviewChanges)) {
          reviewItems.push({
            entityType: 'RunningSlot',
            entityId: `RunningSlot:${doc._id}`,
            queryFilter: { _id: doc._id },
            routeId: String(routeId),
            field,
            label: `Running Slot "${doc._id}" (${existing.direction || '?'}) — ${field}`,
            currentValue: existing[field] ?? null,
            incomingValue,
          });
        }
      }
    }

    // RunningSlotStop: inserts apply, updates go to review
    const stopOps = [];
    for (const doc of runningSlotStopMap.values()) {
      const key = `${doc.slotId}:${doc.stopId}`;
      const existing = stopExistingMap.get(key);
      if (!existing) {
        stopOps.push({
          updateOne: {
            filter: { slotId: doc.slotId, stopId: doc.stopId },
            update: { $setOnInsert: { slotId: doc.slotId, stopId: doc.stopId, weekdayTime: doc.weekdayTime, weekendTime: doc.weekendTime } },
            upsert: true,
          },
        });
      } else {
        const nextTimes = { weekdayTime: doc.weekdayTime, weekendTime: doc.weekendTime };
        const { directUpdates, reviewChanges, scopeFields } = splitSyncChanges(existing, nextTimes);
        reviewScopes.push({ entityId: `RunningSlotStop:${doc.slotId}:${doc.stopId}`, fields: scopeFields });

        if (Object.keys(directUpdates).length > 0) {
          stopOps.push({
            updateOne: {
              filter: { slotId: doc.slotId, stopId: doc.stopId },
              update: { $set: directUpdates, $unset: buildAdminModifiedUnset(Object.keys(directUpdates)) },
            },
          });
        }

        for (const [field, incomingValue] of Object.entries(reviewChanges)) {
          reviewItems.push({
            entityType: 'RunningSlotStop',
            entityId: `RunningSlotStop:${doc.slotId}:${doc.stopId}`,
            queryFilter: { slotId: doc.slotId, stopId: doc.stopId },
            routeId: String(routeId),
            field,
            label: `Slot ${doc.slotId} times at "${doc.stopName}" — ${field}`,
            currentValue: existing[field] ?? null,
            incomingValue,
          });
        }
      }
    }

    // BusTurn: always apply directly (ephemeral assignment data)
    const turnOps = [];
    for (const doc of busTurnMap.values()) {
      const existing = turnExistingMap.get(doc._id);
      if (!existing) {
        turnOps.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
      } else {
        const changed = getChangedFields(existing, doc);
        if (Object.keys(changed).length > 0)
          turnOps.push({ updateOne: { filter: { _id: doc._id }, update: { $set: changed } } });
      }
    }

    const [numberRes, slotRes, stopRes, turnRes] = await Promise.all([
      numberOps.length ? RunningNumber.bulkWrite(numberOps, { ordered: false }) : null,
      slotOps.length ? RunningSlot.bulkWrite(slotOps, { ordered: false }) : null,
      stopOps.length ? RunningSlotStop.bulkWrite(stopOps, { ordered: false }) : null,
      turnOps.length ? BusTurn.bulkWrite(turnOps, { ordered: false }) : null,
    ]);

    for (const res of [numberRes, slotRes, stopRes, turnRes]) {
      counters.inserted += res?.upsertedCount || 0;
      counters.updated += res?.modifiedCount || 0;
    }

    counters.queued = await replaceReviewItems(SyncReview, reviewItems, reviewScopes);

    console.log(`[syncTimetable:${routeId}] busTurns=${busTurnMap.size} slots=${runningSlotMap.size} inserted=${counters.inserted} queued=${counters.queued}`);
  } catch (error) {
    counters.errors += 1;
    console.error(`[syncTimetable:${routeId}] API/processing error`, error.message);
  }

  return serviceSummary(`syncTimetable:${routeId}`, counters, startedAt);
}

module.exports = { syncTimetable };
