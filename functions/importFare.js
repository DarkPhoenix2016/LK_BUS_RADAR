const { MongoClient } = require("mongodb")
const fs = require("fs")

const uri = "mongodb://127.0.0.1:27017"
const dbName = "LKBusRadar"

async function importFare() {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const db = client.db(dbName)
    const collection = db.collection("fareSections")

    // read JSON file
    const data = JSON.parse(fs.readFileSync("./fare.json", "utf8"))

    // transform fields to DB format
    const docs = data.map(row => ({
      section: row.sectionNumber,
      stops: row.numberofStops,
      price: row.fare
    }))

    // clear old data (optional)
    await collection.deleteMany({})

    // insert new data
    await collection.insertMany(docs)

    console.log(`Inserted ${docs.length} fare records`)

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

importFare()