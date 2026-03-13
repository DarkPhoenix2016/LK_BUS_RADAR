// @ts-nocheck
const admin = require('../utils/firebaseAdmin');
const User = require('../models/User');

async function syncUserFromToken(decoded) {
  const uid = String(decoded.uid || '');
  if (!uid) return;

  const authEmail = decoded.email ? String(decoded.email).trim().toLowerCase() : '';

  const updates = {};
  if (authEmail) {
    updates.email = authEmail;
    updates.linkedEmail = authEmail;
  }

  if (Object.keys(updates).length === 0) return;

  try {
    await User.findByIdAndUpdate(
      uid,
      {
        $setOnInsert: { _id: uid, role: 'user' },
        $set: updates,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000 && authEmail) {
      // Legacy fallback: keep records consistent even if an older document
      // already exists for this email under another id.
      await User.findOneAndUpdate(
        { $or: [{ email: authEmail }, { linkedEmail: authEmail }] },
        { $set: updates },
        { new: true }
      );
      return;
    }
    throw err;
  }
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email ? String(decoded.email).trim().toLowerCase() : '';
    await syncUserFromToken(decoded);
    req.user = { uid: decoded.uid, email, name: decoded.name || '' };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid token' });
  }
}

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: missing token' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email ? String(decoded.email).trim().toLowerCase() : '';
    await syncUserFromToken(decoded);

    // Role check against DB — try by UID first, fall back to email
    let user = await User.findById(decoded.uid).lean();
    if (!user && email) {
      user = await User.findOne({
        $or: [{ email }, { linkedEmail: email }],
      }).lean();
    }

    console.log('[requireAdmin] uid=%s email=%s found=%s role=%s', decoded.uid, email, !!user, user?.role);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: admin role required' });
    }

    req.user = { uid: decoded.uid, email, name: decoded.name || '', role: 'admin' };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid token' });
  }
}

module.exports = { requireAuth, requireAdmin };
