// @ts-nocheck
const cron = require('node-cron');
const { syncStaticTransportData } = require('../services/syncStaticTransportService');
const { updateLiveVehicleLocations } = require('../services/liveLocationService');
const { autoCompleteJourneys } = require('../services/autoCompleteJourneys');
const { autoCompleteBookings } = require('../services/autoCompleteBookings');

let staticJobRunning = false;
let liveJobRunning = false;
let autoCompleteRunning = false;
let autoCompleteBookingsRunning = false;

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

  // Auto-complete journeys when bus reaches last stop — every 2 minutes
  cron.schedule('*/1 * * * *', async () => {
    if (autoCompleteRunning) return;
    autoCompleteRunning = true;
    try {
      await autoCompleteJourneys();
    } catch (err) {
      console.error('[cron][auto-complete] error', err.message);
    } finally {
      autoCompleteRunning = false;
    }
  });

  // Auto-complete bookings when the time slot has passed — every 10 minutes
  cron.schedule('*/2 * * * *', async () => {
    if (autoCompleteBookingsRunning) return;
    autoCompleteBookingsRunning = true;
    try {
      await autoCompleteBookings();
    } catch (err) {
      console.error('[cron][auto-complete-bookings] error', err.message);
    } finally {
      autoCompleteBookingsRunning = false;
    }
  });

  console.log('[cron] jobs started: static@every 1hr, live@every 15s, auto-complete-journeys@every 2min, auto-complete-bookings@every 10min');
}

module.exports = { startCronJobs };
