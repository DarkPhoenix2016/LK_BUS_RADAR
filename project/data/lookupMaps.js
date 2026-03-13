const DEFAULT_KEY_CANDIDATES = ['id', '_id']

const toArray = (value) => (Array.isArray(value) ? value : [])

const normalizeKey = (value) => {
  if (value === null || value === undefined) return null
  return String(value)
}

const firstKey = (row, keyCandidates = DEFAULT_KEY_CANDIDATES) => {
  if (!row || typeof row !== 'object') return null

  for (const key of keyCandidates) {
    if (row[key] !== undefined && row[key] !== null) {
      return normalizeKey(row[key])
    }
  }

  return null
}

const indexBy = (rows, keyCandidates = DEFAULT_KEY_CANDIDATES) => {
  const index = new Map()

  for (const row of toArray(rows)) {
    const key = firstKey(row, keyCandidates)
    if (key !== null) index.set(key, row)
  }

  return index
}

const groupBy = (rows, keyCandidates) => {
  const groups = new Map()

  for (const row of toArray(rows)) {
    const key = firstKey(row, keyCandidates)
    if (key === null) continue

    let bucket = groups.get(key)
    if (!bucket) {
      bucket = []
      groups.set(key, bucket)
    }

    bucket.push(row)
  }

  return groups
}

export const createLookupMaps = ({
  routes,
  buses,
  devices,
  routePermits,
  busStops,
  routeStops,
  runningSlots,
  runningSlotStops,
  runningNumbers,
  liveVehicles,
  busTurns,
} = {}) => ({
  routesById: indexBy(routes, ['id', '_id', 'routeId']),
  busesById: indexBy(buses, ['id', '_id', 'busId', 'routePermitBusId']),
  devicesById: indexBy(devices, ['id', '_id', 'deviceId']),
  routePermitsById: indexBy(routePermits, ['id', '_id', 'routePermitId']),
  busStopsById: indexBy(busStops, ['id', '_id', 'stopId', 'busStopId']),
  liveByDeviceId: indexBy(liveVehicles, ['deviceId', 'id', '_id']),
  runningNumbersById: indexBy(runningNumbers, ['id', '_id', 'runningNumberId']),
  routeStopsByRouteId: groupBy(routeStops, ['routeId', 'routeID', '_routeId']),
  runningSlotsByRouteId: groupBy(runningSlots, ['routeId', 'routeID', '_routeId']),
  runningSlotStopsBySlotId: groupBy(runningSlotStops, ['slotId', 'runningSlotId', '_slotId']),
  busTurnsBySlotId: groupBy(busTurns, ['slotId', 'runningSlotId', '_slotId']),
})

export { toArray, normalizeKey, firstKey }
