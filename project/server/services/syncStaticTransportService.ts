// @ts-nocheck
const { syncDevicesAndBuses } = require('./syncDevicesService');
const { syncAllRoutes } = require('./syncRoutesService');
const { syncRouteMeta } = require('./syncRouteMetaService');
const { syncTimetable } = require('./syncTimetableService');

async function processWithConcurrency(items, worker, maxConcurrent = 5) {
  let index = 0;
  const results = [];

  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await worker(items[current]);
      } catch (error) {
        results[current] = { error: error.message };
      }
    }
  }

  const workerCount = Math.min(maxConcurrent, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

async function syncStaticTransportData() {
  const startedAt = Date.now();

  // 1. Sync devices/buses (for live map linkage)
  const devicesSummary = await syncDevicesAndBuses();

  // 2. Sync ALL routes from the dedicated routes endpoint (covers all 231 routes)
  const routesSummary = await syncAllRoutes();
  const routeIds = routesSummary.routeIds || [];

  // 3. Per-route: route meta (stops, geometry) + timetable (slots, bus turns)
  const routeSummaries = await processWithConcurrency(
    routeIds,
    async (routeId) => {
      const [metaSummary, timetableSummary] = await Promise.all([
        syncRouteMeta(routeId),
        syncTimetable(routeId),
      ]);

      return {
        routeId,
        metaSummary,
        timetableSummary,
      };
    },
    5
  );

  const aggregate = routeSummaries.reduce(
    (acc, row) => {
      acc.inserted += (row.metaSummary?.inserted || 0) + (row.timetableSummary?.inserted || 0);
      acc.updated += (row.metaSummary?.updated || 0) + (row.timetableSummary?.updated || 0);
      acc.errors += (row.metaSummary?.errors || 0) + (row.timetableSummary?.errors || 0);
      return acc;
    },
    {
      inserted: (devicesSummary.inserted || 0) + (routesSummary.inserted || 0),
      updated: (devicesSummary.updated || 0) + (routesSummary.updated || 0),
      errors: (devicesSummary.errors || 0) + (routesSummary.errors || 0),
    }
  );

  const result = {
    service: 'syncStaticTransportData',
    routeCount: routeIds.length,
    inserted: aggregate.inserted,
    updated: aggregate.updated,
    errors: aggregate.errors,
    durationMs: Date.now() - startedAt,
  };

  console.log('[syncStaticTransportData]', result);

  return {
    ...result,
    devicesSummary,
    routesSummary,
    routeSummaries,
  };
}

module.exports = { syncStaticTransportData };

