const { MongoClient } = require("mongodb")

const uri = "mongodb://127.0.0.1:27017"

function randomDistance(min = 4, max = 80) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10
}

function calculatePrice(distance) {
  const baseDistance = 4
  const basePrice = 30

  let price = basePrice * (distance / baseDistance)

  return Math.round(price)
}

async function fillRouteData() {

  const client = new MongoClient(uri)

  try {

    await client.connect()

    const db = client.db("LKBusRadar")
    const routes = db.collection("routes")

    const cursor = routes.find({})

    let updated = 0

    while (await cursor.hasNext()) {

      const route = await cursor.next()

      let distance = route.routeDistance
      let price = route.priceFullJourney

      let update = {}

      // Case 1: Distance missing
      if (!distance || distance === 0) {

        distance = randomDistance(4, 80)
        price = calculatePrice(distance)

        update.routeDistance = distance
        update.priceFullJourney = price

      }

      // Case 2: Distance exists but price missing
      else if (!price || price === 0) {

        price = calculatePrice(distance)

        update.priceFullJourney = price

      }

      if (Object.keys(update).length > 0) {

        await routes.updateOne(
          { _id: route._id },
          { $set: update }
        )

        console.log(
          `Updated ${route.routeNumber} → ${distance} km → LKR ${price}`
        )

        updated++

      }

    }

    console.log("Total routes updated:", updated)

  } catch (err) {

    console.error(err)

  } finally {

    await client.close()

  }

}

fillRouteData()