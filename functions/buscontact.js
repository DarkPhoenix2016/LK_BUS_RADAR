const { MongoClient } = require('mongodb');

// Connection URL for local MongoDB
const url = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(url);

// Database and Collection names
const dbName = 'LKBusRadar';
const collectionName = 'busstandcontacts';

// The extracted data
const busStandContacts = [
  { location: "Ambalangoda", district: "GALLE DISTRICT", phoneNumber: "0912256700" },
  { location: "Baddegama", district: "GALLE DISTRICT", phoneNumber: "0913021255" },
  { location: "Batapola (Uduwila)", district: "GALLE DISTRICT", phoneNumber: "0912260092" },
  { location: "Elpitiya", district: "GALLE DISTRICT", phoneNumber: "0912290448" },
  { location: "Galle", district: "GALLE DISTRICT", phoneNumber: "0912234191" },
  { location: "Imaduwa", district: "GALLE DISTRICT", phoneNumber: "0912287012" },
  { location: "Mapalagama", district: "GALLE DISTRICT", phoneNumber: "0913021258" },
  { location: "Pitigala", district: "GALLE DISTRICT", phoneNumber: "0912290983" },
  { location: "Uragasmanhandiya", district: "GALLE DISTRICT", phoneNumber: "0913021256" },
  { location: "Wanduramba", district: "GALLE DISTRICT", phoneNumber: "0912294320" },
  { location: "Neluwa", district: "GALLE DISTRICT", phoneNumber: "0473021251" },
  { location: "Ambalantota", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473620307" },
  { location: "Beliatta", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473620307" },
  { location: "Hambantota", district: "HAMBANTOTA DISTRICT", phoneNumber: "0472220780" },
  { location: "Middeniya", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473620303" },
  { location: "Sooriyawewa", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473620304" },
  { location: "Tangalle", district: "HAMBANTOTA DISTRICT", phoneNumber: "0472240853" },
  { location: "Tissamaharama", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473479923" },
  { location: "Walasmulla", district: "HAMBANTOTA DISTRICT", phoneNumber: "0473620302" },
  { location: "Weeraketiya", district: "HAMBANTOTA DISTRICT", phoneNumber: "0472235281" },
  { location: "Akuressa", district: "MATARA DISTRICT", phoneNumber: "0413004006" },
  { location: "Matara", district: "MATARA DISTRICT", phoneNumber: "0412220848" },
  { location: "Mulatiyana", district: "MATARA DISTRICT", phoneNumber: "0412268066" },
  { location: "Urubokka", district: "MATARA DISTRICT", phoneNumber: "0413004005" },
  { location: "Weligama", district: "MATARA DISTRICT", phoneNumber: "0413004002" },
  { location: "Deniyaya", district: "MATARA DISTRICT", phoneNumber: "0413004006" },
  { location: "Katharagama CTB", district: "MATARA DISTRICT", phoneNumber: "0412226489" }
];

async function seedDatabase() {
  try {
    // Connect to the local MongoDB server
    await client.connect();
    console.log('Connected successfully to local MongoDB server.');

    // Select the database and collection
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Insert the array of documents
    const result = await collection.insertMany(busStandContacts);
    
    console.log(`Success! Inserted ${result.insertedCount} documents into the '${collectionName}' collection.`);

  } catch (error) {
    console.error('An error occurred during insertion:', error);
  } finally {
    // Close the connection
    await client.close();
    console.log('Database connection closed.');
  }
}

// Execute the function
seedDatabase();