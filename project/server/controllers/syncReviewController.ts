// @ts-nocheck
const express = require('express');
const SyncReview = require('../models/SyncReview');
const Route = require('../models/Route');
const BusStop = require('../models/BusStop');
const RouteStop = require('../models/RouteStop');
const RunningNumber = require('../models/RunningNumber');
const RunningSlot = require('../models/RunningSlot');
const RunningSlotStop = require('../models/RunningSlotStop');
const { requireAdmin } = require('../middleware/authMiddleware');
const { buildAdminModifiedUnset } = require('../utils/diffChecker');

const router = express.Router();
router.use(requireAdmin);

const MODEL_MAP = {
  Route,
  BusStop,
  RouteStop,
  RunningNumber,
  RunningSlot,
  RunningSlotStop,
};

/* ── GET /admin/sync-review ──────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const { status = 'pending', routeId, entityType, page = '1', perPage = '50' } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (routeId) filter.routeId = routeId;
    if (entityType) filter.entityType = entityType;

    const skip = (parseInt(page) - 1) * parseInt(perPage);
    const [items, total] = await Promise.all([
      SyncReview.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(perPage)).lean(),
      SyncReview.countDocuments(filter),
    ]);

    res.json({ success: true, data: items, total, page: parseInt(page), perPage: parseInt(perPage) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── GET /admin/sync-review/stats ───────────────────────── */
router.get('/stats', async (req, res) => {
  try {
    const [pendingTotal, byType] = await Promise.all([
      SyncReview.countDocuments({ status: 'pending' }),
      SyncReview.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$entityType', count: { $sum: 1 } } },
      ]),
    ]);

    const byTypeMap = {};
    for (const row of byType) byTypeMap[row._id] = row.count;

    res.json({ success: true, pendingTotal, byType: byTypeMap });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── PATCH /admin/sync-review/:id/approve ───────────────── */
router.patch('/:id/approve', async (req, res) => {
  try {
    const review = await SyncReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Not found' });
    if (review.status !== 'pending') return res.json({ success: true, message: 'Already resolved' });

    const Model = MODEL_MAP[review.entityType];
    if (!Model) return res.status(400).json({ success: false, error: `Unknown entity type: ${review.entityType}` });

    const result = await Model.updateOne(review.queryFilter, {
      $set: { [review.field]: review.incomingValue },
      $unset: buildAdminModifiedUnset([review.field]),
    });
    if (!result?.matchedCount) {
      return res.status(409).json({ success: false, error: 'Target record no longer matches the pending review item' });
    }

    await SyncReview.updateOne({ _id: review._id }, { status: 'approved', resolvedAt: new Date() });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── PATCH /admin/sync-review/:id/ignore ────────────────── */
router.patch('/:id/ignore', async (req, res) => {
  try {
    const review = await SyncReview.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, error: 'Not found' });
    if (review.status !== 'pending') return res.json({ success: true, message: 'Already resolved' });

    await SyncReview.updateOne({ _id: review._id }, { status: 'ignored', resolvedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── PATCH /admin/sync-review/batch ─────────────────────── */
// body: { action: 'approve' | 'ignore', ids?: string[], routeId?: string, entityType?: string }
router.patch('/batch', async (req, res) => {
  try {
    const { action, ids, routeId, entityType } = req.body;
    if (!['approve', 'ignore'].includes(action)) {
      return res.status(400).json({ success: false, error: 'action must be approve or ignore' });
    }

    const filter = { status: 'pending' };
    if (ids?.length) filter._id = { $in: ids };
    if (routeId) filter.routeId = routeId;
    if (entityType) filter.entityType = entityType;

    if (action === 'approve') {
      const items = await SyncReview.find(filter).lean();
      const applyOps = items.map(async (item) => {
        const Model = MODEL_MAP[item.entityType];
        if (!Model) return;
        return Model.updateOne(item.queryFilter, {
          $set: { [item.field]: item.incomingValue },
          $unset: buildAdminModifiedUnset([item.field]),
        });
      });
      const results = await Promise.all(applyOps);
      const failed = results.some((result) => result && !result.matchedCount);
      if (failed) {
        return res.status(409).json({ success: false, error: 'One or more target records no longer match the pending review items' });
      }
    }

    await SyncReview.updateMany(filter, { status: action === 'approve' ? 'approved' : 'ignored', resolvedAt: new Date() });

    const count = await SyncReview.countDocuments({ ...filter, status: action === 'approve' ? 'approved' : 'ignored' });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
