const admin = require("firebase-admin")
const serviceAccount = require("./lk-bus-raidar-new-firebase-adminsdk-fbsvc-f0e9dd9606.json")

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()

/*
--------------------------------------------------
DISTANCE BETWEEN 2 GPS POINTS (meters)
--------------------------------------------------
*/
function haversineDistance(a, b) {

  const R = 6371000

  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.latitude * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))

  return R * c
}

/*
--------------------------------------------------
FIND CLOSEST POINT INDEX ON ROUTE
--------------------------------------------------
*/
function findClosestPointIndex(routePath, point) {

  let minDist = Infinity
  let index = 0

  for (let i = 0; i < routePath.length; i++) {

    const d = haversineDistance(routePath[i], point)

    if (d < minDist) {
      minDist = d
      index = i
    }
  }

  return index
}

/*
--------------------------------------------------
GET SHORTEST PATH BETWEEN START AND END
--------------------------------------------------
*/
function getShortestRouteSegment(routePath, startPoint, endPoint) {

  const startIndex = findClosestPointIndex(routePath, startPoint)
  const endIndex = findClosestPointIndex(routePath, endPoint)

  if (startIndex <= endIndex) {
    return routePath.slice(startIndex, endIndex + 1)
  }

  return routePath.slice(endIndex, startIndex + 1).reverse()
}

/*
--------------------------------------------------
GENERATE STOPS ALONG ROUTE
--------------------------------------------------
*/
function generateStopsFromPath(path, interval = 400) {

  const stops = []
  let accumulated = 0

  stops.push(path[0])

  for (let i = 1; i < path.length; i++) {

    const dist = haversineDistance(path[i - 1], path[i])
    accumulated += dist

    if (accumulated >= interval) {

      stops.push(path[i])
      accumulated = 0
    }
  }

  return stops
}

/*
--------------------------------------------------
CREATE STOPS SUBCOLLECTION
--------------------------------------------------
*/
async function createStopsForRoute(routeId, stops) {

  const batch = db.batch()

  stops.forEach((stop, index) => {

    const ref = db
      .collection("routes")
      .doc(routeId)
      .collection("stops")
      .doc()

    batch.set(ref, {
      latitude: stop.latitude,
      longitude: stop.longitude,
      order: index,
      createdAt: new Date()
    })
  })

  await batch.commit()
}

/*
--------------------------------------------------
PROCESS SINGLE ROUTE
--------------------------------------------------
*/
async function processRoute(routeId, route) {

  try {

    const startStopDoc = await db
      .collection("busStops")
      .doc(route.startingBusStop)
      .get()

    const endStopDoc = await db
      .collection("busStops")
      .doc(route.endingBusStop)
      .get()

    if (!startStopDoc.exists || !endStopDoc.exists) {
      console.log("Missing start/end stop:", routeId)
      return
    }

    const start = startStopDoc.data()
    const end = endStopDoc.data()

    const segment = getShortestRouteSegment(
      route.standardRoutePath,
      start,
      end
    )

    const stops = generateStopsFromPath(segment, 400)

    await createStopsForRoute(routeId, stops)

    console.log("Stops generated for route:", route.routeNumber)

  } catch (err) {

    console.error("Error processing route:", routeId, err)

  }
}

/*
--------------------------------------------------
PROCESS ALL ROUTES
--------------------------------------------------
*/
async function run() {

  console.log("Starting route stop generation...\n")

  const routesSnapshot = await db.collection("routes").get()

  for (const doc of routesSnapshot.docs) {

    const route = doc.data()

    if (!route.standardRoutePath || route.standardRoutePath.length === 0) {
      console.log("No route path:", doc.id)
      continue
    }

    await processRoute(doc.id, route)
  }

  console.log("\nFinished processing all routes")

  process.exit()
}

run()