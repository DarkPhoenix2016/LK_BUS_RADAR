// @ts-nocheck
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { requireAdmin } = require('../middleware/authMiddleware');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const RouteStop = require('../models/RouteStop');
const RoutePermit = require('../models/RoutePermit');
const Owner = require('../models/Owner');
const RunningNumber = require('../models/RunningNumber');
const RunningSlot = require('../models/RunningSlot');
const RunningSlotStop = require('../models/RunningSlotStop');
const BusTurn = require('../models/BusTurn');
const LiveVehicle = require('../models/LiveVehicle');
const User = require('../models/User');
const Config = require('../models/Config');
const { buildAdminModifiedFlagObject, buildAdminModifiedSet } = require('../utils/diffChecker');

const BusStandContact = require('../models/BusStandContact');

const router = express.Router();
router.use(requireAdmin);

/* ─────────────────────── helpers ─────────────────────── */

function paged(data, page, perPage) {
  const total = data.length;
  const p = Math.max(1, Number(page) || 1);
  const pp = Math.max(1, Number(perPage) || 20);
  return {
    data: data.slice((p - 1) * pp, p * pp),
    meta: { total, page: p, perPage: pp, lastPage: Math.max(1, Math.ceil(total / pp)) },
  };
}

function newId() {
  return new mongoose.Types.ObjectId().toHexString();
}

function runningNumberPrefixFromBusType(busType) {
  const text = String(busType || '')
    .trim()
    .replace(/_bus$/i, '')
    .replace(/_/g, '-')
    .toUpperCase();
  return text || 'RUN';
}

async function resolveRunningNumberId(runningNumberId) {
  const raw = String(runningNumberId || '').trim();
  if (!raw) return null;

  const byId = await RunningNumber.findById(raw).lean();
  if (byId) return String(byId._id);

  const byValue = await RunningNumber.findOne({ runningNumber: raw }).lean();
  if (byValue) return String(byValue._id);

  return null;
}

async function ensureBusTurnForSlot(slotId, stops) {
  const slot = String(slotId || '').trim();
  if (!slot) return null;

  const list = Array.isArray(stops) ? stops : [];
  const findTime = (prop) => {
    for (const stop of list) {
      const value = String(stop?.[prop] || '').trim();
      if (value) return value;
    }
    return '';
  };

  const weekday = findTime('weekdayTime');
  const weekend = findTime('weekendTime');
  const loadingStartingTime = weekday || weekend || '0000';

  const existing = await BusTurn.findOne({ runningSlotId: slot });
  if (!existing) {
    const doc = new BusTurn({
      _id: newId(),
      runningSlotId: slot,
      loadingStartingTime,
    });
    await doc.save();
    return doc;
  }

  if (existing.loadingStartingTime !== loadingStartingTime) {
    existing.loadingStartingTime = loadingStartingTime;
    await existing.save();
  }
  return existing;
}

