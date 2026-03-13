// @ts-nocheck
const express = require('express');
const Journey        = require('../models/Journey');
const FareSection    = require('../models/FareSection');
const LiveVehicle    = require('../models/LiveVehicle');
const RouteStop      = require('../models/RouteStop');
const BusStop        = require('../models/BusStop');
const Device         = require('../models/Device');
const Bus            = require('../models/Bus');
const Route          = require('../models/Route');
const User           = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

/* ─────────────────────── geo helpers ─────────────────────── */

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180;
  const lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function angleDiffAbs(a, b) {
  return Math.abs(((a - b + 180) % 360) - 180);
}

function nearestStopInList(stops, lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stops) {
    const sLat = parseFloat(s.latitude ?? s.lat ?? 0);
    const sLon = parseFloat(s.longitude ?? s.lon ?? 0);
    if (!sLat && !sLon) continue;
    const d = haversineKm(lat, lon, sLat, sLon);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/**
 * Detect bus direction using heading (if available) or nearest stop distance.
 */
function detectBusDirection(upStops, downStops, busLat, busLon, busHeading) {
  const nearUp   = nearestStopInList(upStops,   busLat, busLon);
  const nearDown = nearestStopInList(downStops,  busLat, busLon);

  if (!nearUp && !nearDown) return null;
  if (!nearUp)   return { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
  if (!nearDown) return { direction: 'UP',   orderedStops: upStops,   nearStop: nearUp   };

  if (busHeading != null && busHeading !== 0) {
    const upIdx   = upStops.findIndex(s => s.stopId === nearUp.stopId);
    const downIdx = downStops.findIndex(s => s.stopId === nearDown.stopId);
    const nextUp   = upStops[upIdx + 1];
    const nextDown = downStops[downIdx + 1];

    if (nextUp && nextDown) {
      const bUp   = bearingDeg(busLat, busLon, parseFloat(nextUp.latitude),   parseFloat(nextUp.longitude));
      const bDown = bearingDeg(busLat, busLon, parseFloat(nextDown.latitude),  parseFloat(nextDown.longitude));
      if (angleDiffAbs(busHeading, bUp) < angleDiffAbs(busHeading, bDown)) {
        return { direction: 'UP',   orderedStops: upStops,   nearStop: nearUp   };
      } else {
        return { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
      }
    }
  }

  const distUp   = haversineKm(busLat, busLon, parseFloat(nearUp.latitude),   parseFloat(nearUp.longitude));
  const distDown = haversineKm(busLat, busLon, parseFloat(nearDown.latitude),  parseFloat(nearDown.longitude));
  return distUp <= distDown
    ? { direction: 'UP',   orderedStops: upStops,   nearStop: nearUp   }
    : { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
}

/* ─────────────────────── shared data loader ─────────────────── */

async function loadRouteStopsWithCoords(routeId, direction) {
  const routeStops = await RouteStop.find({ routeId, direction })
    .sort({ displayOrder: 1 })
    .lean();
  const stopIds = routeStops.map(rs => rs.stopId);
  const busStops = await BusStop.find({ _id: { $in: stopIds } }).lean();
  const stopMap = Object.fromEntries(busStops.map(s => [String(s._id), s]));
  return routeStops
    .map(rs => ({ ...stopMap[String(rs.stopId)], stopId: String(rs.stopId), displayOrder: rs.displayOrder }))
    .filter(s => s.latitude);
}

/**
 * Fare lookup.
 * Falls back to a default per-stop rate when no FareSection rules are configured.
 * Default: 10 pts per stop, minimum 20 pts.
 */
async function lookupFare(stopsTravelled) {
  const sections = await FareSection.find().sort({ stops: 1 }).lean();
  if (sections.length === 0) {
    // No fare rules configured — use a sensible default
    return Math.max(20, stopsTravelled * 10);
  }
  for (const fs of sections) {
    if (stopsTravelled <= fs.stops) return fs.price;
  }
  return sections[sections.length - 1].price;
}

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

    // Use user GPS (if valid) to find the nearest boarding stop; fall back to bus GPS
    const hasUserGps = userLat != null && userLon != null &&
                       Number.isFinite(Number(userLat)) && Number.isFinite(Number(userLon));
    const boardingRefLat = hasUserGps ? Number(userLat) : live.lat;
    const boardingRefLon = hasUserGps ? Number(userLon) : live.lon;

    const boardingStop = nearestStopInList(orderedStops, boardingRefLat, boardingRefLon);
    if (!boardingStop) return res.status(500).json({ error: 'Could not find a boarding stop near your location.' });

    const boardingIndex = orderedStops.findIndex(s => s.stopId === boardingStop.stopId);

    const journey = await Journey.create({
      userId,
      deviceId,
      routeId,
      direction,
      boardingStopId:    boardingStop.stopId,
      boardingStopName:  boardingStop.name || '',
      boardingStopIndex: boardingIndex,
      boardingLat:       hasUserGps ? Number(userLat) : null,
      boardingLon:       hasUserGps ? Number(userLon) : null,
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

    // Use user GPS, then bus GPS as fallback
    const live = await LiveVehicle.findOne({ _id: deviceId }).lean();
    const refLat = userLat ?? live?.lat;
    const refLon = userLon ?? live?.lon;
    if (!refLat || !refLon) return res.status(400).json({ error: 'Cannot determine your location. Please allow GPS access.' });

    // Route stops for the journey direction
    const orderedStops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);

    const nearStop = nearestStopInList(orderedStops, Number(refLat), Number(refLon));
    if (!nearStop) return res.status(500).json({ error: 'Could not find nearest stop.' });

    const alightingIndex = orderedStops.findIndex(s => s.stopId === nearStop.stopId);
    const stopsTravelled = Math.max(1, Math.abs(alightingIndex - journey.boardingStopIndex));
    const fareCharged    = await lookupFare(stopsTravelled);

    // Deduct points atomically
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if ((user.pointBalance ?? 0) < fareCharged) {
      return res.status(402).json({
        error: `Insufficient points. Fare is ${fareCharged} pts, you have ${user.pointBalance ?? 0} pts. Please top up your wallet.`,
        fareRequired: fareCharged,
        currentBalance: user.pointBalance ?? 0,
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: userId, pointBalance: { $gte: fareCharged } },
      { $inc: { pointBalance: -fareCharged } },
      { new: true }
    );
    if (!updated) {
      return res.status(402).json({ error: 'Insufficient points. Please top up your wallet.' });
    }

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
    journey.alightingLat       = Number(refLat);
    journey.alightingLon       = Number(refLon);
    journey.stopsTravelled     = stopsTravelled;
    journey.fareCharged        = fareCharged;
    journey.status             = 'completed';
    journey.endedAt            = new Date();
    await journey.save();

    res.json({
      journey,
      fareCharged,
      stopsTravelled,
      newBalance: updated.pointBalance,
      from: journey.boardingStopName,
      to:   nearStop.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
