const { MongoClient } = require("mongodb")

const uri = "mongodb://127.0.0.1:27017"

async function mergeData() {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const apiDB = client.db("API_Data")
    const radarDB = client.db("LKBusRadar")

    const schedulesCol = apiDB.collection("Schedules")
    const faresCol = apiDB.collection("Fare")

    const routesCol = radarDB.collection("routes")
    const runningSlotsCol = radarDB.collection("runningslots")
    const runningNumbersCol = radarDB.collection("runningnumbers")
    const busStopsCol = radarDB.collection("busstops")

    let gCounter = 1
    let pCounter = 1

    const schedules = await schedulesCol.find({}).toArray()

    console.log("Schedules found:", schedules.length)

    for (const schedule of schedules) {

      const route = await routesCol.findOne({
        routeNumber: schedule.routeNumber
      })

      if (!route) {
        console.log("Route not found:", schedule.routeNumber)
        continue
      }

      // Skip route if slots already exist
      const existingSlot = await runningSlotsCol.findOne({
        routeId: route._id
      })

      if (existingSlot) {
        console.log("Skipping route (slots exist):", route.routeNumber)
        continue
      }

      // Get fare data
      const fareData = await faresCol.findOne({
        routeNumber: schedule.routeNumber
      })

      if (fareData) {

        const lastFare =
          fareData.fares[fareData.fares.length - 1]

        const lastDistance =
          fareData.distances[fareData.distances.length - 1]

        await routesCol.updateOne(
          { _id: route._id },
          {
            $set: {
              routeDistance: Number(lastDistance),
              priceFullJourney: Number(lastFare)
            }
          }
        )

        console.log(
          "Updated route distance + fare:",
          route.routeNumber
        )
      }

      const startStop = await busStopsCol.findOne({
        _id: route.startingBusStop
      })

      const endStop = await busStopsCol.findOne({
        _id: route.endingBusStop
      })

      if (!startStop || !endStop) {
        console.log("Missing stops for route:", route.routeNumber)
        continue
      }

      for (const slot of schedule.slots) {

        let direction = null

        if (
          slot.station.toLowerCase() ===
          startStop.name.toLowerCase()
        ) {
          direction = "UP"
        } else if (
          slot.station.toLowerCase() ===
          endStop.name.toLowerCase()
        ) {
          direction = "DOWN"
        } else {
          continue
        }

        let runningNumberId

        if (slot.busType === "CTB") {
          runningNumberId = `G_${gCounter++}`
        } else {
          runningNumberId = `P_${pCounter++}`
        }

        // Ensure running number exists
        const rnExists = await runningNumbersCol.findOne({
          _id: runningNumberId
        })

        if (!rnExists) {

          await runningNumbersCol.insertOne({
            _id: runningNumberId,
            runningNumber: runningNumberId,
            busType: slot.busType,
            createdAt: new Date(),
            updatedAt: new Date()
          })

        }

        const slotId =
          `${route._id}_${direction}_${slot.time.replace(":", "")}_${slot.busType}`

        await runningSlotsCol.updateOne(
          { _id: slotId },
          {
            $setOnInsert: {
              routeId: route._id,
              runningNumberId: runningNumberId,
              direction: direction,
              departureTime: slot.time,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        )

      }

      console.log("Imported route:", route.routeNumber)

    }

    console.log("Import completed successfully")

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

mergeData()