async function generateRunningNumber(busType) {
  const prefix = runningNumberPrefixFromBusType(busType);
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  const docs = await RunningNumber.find({ busType: String(busType || '') }).select({ runningNumber: 1 }).lean();
  let maxSeq = 0;

  for (const doc of docs) {
    const match = String(doc.runningNumber || '').match(regex);
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}-${String(maxSeq + 1).padStart(3, '0')}`;
}

const DEFAULT_CONFIGS = {
  bus_types: {
    label: 'Bus Types',
    values: ['private_bus', 'ctb_bus'],
  },
  stop_types: {
    label: 'Stop Types',
    values: ['bus_halt', 'bus_station', 'bus_stand', 'geofence'],
  },
  geofence_radius: {
    label: 'Geofence Radius',
    values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  },
};

async function ensureDefaultConfigs() {
  await Promise.all(
    Object.entries(DEFAULT_CONFIGS).map(([key, config]) =>
      Config.updateOne(
        { _id: key },
        { $setOnInsert: { _id: key, label: config.label, values: config.values } },
        { upsert: true }
      )
    )
  );
}

function normalizeConfigDoc(doc) {
  const key = String(doc?._id || '');
  const rawValues = Array.isArray(doc?.values) ? doc.values : [];
  return {
    key,
    label: doc?.label || DEFAULT_CONFIGS[key]?.label || key,
    values: rawValues,
  };
}

function sanitizeConfigValues(key, values) {
  const list = Array.isArray(values) ? values : [];
  const normalized = list
    .map((value) => {
      if (key === 'geofence_radius') {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }
      const text = String(value ?? '').trim();
      return text || null;
    })
    .filter((value) => value !== null);

  return [...new Set(normalized)];
}

/** RFC 9562 UUID v7 — time-ordered, uses 48-bit ms timestamp */
function uuidv7() {
  const nowMs = BigInt(Date.now());
  const rand = crypto.randomBytes(10);
  const buf = Buffer.alloc(16);
  // bytes 0-7: 48-bit timestamp in high bits, 16 random bits in low bits
  buf.writeBigUInt64BE((nowMs << 16n) | BigInt(rand.readUInt16BE(0)), 0);
  buf[6] = (buf[6] & 0x0f) | 0x70;        // version = 7
  buf[8] = (rand[2] & 0x3f) | 0x80;       // variant = 10xx
  rand.copy(buf, 9, 3, 10);
  const h = buf.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

/* ─────────────────────── ME (role verify) ────────────── */

router.get('/me', (req, res) => {
  res.json({ success: true, data: req.user });
});

/* ─────────────────────── CONFIGS ─────────────────────── */

router.get('/configs', async (req, res) => {
  try {
    await ensureDefaultConfigs();
    const docs = await Config.find({}).sort({ _id: 1 }).lean();
    const data = docs.map(normalizeConfigDoc);
    const map = data.reduce((acc, item) => {
      acc[item.key] = item.values;
      return acc;
    }, {});

    res.json({ success: true, data, map });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/configs/:id', async (req, res) => {
  try {
    const key = String(req.params.id || '').trim();
    if (!DEFAULT_CONFIGS[key]) {
      return res.status(404).json({ success: false, error: 'Unknown config key' });
    }

    const values = sanitizeConfigValues(key, req.body?.values);
    const label = DEFAULT_CONFIGS[key].label;

    const doc = await Config.findByIdAndUpdate(
      key,
      { $set: { label, values } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({ success: true, data: normalizeConfigDoc(doc) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── STATS ───────────────────────── */

router.get('/stats', async (req, res) => {
  try {
    const Journey = require('../models/Journey');
    const Booking = require('../models/Booking');

    const [
      totalBuses, totalRoutes, totalSlots, onlineDevices, totalAdmins,
      bookingsByStatus, journeysByStatus, revenueAgg,
    ] = await Promise.all([
      Bus.countDocuments(),
      Route.countDocuments(),
      RunningSlot.countDocuments(),
      LiveVehicle.countDocuments({ isOnline: true }),
      User.countDocuments({ role: 'admin' }),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Journey.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Journey.aggregate([
        { $match: { status: 'completed', fareCharged: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$fareCharged' } } },
      ]),
    ]);

    const bookingMap = Object.fromEntries(bookingsByStatus.map(b => [b._id, b.count]));
    const journeyMap = Object.fromEntries(journeysByStatus.map(j => [j._id, j.count]));

    res.json({
      success: true,
      data: {
        totalBuses,
        totalRoutes,
        runningSlots: totalSlots,
        onlineDevices,
        totalAdmins,
        bookings: {
          draft: bookingMap.draft || 0,
          confirmed: bookingMap.confirmed || 0,
          cancelled: bookingMap.cancelled || 0,
          completed: bookingMap.completed || 0,
        },
        journeys: {
          active: journeyMap.active || 0,
          completed: journeyMap.completed || 0,
          cancelled: journeyMap.cancelled || 0,
        },
        totalRevenue: revenueAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── BUSES ───────────────────────── */

router.get('/buses', async (req, res) => {
  try {
    const { page, perPage, search } = req.query;
    const buses = await Bus.find({}).lean();

    const permitIds = [...new Set(buses.map((b) => b.routePermitId).filter(Boolean))];
    const permits = permitIds.length ? await RoutePermit.find({ _id: { $in: permitIds } }).lean() : [];
    const routeIds = [...new Set(permits.map((p) => p.routeId).filter(Boolean))];
    const routes = routeIds.length ? await Route.find({ _id: { $in: routeIds } }).lean() : [];

    const permitMap = new Map(permits.map((p) => [String(p._id), p]));
    const routeMap = new Map(routes.map((r) => [String(r._id), r]));
    const onlineVehicles = await LiveVehicle.find({ isOnline: true, busId: { $ne: null } })
      .select({ busId: 1 })
      .lean();
    const onlineBusIds = new Set(onlineVehicles.map((v) => String(v.busId)));

    let data = buses.map((b) => {
      const permit = b.routePermitId ? permitMap.get(String(b.routePermitId)) : null;
      const route = permit?.routeId ? routeMap.get(String(permit.routeId)) : null;
      return {
        id: String(b._id),
        busNumber: b.busNumber || '',
        routePermitId: b.routePermitId || null,
        seatingCapacity: b.seatingCapacity ?? null,
        driverContact: b.driverContact || '',
        conductorContact: b.conductorContact || '',
        totalDistance: b.totalDistance ?? null,
        isOnline: onlineBusIds.has(String(b._id)),
        routeNumber: route?.routeNumber || null,
        permit: permit ? {
          id: String(permit._id),
          permitNumber: permit.permitNumber || '',
          routePermitType: permit.routePermitType || '',
        } : null,
      };
    });

    if (search) {
      const q = String(search).toLowerCase();
      data = data.filter((b) =>
        b.busNumber.toLowerCase().includes(q) ||
        (b.routeNumber || '').toLowerCase().includes(q) ||
        (b.permit?.permitNumber || '').toLowerCase().includes(q) ||
        (b.permit?.routePermitType || '').toLowerCase().includes(q)
      );
    }

    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/buses', async (req, res) => {
  try {
    const { busNumber, routePermitId, seatingCapacity, driverContact, conductorContact, totalDistance } = req.body;
    if (!busNumber) return res.status(400).json({ success: false, error: 'busNumber is required' });

    const doc = new Bus({
      _id: newId(),
      busNumber: String(busNumber).trim(),
      routePermitId: routePermitId || undefined,
      seatingCapacity: seatingCapacity ? Number(seatingCapacity) : undefined,
      driverContact: driverContact || undefined,
      conductorContact: conductorContact || undefined,
      totalDistance: totalDistance ? Number(totalDistance) : undefined,
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/buses/:id', async (req, res) => {
  try {
    const { busNumber, routePermitId, seatingCapacity, driverContact, conductorContact, totalDistance } = req.body;
    const updates = {};
    if (busNumber !== undefined) updates.busNumber = String(busNumber).trim();
    if (routePermitId !== undefined) updates.routePermitId = routePermitId || null;
    if (seatingCapacity !== undefined) updates.seatingCapacity = Number(seatingCapacity) || null;
    if (driverContact !== undefined) updates.driverContact = driverContact;
    if (conductorContact !== undefined) updates.conductorContact = conductorContact;
    if (totalDistance !== undefined) updates.totalDistance = Number(totalDistance) || null;

    const doc = await Bus.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Bus not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/buses/:id', async (req, res) => {
  try {
    const doc = await Bus.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Bus not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Vacant permits — permits not yet assigned to any bus */
router.get('/buses/vacant-permits', async (req, res) => {
  try {
    const { search, includeId } = req.query;
    const includedPermitId = includeId ? String(includeId) : '';
    const allPermits = await RoutePermit.find({}).lean();
    const assignedPermitIds = new Set(
      (await Bus.find({ routePermitId: { $ne: null } }).select('routePermitId').lean())
        .map((b) => String(b.routePermitId))
    );

    const routeIds = [...new Set(allPermits.map((p) => p.routeId).filter(Boolean))];
    const routes = routeIds.length ? await Route.find({ _id: { $in: routeIds } }).lean() : [];
    const routeMap = new Map(routes.map((r) => [String(r._id), r]));

    let vacant = allPermits
      .filter((p) => {
        const pid = String(p._id);
        return !assignedPermitIds.has(pid) || (includedPermitId && pid === includedPermitId);
      })
      .map((p) => {
        const route = p.routeId ? routeMap.get(String(p.routeId)) : null;
        return {
          id: String(p._id),
          permitNumber: p.permitNumber || '',
          routePermitType: p.routePermitType || '',
          routeNumber: route?.routeNumber || '',
          routeName: route ? `${route.routeNumber}` : '',
        };
      });

    if (search) {
      const q = String(search).toLowerCase();
      vacant = vacant.filter(
        (p) =>
          p.permitNumber.toLowerCase().includes(q) ||
          p.routeNumber.toLowerCase().includes(q) ||
          p.routePermitType.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: vacant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── OWNERS ──────────────────────── */

router.get('/owners', async (req, res) => {
  try {
    const { page, perPage, search } = req.query;
    let owners = await Owner.find({}).lean();

    if (search) {
      const q = String(search).toLowerCase();
      owners = owners.filter(
        (o) =>
          (o.name || '').toLowerCase().includes(q) ||
          (o.email || '').toLowerCase().includes(q) ||
          (o.phone || '').toLowerCase().includes(q) ||
          (o.nic || '').toLowerCase().includes(q)
      );
    }

    const data = owners.map((o) => ({
      id: String(o._id),
      name: o.name || '',
      email: o.email || '',
      phone: o.phone || '',
      nic: o.nic || '',
      createdAt: o.createdAt,
    }));

    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/owners', async (req, res) => {
  try {
    const { name, email, phone, nic } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    const doc = new Owner({
      _id: uuidv7(),
      name: String(name).trim(),
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      nic: nic?.trim() || undefined,
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/owners/:id', async (req, res) => {
  try {
    const { name, email, phone, nic } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (email !== undefined) updates.email = email?.trim() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (nic !== undefined) updates.nic = nic?.trim() || null;
    const doc = await Owner.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Owner not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/owners/:id', async (req, res) => {
  try {
    await Owner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Owners search dropdown — for permit creation */
router.get('/owners/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase();
    const owners = await Owner.find({}).limit(100).lean();
    const filtered = q
      ? owners.filter((o) =>
          (o.name || '').toLowerCase().includes(q) ||
          (o.nic || '').toLowerCase().includes(q) ||
          (o.email || '').toLowerCase().includes(q)
        )
      : owners;
    res.json({
      success: true,
      data: filtered.slice(0, 20).map((o) => ({
        id: String(o._id),
        name: o.name || '',
        nic: o.nic || '',
        email: o.email || '',
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── PERMITS ─────────────────────── */

router.get('/permits', async (req, res) => {
  try {
    const { page, perPage, search } = req.query;
    const permits = await RoutePermit.find({}).lean();
    const routeIds = [...new Set(permits.map((p) => p.routeId).filter(Boolean))];
    const ownerIds = [...new Set(permits.map((p) => p.ownerId).filter(Boolean))];

    const [routes, owners] = await Promise.all([
      routeIds.length ? Route.find({ _id: { $in: routeIds } }).lean() : [],
      ownerIds.length ? Owner.find({ _id: { $in: ownerIds } }).lean() : [],
    ]);

    const routeMap = new Map(routes.map((r) => [String(r._id), r]));
    const ownerMap = new Map(owners.map((o) => [String(o._id), o]));

    let data = permits.map((p) => {
      const route = p.routeId ? routeMap.get(String(p.routeId)) : null;
      const owner = p.ownerId ? ownerMap.get(String(p.ownerId)) : null;
      return {
        id: String(p._id),
        permitNumber: p.permitNumber || '',
        routePermitType: p.routePermitType || '',
        routeId: p.routeId || null,
        ownerId: p.ownerId || null,
        routeNumber: route?.routeNumber || '',
        ownerName: owner?.name || '',
        ownerNic: owner?.nic || '',
      };
    });

    if (search) {
      const q = String(search).toLowerCase();
      data = data.filter(
        (p) =>
          p.permitNumber.toLowerCase().includes(q) ||
          p.routePermitType.toLowerCase().includes(q) ||
          p.routeNumber.toLowerCase().includes(q) ||
          p.ownerName.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/permits', async (req, res) => {
  try {
    const { permitNumber, routePermitType, routeId, ownerId } = req.body;
    if (!permitNumber?.trim()) return res.status(400).json({ success: false, error: 'permitNumber is required' });
    const doc = new RoutePermit({
      _id: newId(),
      permitNumber: String(permitNumber).trim(),
      routePermitType: routePermitType?.trim() || '',
      routeId: routeId || null,
      ownerId: ownerId || null,
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/permits/:id', async (req, res) => {
  try {
    const { permitNumber, routePermitType, routeId, ownerId } = req.body;
    const updates = {};
    if (permitNumber !== undefined) updates.permitNumber = String(permitNumber).trim();
    if (routePermitType !== undefined) updates.routePermitType = routePermitType;
    if (routeId !== undefined) updates.routeId = routeId || null;
    if (ownerId !== undefined) updates.ownerId = ownerId || null;
    const doc = await RoutePermit.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Permit not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/permits/:id', async (req, res) => {
  try {
    await RoutePermit.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── ROUTES ──────────────────────── */

router.get('/routes', async (req, res) => {
  try {
    const { page, perPage, search } = req.query;
    const routes = await Route.find({}).lean();

    const stopIds = new Set();
    routes.forEach((r) => {
      if (r.startingBusStop) stopIds.add(String(r.startingBusStop));
      if (r.endingBusStop) stopIds.add(String(r.endingBusStop));
    });
    const stops = stopIds.size ? await BusStop.find({ _id: { $in: [...stopIds] } }).lean() : [];
    const stopMap = new Map(stops.map((s) => [String(s._id), s]));

    const stopCounts = await RouteStop.aggregate([
      { $group: { _id: '$routeId', count: { $sum: 1 } } },
    ]);
    const stopCountMap = new Map(stopCounts.map((sc) => [String(sc._id), sc.count]));

    let data = routes.map((r) => ({
      id: String(r._id),
      routeNumber: r.routeNumber || '',
      routeDistance: r.routeDistance ?? null,
      isActive: r.isActive ?? true,
      priceFullJourney: r.priceFullJourney ?? null,
      averageCompletionTime: r.averageCompletionTime ?? null,
      stopCount: stopCountMap.get(String(r._id)) || 0,
      startStop: stopMap.get(String(r.startingBusStop)) || null,
      endStop: stopMap.get(String(r.endingBusStop)) || null,
    }));

    if (search) {
      const q = String(search).toLowerCase();
      data = data.filter(
        (r) =>
          r.routeNumber.toLowerCase().startsWith(q) ||
          (r.startStop?.name || '').toLowerCase().startsWith(q) ||
          (r.endStop?.name || '').toLowerCase().startsWith(q)
      );
    }

    data.sort((a, b) => String(a.routeNumber).localeCompare(String(b.routeNumber), undefined, { numeric: true }));

    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/routes', async (req, res) => {
  try {
    const { routeNumber, routeDistance, startingBusStop, endingBusStop, isActive } = req.body;
    if (!routeNumber) return res.status(400).json({ success: false, error: 'routeNumber is required' });

    const doc = new Route({
      _id: newId(),
      routeNumber: String(routeNumber).trim(),
      routeDistance: routeDistance ? Number(routeDistance) : null,
      startingBusStop: startingBusStop || null,
      endingBusStop: endingBusStop || null,
      isActive: isActive !== false,
      adminModified: buildAdminModifiedFlagObject(['routeNumber', 'routeDistance', 'startingBusStop', 'endingBusStop', 'isActive']),
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/routes/:id', async (req, res) => {
  try {
    const { routeNumber, routeDistance, startingBusStop, endingBusStop, isActive, priceFullJourney, averageCompletionTime } = req.body;
    const updates = {};
    if (routeNumber !== undefined) updates.routeNumber = String(routeNumber).trim();
    if (routeDistance !== undefined) updates.routeDistance = routeDistance ? Number(routeDistance) : null;
    if (startingBusStop !== undefined) updates.startingBusStop = startingBusStop || null;
    if (endingBusStop !== undefined) updates.endingBusStop = endingBusStop || null;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (priceFullJourney !== undefined) updates.priceFullJourney = priceFullJourney != null ? Number(priceFullJourney) : null;
    if (averageCompletionTime !== undefined) updates.averageCompletionTime = averageCompletionTime != null ? Number(averageCompletionTime) : null;

    const fields = Object.keys(updates);
    const doc = await Route.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updates, ...buildAdminModifiedSet(fields) } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Route not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Route stops — returns both UP and DOWN stops for a route */
router.get('/routes/:id/stops', async (req, res) => {
  try {
    const routeId = req.params.id;
    const [upStops, downStops] = await Promise.all([
      RouteStop.find({ routeId, direction: 'UP' }).sort({ displayOrder: 1 }).lean(),
      RouteStop.find({ routeId, direction: 'DOWN' }).sort({ displayOrder: 1 }).lean(),
    ]);

    const allStopIds = [...new Set([...upStops, ...downStops].map((s) => String(s.stopId)))];
    const busStops = allStopIds.length ? await BusStop.find({ _id: { $in: allStopIds } }).lean() : [];
    const stopMap = new Map(busStops.map((s) => [String(s._id), s]));

    const enrich = (rows) =>
      rows.map((rs) => ({
        id: String(rs._id),
        stopId: String(rs.stopId),
        displayOrder: rs.displayOrder,
        name: stopMap.get(String(rs.stopId))?.name || '',
        latitude: stopMap.get(String(rs.stopId))?.latitude ?? null,
        longitude: stopMap.get(String(rs.stopId))?.longitude ?? null,
      }));

    res.json({ success: true, data: { up: enrich(upStops), down: enrich(downStops) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Replace all stops for a route+direction */
router.put('/routes/:id/stops', async (req, res) => {
  try {
    const routeId = req.params.id;
    const { direction, stops } = req.body; // direction: 'UP'|'DOWN', stops: [{stopId, displayOrder}]

    if (!['UP', 'DOWN'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction must be UP or DOWN' });
    }
    if (!Array.isArray(stops)) {
      return res.status(400).json({ success: false, error: 'stops must be an array' });
    }

    const unique = [];
    const seen = new Set();
    for (let i = 0; i < stops.length; i += 1) {
      const stopId = String(stops[i]?.stopId || '').trim();
      if (!stopId || seen.has(stopId)) continue;
      seen.add(stopId);
      unique.push({
        routeId,
        stopId,
        direction,
        displayOrder: Number(stops[i]?.displayOrder ?? unique.length + 1),
        adminModified: buildAdminModifiedFlagObject(['displayOrder']),
      });
    }

    await RouteStop.deleteMany({ routeId, direction });

    if (unique.length > 0) {
      await RouteStop.insertMany(unique, { ordered: true });
    }

    res.json({ success: true, count: unique.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Routes search dropdown — for permit creation */
router.get('/routes/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').toLowerCase();
    const routes = await Route.find({}).limit(200).lean();

    const stopIds = new Set();
    routes.forEach((r) => {
      if (r.startingBusStop) stopIds.add(String(r.startingBusStop));
      if (r.endingBusStop) stopIds.add(String(r.endingBusStop));
    });
    const stops = stopIds.size ? await BusStop.find({ _id: { $in: [...stopIds] } }).lean() : [];
    const stopMap = new Map(stops.map((s) => [String(s._id), s]));

    let data = routes.map((r) => {
      const start = r.startingBusStop ? stopMap.get(String(r.startingBusStop)) : null;
      const end = r.endingBusStop ? stopMap.get(String(r.endingBusStop)) : null;
      return {
        id: String(r._id),
        routeNumber: r.routeNumber || '',
        startName: start?.name || '',
        endName: end?.name || '',
      };
    });

    if (q) {
      data = data.filter(
        (r) =>
          r.routeNumber.toLowerCase().includes(q) ||
          r.startName.toLowerCase().includes(q) ||
          r.endName.toLowerCase().includes(q)
      );
    }

    res.json({ success: true, data: data.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── BUS STOPS (lookup) ──────────── */

router.post('/bus-stops', async (req, res) => {
  try {
    const { name, latitude, longitude, type, geoFenceRadius } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
    const doc = new BusStop({
      _id: newId(),
      name: String(name).trim(),
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
      type: type || undefined,
      geoFenceRadius: geoFenceRadius ? Number(geoFenceRadius) : undefined,
      adminModified: buildAdminModifiedFlagObject(['name', 'latitude', 'longitude', 'type', 'geoFenceRadius']),
    });
    await doc.save();
    res.status(201).json({
      success: true,
      data: {
        id: String(doc._id),
        name: doc.name,
        latitude: doc.latitude ?? null,
        longitude: doc.longitude ?? null,
        type: doc.type || '',
        geoFenceRadius: doc.geoFenceRadius ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/bus-stops/:id', async (req, res) => {
  try {
    const { name, latitude, longitude, type, geoFenceRadius } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (latitude !== undefined) updates.latitude = latitude != null && latitude !== '' ? Number(latitude) : null;
    if (longitude !== undefined) updates.longitude = longitude != null && longitude !== '' ? Number(longitude) : null;
    if (type !== undefined) updates.type = type || null;
    if (geoFenceRadius !== undefined) updates.geoFenceRadius = geoFenceRadius != null && geoFenceRadius !== '' ? Number(geoFenceRadius) : null;

    const fields = Object.keys(updates);
    const doc = await BusStop.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updates, ...buildAdminModifiedSet(fields) } },
      { new: true }
    );

    if (!doc) return res.status(404).json({ success: false, error: 'Bus stop not found' });

    res.json({
      success: true,
      data: {
        id: String(doc._id),
        name: doc.name || '',
        latitude: doc.latitude ?? null,
        longitude: doc.longitude ?? null,
        type: doc.type || '',
        geoFenceRadius: doc.geoFenceRadius ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/bus-stops/:id', async (req, res) => {
  try {
    const doc = await BusStop.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Bus stop not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/bus-stops', async (req, res) => {
  try {
    const { search, lat, lng, radius, limit: limitParam } = req.query;
    const parsedLimit = Number(limitParam);
    const limit = Math.min(
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30,
      10000
    );
    const mapStop = (s) => ({
      id: String(s._id),
      name: s.name || '',
      latitude: s.latitude ?? null,
      longitude: s.longitude ?? null,
      type: s.type || '',
      geoFenceRadius: s.geoFenceRadius ?? null,
    });

    // Proximity search by lat/lng
    if (lat && lng) {
      const la = Number(lat), lo = Number(lng);
      const r = Number(radius) || 0.03;
      const nearby = await BusStop.find({
        latitude: { $gte: la - r, $lte: la + r },
        longitude: { $gte: lo - r, $lte: lo + r },
      }).limit(limit).lean();
      nearby.sort((a, b) => {
        const da = Math.hypot((a.latitude || 0) - la, (a.longitude || 0) - lo);
        const db = Math.hypot((b.latitude || 0) - la, (b.longitude || 0) - lo);
        return da - db;
      });
      return res.json({ success: true, data: nearby.map(mapStop) });
    }

    const query = search ? { name: { $regex: `^${String(search)}`, $options: 'i' } } : {};
    const stops = await BusStop.find(query).limit(limit).lean();
    res.json({ success: true, data: stops.map(mapStop) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── TIMETABLES ──────────────────── */

/* Running Numbers */
router.get('/timetables/running-numbers', async (req, res) => {
  try {
    const { page, perPage, search } = req.query;
    let numbers = await RunningNumber.find({}).lean();
    if (search) {
      const q = String(search).toLowerCase();
      numbers = numbers.filter((n) => (n.runningNumber || '').toLowerCase().startsWith(q));
    }
    const data = numbers.map((n) => ({ id: String(n._id), runningNumber: n.runningNumber || '', busType: n.busType || '' }));
    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/timetables/running-numbers', async (req, res) => {
  try {
    const { runningNumber, busType } = req.body;
    if (!runningNumber) return res.status(400).json({ success: false, error: 'runningNumber is required' });
    const doc = new RunningNumber({
      _id: newId(),
      runningNumber: String(runningNumber).trim(),
      busType: busType || '',
      adminModified: buildAdminModifiedFlagObject(['runningNumber', 'busType']),
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/timetables/running-numbers/:id', async (req, res) => {
  try {
    const { runningNumber, busType } = req.body;
    const updates = {};
    if (runningNumber !== undefined) updates.runningNumber = String(runningNumber).trim();
    if (busType !== undefined) updates.busType = busType;
    const fields = Object.keys(updates);
    const doc = await RunningNumber.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updates, ...buildAdminModifiedSet(fields) } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Running number not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Route buses — buses linked to this route via permit */
router.get('/timetables/route-buses', async (req, res) => {
  try {
    const { routeId } = req.query;
    if (!routeId) return res.status(400).json({ success: false, error: 'routeId is required' });

    const permits = await RoutePermit.find({ routeId: String(routeId) }).select({ _id: 1 }).lean();
    const permitIds = permits.map((p) => String(p._id));

    if (permitIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const buses = await Bus.find({ routePermitId: { $in: permitIds } }).lean();
    const data = buses
      .map((b) => ({
        id: String(b._id),
        busNumber: b.busNumber || '',
        seatingCapacity: typeof b.seatingCapacity === 'number' ? b.seatingCapacity : null,
      }))
      .sort((a, b) => a.busNumber.localeCompare(b.busNumber, undefined, { numeric: true }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Running Slots */
router.get('/timetables/slots', async (req, res) => {
  try {
    const { routeId, page, perPage } = req.query;
    if (!routeId) return res.status(400).json({ success: false, error: 'routeId is required' });

    const slots = await RunningSlot.find({ routeId: String(routeId) }).lean();
    const rnIds = [...new Set(slots.map((s) => String(s.runningNumberId)).filter(Boolean))];
    const busIds = [...new Set(slots.map((s) => String(s.busId || '')).filter(Boolean))];
    const rns = rnIds.length
      ? await RunningNumber.find({ $or: [{ _id: { $in: rnIds } }, { runningNumber: { $in: rnIds } }] }).lean()
      : [];
    const buses = busIds.length ? await Bus.find({ _id: { $in: busIds } }).lean() : [];
    const rnById = new Map(rns.map((n) => [String(n._id), n]));
    const rnByValue = new Map();
    rns.forEach((n) => {
      if (n.runningNumber) rnByValue.set(String(n.runningNumber), n);
    });
    const busMap = new Map(buses.map((b) => [String(b._id), b]));

    const data = slots.map((s) => {
      const rn = rnById.get(String(s.runningNumberId)) || rnByValue.get(String(s.runningNumberId));
      const mappedBus = s.busId ? busMap.get(String(s.busId)) : null;
      return {
        id: String(s._id),
        routeId: s.routeId,
        runningNumberId: s.runningNumberId,
        busId: s.busId || null,
        busNumber: mappedBus?.busNumber || '',
        direction: s.direction || '',
        runningNumber: rn?.runningNumber || '',
        busType: rn?.busType || '',
        maxBookableSeats: typeof s.maxBookableSeats === 'number' ? s.maxBookableSeats : 10,
      };
    });

    res.json({ success: true, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/timetables/slots', async (req, res) => {
  try {
    const { routeId, runningNumberId, direction, busId } = req.body;
    if (!routeId || !runningNumberId || !direction) {
      return res.status(400).json({ success: false, error: 'routeId, runningNumberId, direction are required' });
    }

    const resolvedRunningNumberId = await resolveRunningNumberId(runningNumberId);
    if (!resolvedRunningNumberId) {
      return res.status(400).json({ success: false, error: 'runningNumber not found' });
    }

    const doc = new RunningSlot({
      _id: newId(),
      routeId: String(routeId),
      runningNumberId: resolvedRunningNumberId,
      busId: busId ? String(busId) : null,
      direction: String(direction).toUpperCase(),
      adminModified: buildAdminModifiedFlagObject(['routeId', 'runningNumberId', 'busId', 'direction']),
    });
    await doc.save();
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/timetables/slots/create-with-stops', async (req, res) => {
  try {
    const { routeId, direction, busType, busId, stops, maxBookableSeats } = req.body;

    if (!routeId || !direction || !busType) {
      return res.status(400).json({ success: false, error: 'routeId, direction, and busType are required' });
    }
    if (!['UP', 'DOWN'].includes(String(direction).toUpperCase())) {
      return res.status(400).json({ success: false, error: 'direction must be UP or DOWN' });
    }
    if (!Array.isArray(stops) || stops.length === 0) {
      return res.status(400).json({ success: false, error: 'stops are required' });
    }

    const normalizedStops = stops.map((stop) => ({
      stopId: String(stop?.stopId || '').trim(),
      weekdayTime: String(stop?.weekdayTime || '').trim(),
      weekendTime: String(stop?.weekendTime || '').trim(),
    })).filter((stop) => stop.stopId);

    if (normalizedStops.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one valid stop is required' });
    }

    // Compute max bookable seats: floor(lowestBusCapacity / 5), capped at 10
    const permits = await RoutePermit.find({ routeId: String(routeId) }).select({ _id: 1 }).lean();
    const permitIds = permits.map((p) => String(p._id));
    const routeBuses = permitIds.length > 0
      ? await Bus.find({ routePermitId: { $in: permitIds } }).select({ seatingCapacity: 1 }).lean()
      : [];
    const capacities = routeBuses
      .map((b) => b.seatingCapacity)
      .filter((c) => typeof c === 'number' && c > 0);
    const serverMaxSeats = capacities.length > 0
      ? Math.min(10, Math.floor(Math.min(...capacities) / 5))
      : 10;
    const finalMaxSeats = maxBookableSeats !== undefined
      ? Math.max(1, Math.min(serverMaxSeats, Number(maxBookableSeats) || serverMaxSeats))
      : serverMaxSeats;

    const runningNumberId = newId();
    const slotId = newId();
    const runningNumber = await generateRunningNumber(busType);

    const runningNumberDoc = new RunningNumber({
      _id: runningNumberId,
      runningNumber,
      busType: String(busType),
      adminModified: buildAdminModifiedFlagObject(['runningNumber', 'busType']),
    });

    const slotDoc = new RunningSlot({
      _id: slotId,
      routeId: String(routeId),
      runningNumberId,
      busId: busId ? String(busId) : null,
      direction: String(direction).toUpperCase(),
      adminModified: buildAdminModifiedFlagObject(['routeId', 'runningNumberId', 'busId', 'direction']),
      maxBookableSeats: finalMaxSeats,
    });

    const slotStops = normalizedStops.map((stop) => ({
      slotId,
      stopId: stop.stopId,
      weekdayTime: stop.weekdayTime,
      weekendTime: stop.weekendTime,
      adminModified: buildAdminModifiedFlagObject(['weekdayTime', 'weekendTime']),
    }));

    await runningNumberDoc.save();
    await slotDoc.save();
    await RunningSlotStop.insertMany(slotStops, { ordered: true });

    await ensureBusTurnForSlot(slotId, slotStops);

    res.status(201).json({
      success: true,
      data: {
        runningNumberId,
        runningNumber,
        slotId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/timetables/slots/:id', async (req, res) => {
  try {
    const { runningNumberId, direction, busId, maxBookableSeats } = req.body;
    const updates = {};
    if (runningNumberId !== undefined) {
      const resolved = await resolveRunningNumberId(runningNumberId);
      if (!resolved) return res.status(400).json({ success: false, error: 'runningNumber not found' });
      updates.runningNumberId = resolved;
    }
    if (direction !== undefined) updates.direction = String(direction).toUpperCase();
    if (busId !== undefined) updates.busId = busId ? String(busId) : null;
    if (maxBookableSeats !== undefined) updates.maxBookableSeats = Math.max(1, Math.min(10, Number(maxBookableSeats) || 10));
    const fields = Object.keys(updates);
    const doc = await RunningSlot.findByIdAndUpdate(
      req.params.id,
      { $set: { ...updates, ...buildAdminModifiedSet(fields) } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Slot not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/timetables/slots/:id', async (req, res) => {
  try {
    await RunningSlot.findByIdAndDelete(req.params.id);
    await RunningSlotStop.deleteMany({ slotId: req.params.id });
    await BusTurn.deleteMany({ runningSlotId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Slot stops — get/replace times for a specific slot */
router.get('/timetables/slots/:id/stops', async (req, res) => {
  try {
    const rows = await RunningSlotStop.find({ slotId: req.params.id }).lean();
    const stopIds = rows.map((r) => String(r.stopId));
    const busStops = stopIds.length ? await BusStop.find({ _id: { $in: stopIds } }).lean() : [];
    const stopMap = new Map(busStops.map((s) => [String(s._id), s]));
    const data = rows.map((r) => ({
      id: String(r._id),
      stopId: String(r.stopId),
      name: stopMap.get(String(r.stopId))?.name || '',
      weekdayTime: r.weekdayTime || '',
      weekendTime: r.weekendTime || '',
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/timetables/slots/:id/stops', async (req, res) => {
  try {
    const slotId = req.params.id;
    const { stops } = req.body; // [{stopId, weekdayTime, weekendTime}]
    if (!Array.isArray(stops)) return res.status(400).json({ success: false, error: 'stops must be an array' });

    await RunningSlotStop.deleteMany({ slotId });
    if (stops.length > 0) {
      await RunningSlotStop.insertMany(
        stops.map((s) => ({
          slotId,
          stopId: String(s.stopId),
          weekdayTime: s.weekdayTime || '',
          weekendTime: s.weekendTime || '',
          adminModified: buildAdminModifiedFlagObject(['weekdayTime', 'weekendTime']),
        })),
        { ordered: false }
      );
    }

    await ensureBusTurnForSlot(slotId, stops);
    res.json({ success: true, count: stops.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── USERS (admin management) ─────── */

router.get('/users', async (req, res) => {
  try {
    const { page, perPage, role, search } = req.query;
    const query = {};
    if (role && ['admin', 'user'].includes(String(role))) query.role = String(role);
    if (search) {
      const re = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ email: re }, { displayName: re }];
    }
    const [allUsers, adminCount, userCount] = await Promise.all([
      User.find(query).lean(),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ $or: [{ role: 'user' }, { role: { $exists: false } }] }),
    ]);
    const data = allUsers.map((u) => ({
      id: String(u._id),
      _id: String(u._id),
      email: u.email,
      linkedEmail: u.linkedEmail || u.email || '',
      displayName: u.displayName || '',
      role: u.role || 'user',
    }));
    res.json({ success: true, counts: { admin: adminCount, user: userCount, total: adminCount + userCount }, ...paged(data, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'role must be user or admin' });
    }
    const doc = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: { id: String(doc._id), email: doc.email, role: doc.role } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Bus Stand Contacts ──────────────────────────────────────────────────────

// GET /admin/fleet/bus-stands/districts
router.get('/bus-stands/districts', async (req, res) => {
  try {
    const districts = await BusStandContact.distinct('district');
    districts.sort();
    res.json({ success: true, data: districts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /admin/fleet/bus-stands
router.get('/bus-stands', async (req, res) => {
  try {
    const { district, search } = req.query;
    const query = {};
    if (district) query.district = String(district).trim().toUpperCase();
    if (search) query.location = { $regex: String(search).trim(), $options: 'i' };
    const all = await BusStandContact.find(query).sort({ district: 1, location: 1 }).lean();
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 50;
    res.json({ success: true, ...paged(all, page, perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /admin/fleet/bus-stands
router.post('/bus-stands', async (req, res) => {
  try {
    const { location, district, phoneNumber } = req.body;
    if (!location || !district || !phoneNumber) {
      return res.status(400).json({ success: false, error: 'location, district, and phoneNumber are required.' });
    }
    const doc = await BusStandContact.create({
      location: String(location).trim(),
      district: String(district).trim().toUpperCase(),
      phoneNumber: String(phoneNumber).trim(),
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /admin/fleet/bus-stands/:id
router.put('/bus-stands/:id', async (req, res) => {
  try {
    const { location, district, phoneNumber } = req.body;
    const updates = {};
    if (location !== undefined) updates.location = String(location).trim();
    if (district !== undefined) updates.district = String(district).trim().toUpperCase();
    if (phoneNumber !== undefined) updates.phoneNumber = String(phoneNumber).trim();

    const doc = await BusStandContact.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /admin/fleet/bus-stands/:id
router.delete('/bus-stands/:id', async (req, res) => {
  try {
    const doc = await BusStandContact.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin Bookings ──────────────────────────────────────────────────────────

const Booking = require('../models/Booking');

// GET /admin/fleet/bookings
router.get('/bookings', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage || 25)));
    const { status, search } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { bookingReference: { $regex: String(search), $options: 'i' } },
        { passengerName: { $regex: String(search), $options: 'i' } },
        { passengerEmail: { $regex: String(search), $options: 'i' } },
      ];
    }

    const total = await Booking.countDocuments(query);
    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    const routeIds = [...new Set(bookings.map(b => b.routeId).filter(Boolean))];
    const routes = await Route.find({ _id: { $in: routeIds } }).lean();
    const stopIds = [...new Set(routes.flatMap(r => [r.startingBusStop, r.endingBusStop].filter(Boolean)).map(String))];
    const stops = await BusStop.find({ _id: { $in: stopIds } }).lean();
    const stopMap = new Map(stops.map(s => [String(s._id), s]));
    const routeMap = new Map(routes.map(r => [String(r._id), r]));

    const enriched = bookings.map(b => {
      const route = routeMap.get(String(b.routeId));
      const startStop = route ? stopMap.get(String(route.startingBusStop)) : null;
      const endStop = route ? stopMap.get(String(route.endingBusStop)) : null;
      return {
        ...b,
        id: String(b._id),
        route: route ? {
          routeNumber: route.routeNumber,
          start: startStop ? { name: startStop.name } : null,
          end: endStop ? { name: endStop.name } : null,
        } : null,
      };
    });

    res.json({ success: true, data: enriched, meta: { total, page, perPage, lastPage: Math.ceil(total / perPage) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /admin/fleet/bookings/:id/status
router.patch('/bookings/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'cancelled', 'completed', 'draft'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const doc = await Booking.findByIdAndUpdate(req.params.id, { $set: { status } }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, data: { id: String(doc._id), status: doc.status } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Fare Sections ─────────────────────── */

const FareSection = require('../models/FareSection');

router.get('/fare-sections', async (req, res) => {
  try {
    const sections = await FareSection.find().sort({ stops: 1 }).lean();
    res.json({ success: true, data: sections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/fare-sections', async (req, res) => {
  try {
    const { section, stops, price } = req.body;
    if (section == null || stops == null || price == null) {
      return res.status(400).json({ success: false, error: 'section, stops, and price are required.' });
    }
    const doc = await FareSection.create({ section: Number(section), stops: Number(stops), price: Number(price) });
    res.json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'A fare section with that section number already exists.' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/fare-sections/:id', async (req, res) => {
  try {
    const { section, stops, price } = req.body;
    const update = {};
    if (section != null) update.section = Number(section);
    if (stops   != null) update.stops   = Number(stops);
    if (price   != null) update.price   = Number(price);
    const doc = await FareSection.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!doc) return res.status(404).json({ success: false, error: 'Fare section not found.' });
    res.json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'A fare section with that section number already exists.' });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/fare-sections/:id', async (req, res) => {
  try {
    const doc = await FareSection.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Fare section not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Admin Journeys ────────────────────── */

const Journey = require('../models/Journey');

router.get('/journeys', async (req, res) => {
  try {
    const { status, page, perPage: pp, search } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { userEmail: { $regex: q, $options: 'i' } },
        { routeNumber: { $regex: q, $options: 'i' } },
        { busNumber: { $regex: q, $options: 'i' } },
        { boardingStopName: { $regex: q, $options: 'i' } },
        { userId: { $regex: q, $options: 'i' } },
      ];
    }

    const p   = Math.max(1, Number(page) || 1);
    const per = Math.min(100, Math.max(1, Number(pp) || 25));
    const total = await Journey.countDocuments(filter);
    const journeys = await Journey.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * per)
      .limit(per)
      .lean();

    // Enrich with user/device/route info
    const userIds   = [...new Set(journeys.map(j => j.userId).filter(Boolean))];
    const deviceIds = [...new Set(journeys.map(j => j.deviceId).filter(Boolean))];
    const routeIds  = [...new Set(journeys.map(j => j.routeId).filter(Boolean))];

    const [users, devices, routes] = await Promise.all([
      User.find({ _id: { $in: userIds } }).lean(),
      Device.find ? Device.find({ _id: { $in: deviceIds } }).lean() : Promise.resolve([]),
      Route.find({ _id: { $in: routeIds } }).lean(),
    ]);

    const userMap   = Object.fromEntries(users.map(u => [String(u._id), u]));
    const deviceMap = Object.fromEntries(devices.map(d => [String(d._id), d]));
    const routeMap  = Object.fromEntries(routes.map(r => [String(r._id), r]));

    // Enrich devices with bus numbers
    const busIds = [...new Set(devices.map(d => d.busId).filter(Boolean))];
    const buses  = await Bus.find({ _id: { $in: busIds } }).lean();
    const busMap = Object.fromEntries(buses.map(b => [String(b._id), b]));

    const enriched = journeys.map(j => {
      const user   = userMap[j.userId];
      const device = deviceMap[j.deviceId];
      const route  = routeMap[j.routeId];
      const bus    = device ? busMap[String(device.busId)] : null;
      return {
        ...j,
        id: String(j._id),
        userEmail:   user?.email   || j.userId,
        userName:    user?.displayName || null,
        busNumber:   bus?.busNumber    || null,
        routeNumber: route?.routeNumber || null,
        fareSectionName: j.fareSectionName || null,
      };
    });

    res.json({ success: true, data: enriched, meta: { total, page: p, perPage: per, lastPage: Math.max(1, Math.ceil(total / per)) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/journeys/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalToday, activeCount, revenueAgg, routeAgg, avgStops] = await Promise.all([
      Journey.countDocuments({ createdAt: { $gte: todayStart } }),
      Journey.countDocuments({ status: 'active' }),
      Journey.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$fareCharged' } } },
      ]),
      Journey.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$routeId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      Journey.aggregate([
        { $match: { status: 'completed', stopsTravelled: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$stopsTravelled' } } },
      ]),
    ]);

    // Enrich top routes with route numbers
    const topRouteIds = routeAgg.map(r => r._id).filter(Boolean);
    const topRoutes   = await Route.find({ _id: { $in: topRouteIds } }).lean();
    const routeMap    = Object.fromEntries(topRoutes.map(r => [String(r._id), r]));

    res.json({
      success: true,
      stats: {
        totalToday,
        activeJourneys:   activeCount,
        revenueToday:     revenueAgg[0]?.total || 0,
        avgStopsPerJourney: avgStops[0]?.avg ? parseFloat(avgStops[0].avg.toFixed(1)) : 0,
        topRoutes: routeAgg.map(r => ({
          routeId:     r._id,
          routeNumber: routeMap[r._id]?.routeNumber || r._id,
          count:       r.count,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Journey stops (for admin stop-selection) ─── */

router.get('/journeys/:id/stops', async (req, res) => {
  try {
    const journey = await Journey.findById(req.params.id).lean();
    if (!journey) return res.status(404).json({ success: false, error: 'Journey not found.' });
    const { loadRouteStopsWithCoords } = require('../utils/journeyUtils');
    const stops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);
    const mapped = stops.map(s => ({
      stopId: s.stopId,
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      displayOrder: s.displayOrder,
    }));
    res.json({ success: true, journey, stops: mapped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Cancel Journey (admin) ─── */

router.patch('/journeys/:id/cancel', async (req, res) => {
  try {
    const journey = await Journey.findById(req.params.id);
    if (!journey) return res.status(404).json({ success: false, error: 'Journey not found.' });
    if (journey.status !== 'active') {
      return res.status(400).json({ success: false, error: `Journey is already ${journey.status}.` });
    }
    journey.status = 'cancelled';
    journey.endedAt = new Date();
    await journey.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Complete Journey (admin) ─── */

router.patch('/journeys/:id/complete', async (req, res) => {
  try {
    const { alightingStopId } = req.body;
    if (!alightingStopId) {
      return res.status(400).json({ success: false, error: 'alightingStopId is required.' });
    }

    const journey = await Journey.findById(req.params.id);
    if (!journey) return res.status(404).json({ success: false, error: 'Journey not found.' });
    if (journey.status !== 'active') {
      return res.status(400).json({ success: false, error: `Journey is already ${journey.status}.` });
    }

    const { loadRouteStopsWithCoords, lookupFare } = require('../utils/journeyUtils');
    const PointTransaction = require('../models/PointTransaction');

    const orderedStops = await loadRouteStopsWithCoords(journey.routeId, journey.direction);
    const alightingIdx = orderedStops.findIndex(s => s.stopId === alightingStopId);
    if (alightingIdx === -1) {
      return res.status(400).json({ success: false, error: 'Stop not found in route.' });
    }

    const alightStop = orderedStops[alightingIdx];
    const stopsTravelled = Math.max(1, Math.abs(alightingIdx - journey.boardingStopIndex));
    const fareInfo = await lookupFare(stopsTravelled);
    const fareCharged = fareInfo.price;

    const updated = await User.findByIdAndUpdate(
      journey.userId,
      { $inc: { pointBalance: -fareCharged } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'User not found.' });

    await PointTransaction.create({
      userId: journey.userId,
      type: 'journey_payment',
      amount: -fareCharged,
      balanceAfter: updated.pointBalance,
      description: `Journey: ${journey.boardingStopName} → ${alightStop.name} (${stopsTravelled} stop${stopsTravelled !== 1 ? 's' : ''}) [Admin completed]`,
      journeyId: String(journey._id),
    });

    journey.alightingStopId = alightStop.stopId;
    journey.alightingStopName = alightStop.name || '';
    journey.alightingStopIndex = alightingIdx;
    journey.stopsTravelled = stopsTravelled;
    journey.fareCharged = fareCharged;
    journey.fareSectionId = fareInfo.sectionId;
    journey.fareSectionName = fareInfo.sectionName;
    journey.status = 'completed';
    journey.endedAt = new Date();
    await journey.save();

    res.json({ success: true, fareCharged, stopsTravelled, fareSectionName: fareInfo.sectionName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ─────────────────────── Devices list (for Journey QR codes) ─── */

const Device = require('../models/Device');

router.get('/devices', async (req, res) => {
  try {
    const devices = await Device.find().lean();
    const busIds = [...new Set(devices.map(d => d.busId).filter(Boolean))];
    const buses  = await Bus.find({ _id: { $in: busIds } }).lean();
    const busMap = Object.fromEntries(buses.map(b => [String(b._id), b]));

    const routePermitIds = [...new Set(buses.map(b => b.routePermitId).filter(Boolean))];
    const permits = await RoutePermit.find({ _id: { $in: routePermitIds } }).lean();
    const permitMap = Object.fromEntries(permits.map(p => [String(p._id), p]));

    const routeIds = [...new Set(permits.map(p => p.routeId).filter(Boolean))];
    const routes  = await Route.find({ _id: { $in: routeIds } }).lean();
    const routeMap = Object.fromEntries(routes.map(r => [String(r._id), r]));

    const liveMap = Object.fromEntries(
      (await LiveVehicle.find({ _id: { $in: devices.map(d => d._id) } }).lean())
        .map(lv => [String(lv._id), lv])
    );

    const rows = devices.map(d => {
      const bus     = busMap[String(d.busId)] || null;
      const permit  = bus ? permitMap[String(bus.routePermitId)] : null;
      const route   = permit ? routeMap[String(permit.routeId)] : null;
      const live    = liveMap[String(d._id)] || null;
      return {
        id:          String(d._id),
        imei:        d.imei,
        isActive:    d.isActive,
        busNumber:   bus?.busNumber   || null,
        routeNumber: route?.routeNumber || null,
        routeId:     route ? String(route._id) : null,
        isOnline:    live?.isOnline    ?? false,
      };
    });

    const { data, meta } = paged(rows, req.query.page, req.query.perPage || 1000);
    res.json({ success: true, data, meta });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
