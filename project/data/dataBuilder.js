import { createLookupMaps, firstKey, normalizeKey, toArray } from './lookupMaps'

const numberOrNull = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeDirection = (value) => {
  if (!value) return 'unknown'
  return String(value).trim().toLowerCase()
}

const isDownDirection = (value) => {
  const direction = normalizeDirection(value)
  return (
    direction.includes('down') ||
    direction.includes('return') ||
    direction.includes('inbound') ||
    direction === 'dn'
  )
}

const stopOrder = (item, fallbackIndex) => {
  const direct = Number(item?.displayOrder)
  if (Number.isFinite(direct)) return direct

  const nested = Number(item?.routeStop?.displayOrder)
  if (Number.isFinite(nested)) return nested

  return fallbackIndex
}

const hydrateRouteStopsByRoute = ({ routeStopsByRouteId, busStopsById }) => {
  const hydrated = new Map()

  for (const [routeId, rows] of routeStopsByRouteId.entries()) {
    const upStops = []
    const downStops = []

    rows.forEach((routeStop, index) => {
      const stopId = firstKey(routeStop, ['stopId', 'busStopId', '_stopId'])
      const busStop = stopId ? busStopsById.get(stopId) : null

      const stop = {
        ...(busStop || {}),
        stopId: stopId ?? null,
        stopName: busStop?.stopName || busStop?.name || null,
        displayOrder: stopOrder(routeStop, index),
      }

      if (isDownDirection(routeStop?.direction || routeStop?.runningDirection)) {
        downStops.push(stop)
      } else {
        upStops.push(stop)
      }
    })

    upStops.sort((a, b) => a.displayOrder - b.displayOrder)
    downStops.sort((a, b) => a.displayOrder - b.displayOrder)

    hydrated.set(routeId, { upStops, downStops })
  }

  return hydrated
}

const createTimetableByRoute = ({
  runningSlotsByRouteId,
  runningSlotStopsBySlotId,
  runningNumbersById,
  busStopsById,
}) => {
  const timetableByRouteId = new Map()

  for (const [routeId, slots] of runningSlotsByRouteId.entries()) {
    const timetable = []

    for (const slot of slots) {
      const slotId = firstKey(slot, ['id', '_id', 'slotId', 'runningSlotId'])
      const runningNumberId = firstKey(slot, ['runningNumberId', '_runningNumberId'])
      const runningNumberRow = runningNumberId ? runningNumbersById.get(runningNumberId) : null

      const slotStops = slotId ? toArray(runningSlotStopsBySlotId.get(slotId)) : []

      const stops = slotStops
        .map((slotStop, index) => {
          const stopId = firstKey(slotStop, ['stopId', 'busStopId', '_stopId'])
          const stopRow = stopId ? busStopsById.get(stopId) : null

          return {
            displayOrder: stopOrder(slotStop, index),
            stopName: stopRow?.stopName || stopRow?.name || null,
            weekdayTime: slotStop?.weekdayTime || null,
            weekendTime: slotStop?.weekendTime || null,
          }
        })
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(({ displayOrder, ...row }) => row)

      timetable.push({
        runningNumber:
          runningNumberRow?.runningNumber ||
          slot?.runningNumber ||
          runningNumberId ||
          null,
        direction: slot?.direction || slot?.runningDirection || null,
        stops,
      })
    }

    timetableByRouteId.set(routeId, timetable)
  }

  return timetableByRouteId
}

const pickLiveState = (live, root, device) => ({
  lat: numberOrNull(live?.lat ?? root?.lat ?? device?.lat),
  lon: numberOrNull(live?.lon ?? root?.lon ?? device?.lon),
  isOnline: Boolean(live?.isOnline ?? root?.isOnline ?? device?.isOnline),
})

const buildRouteShape = ({ route, stops, timetable }) => ({
  routeNumber: route?.routeNumber || null,
  routeDistance: route?.routeDistance ?? null,
  stops: stops || { upStops: [], downStops: [] },
  timetable: timetable || [],
})

export const buildTransportObjects = (
  {
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
  },
  precomputedLookups
) => {
  const lookups =
    precomputedLookups ||
    createLookupMaps({
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
    })

  const routeStopsByRoute = hydrateRouteStopsByRoute({
    routeStopsByRouteId: lookups.routeStopsByRouteId,
    busStopsById: lookups.busStopsById,
  })

  const timetableByRoute = createTimetableByRoute({
    runningSlotsByRouteId: lookups.runningSlotsByRouteId,
    runningSlotStopsBySlotId: lookups.runningSlotStopsBySlotId,
    runningNumbersById: lookups.runningNumbersById,
    busStopsById: lookups.busStopsById,
  })

  const rootRows = toArray(liveVehicles).length > 0 ? toArray(liveVehicles) : toArray(devices)

  return rootRows.map((root) => {
    const deviceId = firstKey(root, ['deviceId', 'id', '_id'])
    const device = deviceId ? lookups.devicesById.get(deviceId) : null

    const busId =
      firstKey(root, ['busId', 'routePermitBusId']) ||
      firstKey(device, ['busId', 'routePermitBusId'])
    const bus = busId ? lookups.busesById.get(busId) : null

    const routePermitId =
      firstKey(bus, ['routePermitId', '_routePermitId']) ||
      firstKey(root, ['routePermitId', '_routePermitId']) ||
      firstKey(device, ['routePermitId', '_routePermitId'])

    const routePermit = routePermitId ? lookups.routePermitsById.get(routePermitId) : null

    const routeId =
      firstKey(routePermit, ['routeId', '_routeId']) ||
      firstKey(root, ['routeId', '_routeId'])

    const route = routeId ? lookups.routesById.get(routeId) : null
    const stops = routeId ? routeStopsByRoute.get(normalizeKey(routeId)) : null
    const timetable = routeId ? timetableByRoute.get(normalizeKey(routeId)) : null

    const live = deviceId ? lookups.liveByDeviceId.get(deviceId) : null
    const { lat, lon, isOnline } = pickLiveState(live, root, device)

    return {
      deviceId,
      imei: root?.imei ?? device?.imei ?? null,
      isOnline,
      lat,
      lon,
      routePermitBus: bus
        ? {
            busNumber: bus?.busNumber || null,
            seatingCapacity: bus?.seatingCapacity ?? null,
            driverContact: bus?.driverContact ?? null,
            conductorContact: bus?.conductorContact ?? null,
            routePermit: routePermit
              ? {
                  permitNumber: routePermit?.permitNumber || null,
                  routePermitType: routePermit?.routePermitType || null,
                  route: buildRouteShape({ route, stops, timetable }),
                }
              : {
                  permitNumber: null,
                  routePermitType: null,
                  route: buildRouteShape({ route: null, stops: null, timetable: null }),
                },
          }
        : null,
    }
  })
}
