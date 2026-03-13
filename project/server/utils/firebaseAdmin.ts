// @ts-nocheck
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const env = require('../config/env');

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    // Dev fallback when Firebase Admin env vars are not set
    console.warn('[firebaseAdmin] Firebase Admin env vars not set — auth will fail');
    admin.initializeApp({ projectId: 'dev-placeholder' });
  }
}

module.exports = admin;
