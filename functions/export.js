const admin = require("firebase-admin");
const fs = require("fs");

// Load your service account
const serviceAccount = require("./lk-bus-raidar-new-firebase-adminsdk-fbsvc-f0e9dd9606.json");

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportFirestore() {
  try {
    const collections = await db.listCollections();
    const data = {};

    for (const collection of collections) {
      console.log(`Exporting collection: ${collection.id}`);

      const snapshot = await collection.get();
      data[collection.id] = [];

      snapshot.forEach((doc) => {
        data[collection.id].push({
          id: doc.id,
          ...doc.data()
        });
      });
    }

    fs.writeFileSync(
      "firestore-backup.json",
      JSON.stringify(data, null, 2)
    );

    console.log("✅ Export complete → firestore-backup.json");
    process.exit();
  } catch (err) {
    console.error("Export failed:", err);
    process.exit(1);
  }
}

exportFirestore();