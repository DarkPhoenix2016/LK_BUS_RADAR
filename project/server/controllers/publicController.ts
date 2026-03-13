// @ts-nocheck
const express = require('express');

const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const RouteStop = require('../models/RouteStop');
const RunningSlot = require('../models/RunningSlot');
const RunningNumber = require('../models/RunningNumber');
const RunningSlotStop = require('../models/RunningSlotStop');
const BusTurn = require('../models/BusTurn');
const LiveVehicle = require('../models/LiveVehicle');
const Bus = require('../models/Bus');
const RoutePermit = require('../models/RoutePermit');

const BusStandContact = require('../models/BusStandContact');

const router = express.Router();

function asStopDTO(stop, displayOrder) {
  return {
    id: String(stop._id),
    name: stop.name || '',
    type: stop.type || 'regular_stop',
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    geoFenceRadius: stop.geoFenceRadius ?? null,
    displayOrder: displayOrder ?? null,
  };
}

function asRouteDTO(route, startStop, endStop) {
  return {
    id: String(route._id),
    routeNumber: route.routeNumber || '',
    routeDistance: route.routeDistance ?? null,
    start: startStop ? asStopDTO(startStop) : null,
    end: endStop ? asStopDTO(endStop) : null,
  };
}

function paginate(items, page, perPage) {
  const total = items.length;
  const currentPage = Math.max(1, page);
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const start = (currentPage - 1) * perPage;
  const data = items.slice(start, start + perPage);

  return {
    meta: {
      total,
      perPage,
      currentPage,
      lastPage,
      firstPage: 1,
      firstPageUrl: null,
      lastPageUrl: null,
      nextPageUrl: currentPage < lastPage ? true : null,
      previousPageUrl: currentPage > 1 ? true : null,
    },
    data,
  };
}

function toCoord(stop) {
  if (!stop) return null;
  const latitude = Number(stop.latitude);
  const longitude = Number(stop.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function haversineDistanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function polylineDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistanceKm(points[i - 1], points[i]);
  }

  return total > 0 ? total : null;
}

function buildStandardRoutePath(upStops, downStops, startStop, endStop) {
  const upPath = upStops.map(toCoord).filter(Boolean);
  if (upPath.length >= 2) return upPath;

  const downPath = downStops.map(toCoord).filter(Boolean);
  if (downPath.length >= 2) return downPath;

  const start = toCoord(startStop);
  const end = toCoord(endStop);
  if (start && end) return [start, end];

  return upPath.length > 0 ? upPath : downPath;
}

