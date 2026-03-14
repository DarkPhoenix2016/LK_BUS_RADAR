// @ts-nocheck
const express = require('express');
const Journey        = require('../models/Journey');
const LiveVehicle    = require('../models/LiveVehicle');
const Device         = require('../models/Device');
const Bus            = require('../models/Bus');
const Route          = require('../models/Route');
const User           = require('../models/User');
const BusStop        = require('../models/BusStop');
const PointTransaction = require('../models/PointTransaction');
const { requireAuth } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const {
  haversineKm,
  nearestStopInList,
  detectBusDirection,
  loadRouteStopsWithCoords,
  lookupFare
} = require('../utils/journeyUtils');

const router = express.Router();

/* ─────────────────────── GET /api/journey/active ─────────────── */

router.get('/active', requireAuth, async (req, res) => {
  try {
    const journey = await Journey.findOne({ userId: req.user.uid, status: 'active' }).lean();
    if (!journey) return res.json({ journey: null });

    const [live, stops, route] = await Promise.all([
      LiveVehicle.findOne({ _id: journey.deviceId }).lean(),
      loadRouteStopsWithCoords(journey.routeId, journey.direction),
      Route.findById(journey.routeId).lean(),
    ]);

    // Resolve bus number: prefer LiveVehicle.busId, fall back to Device.busId
    let busNumber = null;
    const busId = live?.busId || (await Device.findById(journey.deviceId).lean())?.busId;
    if (busId) {
      const bus = await Bus.findById(busId).lean();
      busNumber = bus?.busNumber || null;
    }

    // Resolve route start/end stop names for display
    let routeStartName = null;
    let routeEndName   = null;
    if (route?.startingBusStop || route?.endingBusStop) {
      const stopIds = [route.startingBusStop, route.endingBusStop].filter(Boolean);
      const busStopDocs = await BusStop.find({ _id: { $in: stopIds } }).lean();
      const stopNameMap = Object.fromEntries(busStopDocs.map(s => [String(s._id), s.name]));
      routeStartName = stopNameMap[String(route.startingBusStop)] || null;
      routeEndName   = stopNameMap[String(route.endingBusStop)]   || null;
    }

    res.json({
      journey,
      live,
      stops,
      routeNumber:    route?.routeNumber    || journey.routeNumber    || null,
      routeStartName: routeStartName        || journey.routeStartName || null,
      routeEndName:   routeEndName          || journey.routeEndName   || null,
      busNumber:      busNumber             || journey.busNumber      || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────── GET /api/journey/history ─────────────── */

router.get('/history', requireAuth, async (req, res) => {
  try {
    const page    = Math.max(1, Number(req.query.page)    || 1);
    const perPage = Math.min(50, Number(req.query.perPage) || 10);
    const { status } = req.query;

    const filter = { userId: req.user.uid };
    if (status && ['active', 'completed', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    const [total, items] = await Promise.all([
      Journey.countDocuments(filter),
      Journey.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean(),
    ]);

    res.json({ data: items, meta: { total, page, perPage, lastPage: Math.ceil(total / perPage) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────── POST /api/journey/board ──────────────── */

router.post('/board', requireAuth, async (req, res) => {
  try {
    const { deviceId, userLat, userLon } = req.body;
    const userId = req.user.uid;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required.' });

    // No double-boarding
    const existing = await Journey.findOne({ userId, status: 'active' });
    if (existing) {
      return res.status(409).json({
        error: 'You already have an active journey. Scan the QR code on the bus to exit first.',
        journeyId: String(existing._id),
      });
    }

    // Wallet balance must be >= 0
    const userCheck = await User.findById(userId).lean();
    if (!userCheck) return res.status(404).json({ error: 'User not found.' });
    if ((userCheck.pointBalance ?? 0) < 0) {
      return res.status(402).json({
        error: 'Insufficient wallet balance. Please top up before starting a journey.',
        currentBalance: userCheck.pointBalance ?? 0,
      });
    }

    // Device must exist
    const device = await Device.findById(deviceId).lean();
    if (!device) return res.status(404).json({ error: 'Bus device not found.' });

    // Live GPS required
    const live = await LiveVehicle.findOne({ _id: deviceId }).lean();
    if (!live || !live.lat) return res.status(404).json({ error: 'Bus is not broadcasting its location. Try again in a moment.' });

    const routeId = live.routeId;
    if (!routeId) return res.status(400).json({ error: 'Cannot determine the route for this bus.' });

    // Load stops for both directions
    const [upStops, downStops] = await Promise.all([
      loadRouteStopsWithCoords(routeId, 'UP'),
      loadRouteStopsWithCoords(routeId, 'DOWN'),
    ]);

    if (!upStops.length && !downStops.length) {
      return res.status(400).json({ error: 'No stops found for this route.' });
    }

    // Detect direction using bus GPS + heading
    const detected = detectBusDirection(upStops, downStops, live.lat, live.lon, live.heading);
    if (!detected) return res.status(500).json({ error: 'Could not determine bus direction.' });

    const { direction, orderedStops } = detected;

    // Resolve extra display info for denormalization
    const [route, busDoc] = await Promise.all([
      Route.findById(routeId).lean(),
      (async () => {
        const busId = live.busId || device.busId;
        return busId ? Bus.findById(busId).lean() : null;
      })(),
    ]);

    let routeStartName = null;
    let routeEndName   = null;
    if (route?.startingBusStop || route?.endingBusStop) {
      const stopIds = [route.startingBusStop, route.endingBusStop].filter(Boolean);
      const busStopDocs = await BusStop.find({ _id: { $in: stopIds } }).lean();
      const stopNameMap = Object.fromEntries(busStopDocs.map(s => [String(s._id), s.name]));
      routeStartName = stopNameMap[String(route.startingBusStop)] || null;
      routeEndName   = stopNameMap[String(route.endingBusStop)]   || null;
    }

    // Use user GPS if available AND within 500m of bus (user is on the bus) — else use bus GPS
    const hasUserGps = userLat != null && userLon != null &&
                       Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLon));
    const userNearBus = hasUserGps &&
      haversineKm(Number(userLat), Number(userLon), live.lat, live.lon) <= 0.5;
    const boardingRefLat = userNearBus ? Number(userLat) : live.lat;
    const boardingRefLon = userNearBus ? Number(userLon) : live.lon;

    const boardingStop = nearestStopInList(orderedStops, boardingRefLat, boardingRefLon);
    if (!boardingStop) return res.status(500).json({ error: 'Could not find a boarding stop near the bus.' });

    const boardingIndex = orderedStops.findIndex(s => s.stopId === boardingStop.stopId);

    const journey = await Journey.create({
      userId,
      deviceId,
      routeId,
      direction,
      boardingStopId:    boardingStop.stopId,
      boardingStopName:  boardingStop.name || '',
      boardingStopIndex: boardingIndex,
      boardingLat:       hasUserGps ? Number(userLat) : live.lat,
      boardingLon:       hasUserGps ? Number(userLon) : live.lon,
      status: 'active',
      // denormalized fields
      busNumber:      busDoc?.busNumber || null,
      routeNumber:    route?.routeNumber || null,
      routeStartName: routeStartName,
      routeEndName:   routeEndName,
    });

    const stops = orderedStops.map(s => ({
      _id:          s.stopId,
      name:         s.name,
      latitude:     s.latitude,
      longitude:    s.longitude,
      displayOrder: s.displayOrder,
    }));

    res.json({ journey, live, stops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────── POST /api/journey/alight ─────────────── */

router.post('/alight', requireAuth, async (req, res) => {
  try {
    const { deviceId, userLat, userLon } = req.body;
    const userId = req.user.uid;

    if (!deviceId) return res.status(400).json({ error: 'deviceId is required.' });

    const journey = await Journey.findOne({ userId, status: 'active', deviceId });
    if (!journey) {
      return res.status(404).json({ error: 'No active journey found for this bus. Make sure you scanned the correct bus QR.' });
    }

    // Use bus GPS to find the nearest alighting stop (bus is at the stop when passenger scans)
    const live = await LiveVehicle.findOne({ _id: deviceId }).lean();
    if (!live?.lat || !live?.lon) return res.status(400).json({ error: 'Bus GPS unavailable. Cannot determine alighting stop.' });

    // Route stops for the journey direction
    const orderedStops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);

    // Use user GPS if within 500m of bus — else use bus GPS
    const hasUserGps = userLat != null && userLon != null &&
                       Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLon));
    const userNearBus = hasUserGps &&
      haversineKm(Number(userLat), Number(userLon), live.lat, live.lon) <= 0.5;
    const alightRefLat = userNearBus ? Number(userLat) : live.lat;
    const alightRefLon = userNearBus ? Number(userLon) : live.lon;

    const nearStop = nearestStopInList(orderedStops, alightRefLat, alightRefLon);
    if (!nearStop) return res.status(500).json({ error: 'Could not find nearest stop.' });

    const alightingIndex = orderedStops.findIndex(s => s.stopId === nearStop.stopId);
    const stopsTravelled = Math.max(1, Math.abs(alightingIndex - journey.boardingStopIndex));
    const fareInfo       = await lookupFare(stopsTravelled);
    const fareCharged    = fareInfo.price;

    // Deduct fare unconditionally — allow negative balance (acts as debt cleared on next top-up)
    const updated = await User.findByIdAndUpdate(
      userId,
      { $inc: { pointBalance: -fareCharged } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    await PointTransaction.create({
      userId,
      type:         'journey_payment',
      amount:       -fareCharged,
      balanceAfter: updated.pointBalance,
      description:  `Journey: ${journey.boardingStopName} → ${nearStop.name} (${stopsTravelled} stop${stopsTravelled !== 1 ? 's' : ''})`,
      journeyId:    String(journey._id),
    });

    journey.alightingStopId    = nearStop.stopId;
    journey.alightingStopName  = nearStop.name || '';
    journey.alightingStopIndex = alightingIndex;
    journey.alightingLat       = alightRefLat;
    journey.alightingLon       = alightRefLon;
    journey.stopsTravelled     = stopsTravelled;
    journey.fareCharged        = fareCharged;
    journey.fareSectionId      = fareInfo.sectionId;
    journey.fareSectionName    = fareInfo.sectionName;
    journey.status             = 'completed';
    journey.endedAt            = new Date();
    await journey.save();

    res.json({
      journey,
      fareCharged,
      stopsTravelled,
      fareSectionName: fareInfo.sectionName,
      newBalance: updated.pointBalance,
      from: journey.boardingStopName,
      to:   nearStop.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────── GET /api/journey/:id ─────────────────── */

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const journey = await Journey.findOne({ _id: req.params.id, userId: req.user.uid }).lean();
    if (!journey) return res.status(404).json({ error: 'Journey not found.' });
    const stops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);
    const mappedStops = stops.map(s => ({
      _id: s.stopId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      displayOrder: s.displayOrder,
    }));
    res.json({
      journey,
      stops: mappedStops,
      live: null,
      routeNumber:    journey.routeNumber    || null,
      routeStartName: journey.routeStartName || null,
      routeEndName:   journey.routeEndName   || null,
      busNumber:      journey.busNumber      || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
