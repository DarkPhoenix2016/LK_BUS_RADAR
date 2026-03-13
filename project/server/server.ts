// @ts-nocheck
const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const { connectDB } = require('./config/db');
const logger = require('./utils/logger');
const publicRoutes = require('./controllers/publicController');
const adminSyncRoutes = require('./controllers/syncController');
const adminFleetRoutes = require('./controllers/adminFleetController');
const syncReviewRoutes = require('./controllers/syncReviewController');
const bookingRoutes = require('./controllers/bookingController');
const userRoutes = require('./controllers/userController');
const journeyRoutes = require('./controllers/journeyController');
const { startCronJobs } = require('./jobs/cronJobs');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cors());

app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK' });
});

app.use('/admin', adminSyncRoutes);
app.use('/admin/fleet', adminFleetRoutes);
app.use('/admin/sync-review', syncReviewRoutes);
app.use('/admin/fleet/sync-review', syncReviewRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/user', userRoutes);
app.use('/api/journey', journeyRoutes);

async function bootstrap() {
  try {
    await connectDB();

    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    startCronJobs();
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
}

bootstrap();