function toValidDistance(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveAndBackfillRouteDistance(routeId, currentDistance, standardRoutePath, startStop, endStop) {
  const existingDistance = toValidDistance(currentDistance);
  if (existingDistance !== null) return Number(existingDistance.toFixed(2));

  let derivedDistance = polylineDistanceKm(standardRoutePath);

  if (derivedDistance === null) {
    const start = toCoord(startStop);
    const end = toCoord(endStop);
    if (start && end) {
      derivedDistance = haversineDistanceKm(start, end);
    }
  }

  if (derivedDistance === null) return null;

  const rounded = Number(derivedDistance.toFixed(2));
  if (rounded <= 0) return null;

  try {
    await Route.updateOne(
      {
        _id: routeId,
        $or: [{ routeDistance: { $exists: false } }, { routeDistance: null }, { routeDistance: { $lte: 0 } }],
      },
      { $set: { routeDistance: rounded } }
    );
  } catch (error) {
    console.warn(`[distance-backfill:${routeId}] failed`, error.message);
  }

  return rounded;
}

router.get('/routes', async (req, res) => {
  try {
    const searchKey = String(req.query.searchKey || '').trim().toLowerCase();
    const page = Number(req.query.page || 1);
    const perPage = Number(req.query.perPage || 20);

    const routes = await Route.find({}).lean();
    if (routes.length === 0) {
      return res.status(200).json(paginate([], page, perPage));
    }

    const stopIds = new Set();
    for (const route of routes) {
      if (route.startingBusStop) stopIds.add(String(route.startingBusStop));
      if (route.endingBusStop) stopIds.add(String(route.endingBusStop));
    }

    const stops = await BusStop.find({ _id: { $in: [...stopIds] } }).lean();
    const stopMap = new Map(stops.map((s) => [String(s._id), s]));

    let data = routes.map((route) =>
      asRouteDTO(
        route,
        stopMap.get(String(route.startingBusStop)),
        stopMap.get(String(route.endingBusStop))
      )
    );

    if (searchKey) {
      data = data.filter((r) => {
        const startName = (r.start?.name || '').toLowerCase();
        const endName = (r.end?.name || '').toLowerCase();
        return (
          String(r.routeNumber || '').toLowerCase().includes(searchKey) ||
          startName.includes(searchKey) ||
          endName.includes(searchKey)
        );
      });
    }

    data.sort((a, b) => String(a.routeNumber).localeCompare(String(b.routeNumber), undefined, { numeric: true }));

    return res.status(200).json(paginate(data, page, perPage));
  } catch (error) {
    console.error('[GET /api/public/routes] error', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/withMeta/:routeId', async (req, res) => {
  try {
    const routeId = String(req.params.routeId);
    const route = await Route.findById(routeId).lean();

    if (!route) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    const [upRouteStops, downRouteStops, startStop, endStop] = await Promise.all([
      RouteStop.find({ routeId, direction: 'UP' }).sort({ displayOrder: 1 }).lean(),
      RouteStop.find({ routeId, direction: 'DOWN' }).sort({ displayOrder: 1 }).lean(),
      route.startingBusStop ? BusStop.findById(String(route.startingBusStop)).lean() : null,
      route.endingBusStop ? BusStop.findById(String(route.endingBusStop)).lean() : null,
    ]);

    const allStopIds = [
      ...upRouteStops.map((s) => String(s.stopId)),
      ...downRouteStops.map((s) => String(s.stopId)),
    ];
    const allStops = await BusStop.find({ _id: { $in: allStopIds } }).lean();
    const stopMap = new Map(allStops.map((s) => [String(s._id), s]));

    const upStops = upRouteStops
      .map((rs) => {
        const stop = stopMap.get(String(rs.stopId));
        return stop ? asStopDTO(stop, rs.displayOrder) : null;
      })
      .filter(Boolean);

    const downStops = downRouteStops
      .map((rs) => {
        const stop = stopMap.get(String(rs.stopId));
        return stop ? asStopDTO(stop, rs.displayOrder) : null;
      })
      .filter(Boolean);

    const standardRoutePath = buildStandardRoutePath(upStops, downStops, startStop, endStop);
    const routeDistance = await resolveAndBackfillRouteDistance(
      routeId,
      route.routeDistance,
      standardRoutePath,
      startStop,
      endStop
    );
    const routeWithResolvedDistance = { ...route, routeDistance };

    return res.status(200).json({
      ...asRouteDTO(routeWithResolvedDistance, startStop, endStop),
      startingBusStop: route.startingBusStop || null,
      endingBusStop: route.endingBusStop || null,
      upStops,
      downStops,
      meta: {
        averageDistanceKm: routeDistance !== null ? String(routeDistance) : '0',
        standardRoutePath,
      },
    });
  } catch (error) {
    console.error('[GET /api/public/withMeta/:routeId] error', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/timetable/bus-turn-running-slots/:routeId', async (req, res) => {
  try {
    const routeId = String(req.params.routeId);
    console.log(`[Timetable] Fetching slots for route: ${routeId}`);
    const slots = await RunningSlot.find({ routeId }).lean();
    if (slots.length === 0) {
      console.log(`[Timetable] No slots found for route: ${routeId}`);
      return res.status(200).json([]);
    }

    const slotIds = slots.map((s) => String(s._id));
    const runningNumberIds = [...new Set(slots.map((s) => s.runningNumberId ? String(s.runningNumberId) : null).filter(Boolean))];
    console.log(`[Timetable] Found ${slots.length} slots, ${runningNumberIds.length} running numbers`);

    const [runningNumbers, slotStops, busTurns] = await Promise.all([
      RunningNumber.find({
        $or: [
          { _id: { $in: runningNumberIds } },
          { runningNumber: { $in: runningNumberIds } },
        ],
      }).lean(),
      RunningSlotStop.find({ slotId: { $in: slotIds } }).lean(),
      BusTurn.find({ runningSlotId: { $in: slotIds } }).lean(),
    ]);

    console.log(`[Timetable] Resolved: ${runningNumbers.length} RNs, ${slotStops.length} stops, ${busTurns.length} turns`);

    const stopIds = [...new Set(slotStops.map((s) => String(s.stopId)))];
    const [stops, liveVehicles] = await Promise.all([
      BusStop.find({ _id: { $in: stopIds } }).lean(),
      LiveVehicle.find({ _id: { $in: busTurns.map((t) => String(t.deviceId)).filter(Boolean) }, isOnline: true })
        .select({ _id: 1 })
        .lean(),
    ]);

    const liveSet = new Set(liveVehicles.map((v) => String(v._id)));
    const runningNumberMap = new Map(runningNumbers.map((n) => [String(n._id), n]));
    const runningNumberByValue = new Map();
    runningNumbers.forEach((n) => {
      if (n.runningNumber) runningNumberByValue.set(String(n.runningNumber), n);
    });
    const stopMap = new Map(stops.map((s) => [String(s._id), s]));
    const slotStopBySlot = new Map();

    for (const row of slotStops) {
      const key = String(row.slotId);
      if (!slotStopBySlot.has(key)) slotStopBySlot.set(key, []);
      slotStopBySlot.get(key).push(row);
    }

    const slotMap = new Map(slots.map((s) => [String(s._id), s]));
    const entries = busTurns
      .map((turn) => {
        const slot = slotMap.get(String(turn.runningSlotId));
        if (!slot) return null;

        const rn = runningNumberMap.get(String(slot.runningNumberId)) || runningNumberByValue.get(String(slot.runningNumberId));
        const slotRows = slotStopBySlot.get(String(slot._id)) || [];

        return {
          id: String(turn._id),
          runningSlotId: String(slot._id),
          busTurnStatus: turn.busTurnStatus || '',
          deviceId: turn.deviceId || null,
          createdAt: turn.createdAt ? new Date(turn.createdAt).toISOString() : null,
          loadingStartingTime: turn.loadingStartingTime || '0000',
          runningSlot: {
            id: String(slot._id),
            runningDirection: String(slot.direction || '').toLowerCase(),
            runningNumberId: String(slot.runningNumberId),
            runningNumber: {
              id: rn ? String(rn._id) : '',
              runningNumber: rn?.runningNumber || '',
              busType: rn?.busType || '',
            },
            runningSlotBusStops: slotRows.map((ss) => {
              const stop = stopMap.get(String(ss.stopId));
              return {
                id: `${ss.slotId}:${ss.stopId}`,
                busStopId: String(ss.stopId),
                weekdayTime: ss.weekdayTime || '',
                weekendTime: ss.weekendTime || '',
                runningSlotId: String(ss.slotId),
                busStop: {
                  id: stop ? String(stop._id) : String(ss.stopId),
                  name: stop?.name || '',
                },
              };
            }),
          },
          isOnline: turn.deviceId ? liveSet.has(String(turn.deviceId)) : false,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.loadingStartingTime).localeCompare(String(b.loadingStartingTime)));

    console.log(`[Timetable] Successfully mapped ${entries.length} entries`);
    return res.status(200).json(entries);
  } catch (error) {
    console.error('[GET /api/public/timetable/bus-turn-running-slots/:routeId] error', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/devices-for-live-map', async (req, res) => {
  try {
    const liveVehicles = await LiveVehicle.find({}).sort({ timestamp: -1 }).lean();
    if (liveVehicles.length === 0) {
      return res.status(200).json([]);
    }

    const busIds = [...new Set(liveVehicles.map((v) => String(v.busId)).filter(Boolean))];
    const directRouteIds = [...new Set(liveVehicles.map((v) => String(v.routeId)).filter(Boolean))];

    // Fetch buses first — needed to resolve missing routeIds via Bus → RoutePermit → Route
    const buses = await Bus.find({ _id: { $in: busIds } }).lean();
    const busMap = new Map(buses.map((b) => [String(b._id), b]));

    // For buses whose routeId is missing from LiveVehicle, follow Bus.routePermitId → RoutePermit.routeId
    const permitIds = [...new Set(buses.map((b) => String(b.routePermitId)).filter(Boolean))];
    const permits = permitIds.length
      ? await RoutePermit.find({ _id: { $in: permitIds } }).lean()
      : [];
    const permitMap = new Map(permits.map((p) => [String(p._id), p]));

    // Build busId → resolvedRouteId map (covers both direct and permit-resolved routes)
    const busIdToRouteId = new Map();
    for (const bus of buses) {
      const permit = permitMap.get(String(bus.routePermitId));
      if (permit?.routeId) busIdToRouteId.set(String(bus._id), String(permit.routeId));
    }

    const allRouteIds = [...new Set([...directRouteIds, ...busIdToRouteId.values()])];
    const routes = allRouteIds.length
      ? await Route.find({ _id: { $in: allRouteIds } }).lean()
      : [];
    const routeMap = new Map(routes.map((r) => [String(r._id), r]));

    const payload = liveVehicles.map((live) => {
      const bus = live.busId ? busMap.get(String(live.busId)) : null;
      const resolvedRouteId = live.routeId
        ? String(live.routeId)
        : (live.busId ? busIdToRouteId.get(String(live.busId)) : null);
      const route = resolvedRouteId ? routeMap.get(resolvedRouteId) : null;

      return {
        id: String(live._id),
        deviceId: String(live._id),
        isOnline: Boolean(live.isOnline),
        lat: live.lat ?? null,
        lon: live.lon ?? null,
        timestamp: live.timestamp || null,
        routeId: resolvedRouteId || null,
        routeNumber: route?.routeNumber || null,
        busNumber: bus?.busNumber || null,
        seatingCapacity: bus?.seatingCapacity ?? null,
        routePermitBus: {
          busNumber: bus?.busNumber || null,
          routePermit: {
            route: {
              id: resolvedRouteId || '',
              routeNumber: route?.routeNumber || null,
            },
          },
        },
      };
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error('[GET /api/public/devices-for-live-map] error', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/public/bus/:id
router.get('/bus/:id', async (req, res) => {
  try {
    const busId = String(req.params.id);
    const bus = await Bus.findById(busId).lean();
    if (!bus) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }

    const live = await LiveVehicle.findOne({ busId }).sort({ timestamp: -1 }).lean();
    const permit = bus.routePermitId ? await RoutePermit.findById(String(bus.routePermitId)).lean() : null;
    const route = permit?.routeId ? await Route.findById(String(permit.routeId)).lean() : null;

    const payload = {
      id: live ? String(live._id) : busId,
      deviceId: live ? String(live._id) : null,
      isOnline: live ? Boolean(live.isOnline) : false,
      lat: live?.lat ?? null,
      lon: live?.lon ?? null,
      timestamp: live?.timestamp || null,
      routeId: route ? String(route._id) : null,
      routeNumber: route?.routeNumber || null,
      busNumber: bus.busNumber || null,
      seatingCapacity: bus.seatingCapacity ?? null,
      routePermitBusId: busId, // Added for frontend consistency
      routePermitBus: {
        busNumber: bus.busNumber || null,
        routePermit: {
          route: {
            id: route ? String(route._id) : '',
            routeNumber: route?.routeNumber || null,
          },
        },
      },
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error(`[GET /api/public/bus/${req.params.id}] error`, error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/public/bus-stands/districts
router.get('/bus-stands/districts', async (req, res) => {
  try {
    const districts = await BusStandContact.distinct('district');
    districts.sort();
    return res.status(200).json({ success: true, data: districts });
  } catch (err) {
    console.error('[GET /api/public/bus-stands/districts]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/bus-stands
router.get('/bus-stands', async (req, res) => {
  try {
    const { district, search } = req.query;
    const query = {};
    if (district) query.district = String(district).trim().toUpperCase();
    if (search) query.location = { $regex: String(search).trim(), $options: 'i' };
    const contacts = await BusStandContact.find(query).sort({ district: 1, location: 1 }).lean();
    return res.status(200).json({ success: true, data: contacts });
  } catch (err) {
    console.error('[GET /api/public/bus-stands]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/bus-stops/search?q=...
router.get('/bus-stops/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ success: true, data: [] });
    const stops = await BusStop.find({ name: { $regex: q, $options: 'i' } })
      .select('_id name')
      .limit(20)
      .lean();
    return res.json({ success: true, data: stops.map(s => ({ id: String(s._id), name: s.name })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/public/routes-by-stops?fromStopId=...&toStopId=...
router.get('/routes-by-stops', async (req, res) => {
  try {
    const { fromStopId, toStopId } = req.query;
    if (!fromStopId && !toStopId) return res.json({ success: true, data: [] });

    let routeIds;
    if (fromStopId && toStopId) {
      const [fromRouteIds, toRouteIds] = await Promise.all([
        RouteStop.distinct('routeId', { stopId: String(fromStopId) }),
        RouteStop.distinct('routeId', { stopId: String(toStopId) }),
      ]);
      const fromSet = new Set(fromRouteIds.map(String));
      routeIds = toRouteIds.map(String).filter(id => fromSet.has(id));
    } else {
      const stopId = String(fromStopId || toStopId);
      routeIds = (await RouteStop.distinct('routeId', { stopId })).map(String);
    }

    if (!routeIds.length) return res.json({ success: true, data: [] });

    const routes = await Route.find({ _id: { $in: routeIds } }).lean();
    const stopIds = [...new Set(routes.flatMap(r => [r.startingBusStop, r.endingBusStop].filter(Boolean)).map(String))];
    const stopsArr = await BusStop.find({ _id: { $in: stopIds } }).lean();
    const stopMap = new Map(stopsArr.map(s => [String(s._id), s]));

    return res.json({
      success: true,
      data: routes.map(r => asRouteDTO(r, stopMap.get(String(r.startingBusStop)), stopMap.get(String(r.endingBusStop)))),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* GET /api/public/live-vehicle/:deviceId — single live vehicle for journey map */
router.get('/live-vehicle/:deviceId', async (req, res) => {
  try {
    const lv = await LiveVehicle.findOne({ _id: req.params.deviceId }).lean();
    if (!lv) return res.status(404).json({ success: false, error: 'Device not found or offline.' });
    res.json({ success: true, data: lv });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

