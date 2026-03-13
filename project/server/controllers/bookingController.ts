// @ts-nocheck
const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const RunningSlot = require('../models/RunningSlot');
const PointTransaction = require('../models/PointTransaction');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

async function getBookedCount(slotId, travelDate) {
  const dayStart = new Date(travelDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(travelDate);
  dayEnd.setHours(23, 59, 59, 999);
  return Booking.countDocuments({
    slotId,
    travelDate: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ['confirmed', 'draft'] },
  });
}

async function upsertUser(uid, email, name) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  await User.findByIdAndUpdate(
    uid,
    {
      $setOnInsert: { _id: uid },
      $set: {
        ...(normalizedEmail ? { email: normalizedEmail, linkedEmail: normalizedEmail } : {}),
        displayName: name || '',
      },
    },
    { upsert: true, new: true }
  );
}

async function enrichBooking(booking) {
  const plain = booking.toObject ? booking.toObject() : { ...booking };
  try {
    const route = await Route.findById(plain.routeId).lean();
    if (!route) return { ...plain, id: String(plain._id) };

    const [startStop, endStop] = await Promise.all([
      route.startingBusStop ? BusStop.findById(route.startingBusStop).lean() : null,
      route.endingBusStop ? BusStop.findById(route.endingBusStop).lean() : null,
    ]);

    return {
      ...plain,
      id: String(plain._id),
      route: {
        routeNumber: route.routeNumber,
        priceFullJourney: route.priceFullJourney ?? null,
        start: startStop ? { name: startStop.name } : null,
        end: endStop ? { name: endStop.name } : null,
      },
    };
  } catch {
    return { ...plain, id: String(plain._id) };
  }
}

// POST /api/booking/create
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { routeId, slotId, travelDate, direction, passengerName, passengerEmail } = req.body;

    if (!routeId || !slotId || !travelDate || !direction || !passengerName || !passengerEmail) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!['up', 'down'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction must be "up" or "down"' });
    }

    const travel = new Date(travelDate);
    if (isNaN(travel.getTime()) || travel < new Date(new Date().setHours(0, 0, 0, 0))) {
      return res.status(400).json({ success: false, error: 'travelDate must be today or in the future' });
    }

    const [route, slot] = await Promise.all([
      Route.findById(routeId).lean(),
      RunningSlot.findById(slotId).lean(),
    ]);

    if (!route) return res.status(404).json({ success: false, error: 'Route not found' });
    if (!slot) return res.status(404).json({ success: false, error: 'Time slot not found' });

    const booked = await getBookedCount(slotId, travel);
    const maxSeats = slot.maxBookableSeats ?? 10;
    if (booked >= maxSeats) {
      return res.status(400).json({ success: false, error: 'No seats available for this slot on the selected date.' });
    }

    await upsertUser(req.user.uid, req.user.email, req.user.name);

    const booking = await Booking.create({
      userId: req.user.uid,
      routeId,
      slotId,
      travelDate: travel,
      direction,
      passengerName,
      passengerEmail,
      status: 'draft',
      fareAmount: route.priceFullJourney ?? null,
    });

    const enriched = await enrichBooking(booking);
    return res.status(201).json({ success: true, data: enriched });
  } catch (err) {
    console.error('[POST /api/booking/create]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/booking/my
router.get('/my', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(50, Math.max(1, Number(req.query.perPage || 20)));

    const total = await Booking.countDocuments({ userId: req.user.uid });
    const bookings = await Booking.find({ userId: req.user.uid })
      .sort({ travelDate: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    const enriched = await Promise.all(bookings.map((b) => enrichBooking(b)));

    return res.status(200).json({
      success: true,
      data: enriched,
      meta: { total, page, perPage, lastPage: Math.ceil(total / perPage) },
    });
  } catch (err) {
    console.error('[GET /api/booking/my]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/booking/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.uid }).lean();
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const enriched = await enrichBooking(booking);
    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    console.error('[GET /api/booking/:id]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/booking/:id/cancel
router.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.uid });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking already cancelled' });
    }

    if (booking.travelDate < new Date()) {
      return res.status(400).json({ success: false, error: 'Cannot cancel past bookings' });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelReason = req.body.reason || '';
    await booking.save();

    const enriched = await enrichBooking(booking);
    return res.status(200).json({ success: true, data: enriched });
  } catch (err) {
    console.error('[POST /api/booking/:id/cancel]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/booking/:id/pay
router.post('/:id/pay', requireAuth, async (req, res) => {
  try {
    const { result, method } = req.body; // result: 'pass'|'fail', method?: 'points'|'card'
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.uid });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (booking.status !== 'draft') {
      return res.status(400).json({ success: false, error: 'Only draft bookings can be paid' });
    }

    // Points payment path
    if (method === 'points') {
      const fare = booking.fareAmount;
      if (!fare || fare <= 0) {
        return res.status(400).json({ success: false, error: 'This booking does not have a valid fare for points payment.' });
      }

      const user = await User.findById(req.user.uid);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      if ((user.pointBalance || 0) < fare) {
        return res.status(400).json({ success: false, error: `Insufficient points. You need ${fare} points but have ${user.pointBalance || 0}.` });
      }

      // Atomic deduct
      const updated = await User.findByIdAndUpdate(
        req.user.uid,
        { $inc: { pointBalance: -fare } },
        { new: true }
      );

      await PointTransaction.create({
        userId: req.user.uid,
        type: 'booking_payment',
        amount: -fare,
        balanceAfter: updated.pointBalance,
        description: `Booking payment — ${booking.bookingReference}`,
        bookingId: String(booking._id),
      });

      // Race condition check for points path
      const bookedPts = await getBookedCount(booking.slotId, booking.travelDate);
      const slotPts = await RunningSlot.findById(booking.slotId).lean();
      const maxSeatsPts = slotPts?.maxBookableSeats ?? 10;
      if (bookedPts >= maxSeatsPts) {
        return res.status(400).json({ success: false, error: 'No seats available — slot is now full.' });
      }

      booking.status = 'confirmed';
      booking.paidWithPoints = true;
      await booking.save();

      const enriched = await enrichBooking(booking);
      return res.status(200).json({ success: true, data: enriched });
    }

    // Card simulation path
    if (result === 'pass') {
      // Race condition check for card path
      const bookedCard = await getBookedCount(booking.slotId, booking.travelDate);
      const slotCard = await RunningSlot.findById(booking.slotId).lean();
      const maxSeatsCard = slotCard?.maxBookableSeats ?? 10;
      if (bookedCard >= maxSeatsCard) {
        return res.status(400).json({ success: false, error: 'No seats available — slot is now full.' });
      }

      booking.status = 'confirmed';
      await booking.save();
      const enriched = await enrichBooking(booking);
      return res.status(200).json({ success: true, data: enriched });
    } else {
      return res.status(200).json({ success: false, error: 'Payment failed. Booking kept as draft.' });
    }
  } catch (err) {
    console.error('[POST /api/booking/:id/pay]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
