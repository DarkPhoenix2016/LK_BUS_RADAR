const { MongoClient } = require("mongodb")

const uri = "mongodb://127.0.0.1:27017"

async function assignBookableSeats() {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const db = client.db("LKBusRadar")

    const routes = db.collection("routes")
    const permits = db.collection("routepermits")
    const buses = db.collection("buses")
    const runningSlots = db.collection("runningslots")

    const allRoutes = await routes.find({}).toArray()

    for (const route of allRoutes) {

      // find route permits
      const routePermits = await permits.find({
        routeId: route._id
      }).toArray()

      if (routePermits.length === 0) continue

      const permitIds = routePermits.map(p => p._id)

      // find buses for those permits
      const routeBuses = await buses.find({
        routePermitId: { $in: permitIds }
      }).toArray()

      if (routeBuses.length === 0) continue

      // get lowest seating capacity
      const lowestSeats = Math.min(
        ...routeBuses.map(b => b.seatingCapacity || 0)
      )

      if (!lowestSeats || lowestSeats === Infinity) continue

      let maxBookable = Math.floor(lowestSeats / 5)

      if (maxBookable > 10) {
        maxBookable = 10
      }

      if (maxBookable <= 0) continue

      // update all slots for that route
      await runningSlots.updateMany(
        { routeId: route._id },
        {
          $set: {
            maxBookableSeats: maxBookable
          }
        }
      )

      console.log(
        `Route ${route.routeNumber} → LowestSeats ${lowestSeats} → maxBookableSeats ${maxBookable}`
      )

    }

    console.log("Finished assigning maxBookableSeats")

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

assignBookableSeats()