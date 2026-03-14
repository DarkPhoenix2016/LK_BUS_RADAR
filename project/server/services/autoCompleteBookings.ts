// @ts-nocheck
const Booking = require('../models/Booking');
const RunningSlotStop = require('../models/RunningSlotStop');
const logger = require('../utils/logger');

/**
 * Service to automatically mark past bookings as "completed".
 * A booking is considered passed if its travel date and the last stop's time have passed.
 */
async function autoCompleteBookings() {
  try {
    const now = new Date();
    // Only process draft or confirmed bookings
    const activeBookings = await Booking.find({
      status: { $in: ['draft', 'confirmed'] },
      travelDate: { $lte: now }
    }).lean();

    if (activeBookings.length === 0) return;

    for (const booking of activeBookings) {
      try {
        // Find the latest time for this slot
        const slotStops = await RunningSlotStop.find({ slotId: booking.slotId }).lean();
        if (slotStops.length === 0) {
            // If no stop times are found, and the travel date was yesterday or earlier, mark as completed
            const yesterday = new Date();
            yesterday.setHours(0,0,0,0);
            if (booking.travelDate < yesterday) {
                await Booking.findByIdAndUpdate(booking._id, { status: 'completed' });
                logger.info(`Booking ${booking.bookingReference} auto-completed (no slot stops found, past date)`);
            }
            continue;
        }

        // Determine if it's weekend (Saturday=6, Sunday=0)
        const isWeekend = booking.travelDate.getDay() === 0 || booking.travelDate.getDay() === 6;
        
        // Find the latest time (HHmm format)
        let latestTimeStr = '0000';
        for (const stop of slotStops) {
          const timeStr = isWeekend ? (stop.weekendTime || stop.weekdayTime) : stop.weekdayTime;
          if (timeStr && timeStr > latestTimeStr) {
            latestTimeStr = timeStr;
          }
        }

        // Construct the completion timestamp for the booking
        const completionDate = new Date(booking.travelDate);
        const hours = parseInt(latestTimeStr.substring(0, 2), 10);
        const minutes = parseInt(latestTimeStr.substring(2, 4), 10);
        completionDate.setHours(hours, minutes, 0, 0);

        // Add a buffer (e.g., 1 hour) to ensure the bus has actually finished the route
        const bufferedCompletion = new Date(completionDate.getTime() + 60 * 60 * 1000);

        if (now > bufferedCompletion) {
          await Booking.findByIdAndUpdate(booking._id, { status: 'completed' });
          logger.info(`Booking ${booking.bookingReference} auto-completed (slot time passed)`);
        }
      } catch (innerErr) {
        logger.error(`Error processing auto-complete for booking ${booking._id}: ${innerErr.message}`);
      }
    }
  } catch (err) {
    logger.error(`[autoCompleteBookings] error: ${err.message}`);
  }
}

module.exports = { autoCompleteBookings };
