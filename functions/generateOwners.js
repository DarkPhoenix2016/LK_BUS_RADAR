const { MongoClient } = require("mongodb");

const uri = "mongodb://127.0.0.1:27017";
const dbName = "LKBusRadar";

async function generateOwners() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(dbName);

    const routePermits = db.collection("routepermits");
    const owners = db.collection("owners");

    // Get unique ownerIds
    const ownerIds = await routePermits.distinct("ownerId");

    console.log(`Found ${ownerIds.length} owners`);

    const ownerDocs = ownerIds.map((id) => ({
      _id: id,
      name: "N/A",
      email: "N/A",
      phone: "N/A",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (ownerDocs.length > 0) {
      await owners.insertMany(ownerDocs);
      console.log(`${ownerDocs.length} owners inserted`);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

generateOwners();