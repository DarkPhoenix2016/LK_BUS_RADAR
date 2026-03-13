// @ts-nocheck
const cron = require('node-cron');
const { syncStaticTransportData } = require('../services/syncStaticTransportService');
const { updateLiveVehicleLocations } = require('../services/liveLocationService');

let staticJobRunning = false;
let liveJobRunning = false;

function startCronJobs() {
  // Static data sync — every 1 hour
  cron.schedule('0 * * * *', async () => {
    if (staticJobRunning) {
      console.log('[cron][static] skipped - previous run still active');
      return;
    }

    staticJobRunning = true;
    try {
      console.log('[cron][static] started');
      await syncStaticTransportData();
    } catch (error) {
      console.error('[cron][static] error', error.message);
    } finally {
      staticJobRunning = false;
    }
  });

  // Live location sync — every 15 seconds
  cron.schedule('*/15 * * * * *', async () => {
    if (liveJobRunning) {
      return;
    }

    liveJobRunning = true;
    try {
      await updateLiveVehicleLocations();
    } catch (error) {
      console.error('[cron][live] error', error.message);
    } finally {
      liveJobRunning = false;
    }
  });

  console.log('[cron] jobs started: static@every 1hr, live@every 15s');
}

module.exports = { startCronJobs };
