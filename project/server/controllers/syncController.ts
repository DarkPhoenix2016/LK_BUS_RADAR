// @ts-nocheck
const express = require('express');
const { syncStaticTransportData } = require('../services/syncStaticTransportService');
const { updateLiveVehicleLocations } = require('../services/liveLocationService');

const router = express.Router();

router.post('/sync-static', async (req, res) => {
  try {
    const result = await syncStaticTransportData();
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[POST /admin/sync-static] error', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/update-live', async (req, res) => {
  try {
    const result = await updateLiveVehicleLocations();
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('[POST /admin/update-live] error', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
