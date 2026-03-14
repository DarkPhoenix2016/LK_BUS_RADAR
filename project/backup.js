const { MongoClient } = require("mongodb")
const fs = require("fs")

const uri = "mongodb://127.0.0.1:27017"
const dbName = "LKBusRadar"

async function backupDatabase(outputFile = "backup.json") {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const db = client.db(dbName)

    const collections = await db.listCollections().toArray()

    const backup = {}

    for (const col of collections) {

      const name = col.name
      const data = await db.collection(name).find({}).toArray()

      backup[name] = data

      console.log(`Exported ${name} (${data.length} records)`)

    }

    fs.writeFileSync(outputFile, JSON.stringify(backup, null, 2))

    console.log("Backup saved to:", outputFile)

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

async function restoreDatabase(inputFile = "backup.json") {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const db = client.db(dbName)

    const backup = JSON.parse(fs.readFileSync(inputFile))

    for (const collectionName of Object.keys(backup)) {

      const collection = db.collection(collectionName)

      const data = backup[collectionName]

      if (data.length === 0) continue

      await collection.deleteMany({})

      await collection.insertMany(data)

      console.log(`Restored ${collectionName} (${data.length} records)`)

    }

    console.log("Database restore completed")

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

async function run(mode) {

  if (mode === "backup") {
    await backupDatabase()
  }

  else if (mode === "restore") {
    await restoreDatabase()
  }

  else {
    console.log("Usage:")
    console.log("node dbTool.js backup")
    console.log("node dbTool.js restore")
  }

}

const mode = process.argv[2]

run(mode)