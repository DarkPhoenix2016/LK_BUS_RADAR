// @ts-nocheck
const express = require('express');
const User = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

function isValidSriLankanNIC(nic) {
  return /^[0-9]{9}[VXvx]$/.test(nic) || /^[0-9]{12}$/.test(nic);
}

function isValidSriLankanPhone(phone) {
  return /^(?:\+94|94|0)?[0-9]{9,10}$/.test(phone.replace(/[\s\-]/g, ''));
}

// GET /api/user/profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const authEmail = req.user.email ? String(req.user.email).trim().toLowerCase() : '';
    const profile = await User.findByIdAndUpdate(
      req.user.uid,
      {
        $setOnInsert: { _id: req.user.uid, role: 'user', displayName: req.user.name || '' },
        $set: {
          ...(authEmail ? { email: authEmail, linkedEmail: authEmail } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    console.error('[GET /api/user/profile]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/user/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { displayName, nic, phone, photoURL } = req.body;
    const authEmail = req.user.email ? String(req.user.email).trim().toLowerCase() : '';
    const updates = {};

    if (authEmail) {
      updates.email = authEmail;
      updates.linkedEmail = authEmail;
    }

    if (displayName !== undefined) updates.displayName = String(displayName).trim();

    if (nic !== undefined) {
      const v = String(nic).trim().toUpperCase();
      if (v && !isValidSriLankanNIC(v)) {
        return res.status(400).json({ success: false, error: 'Invalid NIC format. Use 9 digits + V/X (old) or 12 digits (new).' });
      }
      updates.nic = v;
    }

    if (phone !== undefined) {
      const v = String(phone).trim();
      if (v && !isValidSriLankanPhone(v)) {
        return res.status(400).json({ success: false, error: 'Invalid Sri Lankan phone number.' });
      }
      updates.phone = v;
    }

    if (photoURL !== undefined) updates.photoURL = String(photoURL).trim();

    const profile = await User.findByIdAndUpdate(
      req.user.uid,
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    console.error('[PUT /api/user/profile]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/user/points
router.get('/points', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(50, Math.max(1, Number(req.query.perPage || 20)));

    const user = await User.findById(req.user.uid).select('pointBalance').lean();
    const balance = user ? (user.pointBalance || 0) : 0;

    const total = await PointTransaction.countDocuments({ userId: req.user.uid });
    const transactions = await PointTransaction.find({ userId: req.user.uid })
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        balance,
        transactions,
        meta: { total, page, perPage, lastPage: Math.ceil(total / perPage) },
      },
    });
  } catch (err) {
    console.error('[GET /api/user/points]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/user/points/topup
router.post('/points/topup', requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0 || amount > 10000 || !Number.isInteger(amount)) {
      return res.status(400).json({ success: false, error: 'Amount must be a whole number between 1 and 10,000.' });
    }

    const updated = await User.findByIdAndUpdate(
      req.user.uid,
      { $inc: { pointBalance: amount } },
      { new: true, upsert: false }
    );

    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });

    await PointTransaction.create({
      userId: req.user.uid,
      type: 'topup',
      amount,
      balanceAfter: updated.pointBalance,
      description: `Top-up via simulated gateway`,
    });

    return res.status(200).json({
      success: true,
      data: { balance: updated.pointBalance },
    });
  } catch (err) {
    console.error('[POST /api/user/points/topup]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
