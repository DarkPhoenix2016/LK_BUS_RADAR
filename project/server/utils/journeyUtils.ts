// @ts-nocheck
const FareSection = require('../models/FareSection');
const RouteStop = require('../models/RouteStop');
const BusStop = require('../models/BusStop');

/**
 * Earth-distance calculation using Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} distance in kilometers
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Bearing between two points in degrees.
 */
function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180;
  const lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Absolute difference between two angles in degrees (0-180).
 */
function angleDiffAbs(a, b) {
  return Math.abs(((a - b + 180) % 360) - 180);
}

/**
 * Find the nearest stop in a list based on GPS coordinate.
 */
function nearestStopInList(stops, lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stops) {
    const sLat = parseFloat(s.latitude ?? s.lat ?? 0);
    const sLon = parseFloat(s.longitude ?? s.lon ?? 0);
    if (!sLat && !sLon) continue;
    const d = haversineKm(lat, lon, sLat, sLon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * Detect bus direction using heading (if available) or nearest stop distance.
 */
function detectBusDirection(upStops, downStops, busLat, busLon, busHeading) {
  const nearUp = nearestStopInList(upStops, busLat, busLon);
  const nearDown = nearestStopInList(downStops, busLat, busLon);

  if (!nearUp && !nearDown) return null;
  if (!nearUp) return { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
  if (!nearDown) return { direction: 'UP', orderedStops: upStops, nearStop: nearUp };

  if (busHeading != null && busHeading !== 0) {
    const upIdx = upStops.findIndex(s => s.stopId === nearUp.stopId);
    const downIdx = downStops.findIndex(s => s.stopId === nearDown.stopId);
    const nextUp = upStops[upIdx + 1];
    const nextDown = downStops[downIdx + 1];

    if (nextUp && nextDown) {
      const bUp = bearingDeg(busLat, busLon, parseFloat(nextUp.latitude), parseFloat(nextUp.longitude));
      const bDown = bearingDeg(busLat, busLon, parseFloat(nextDown.latitude), parseFloat(nextDown.longitude));
      if (angleDiffAbs(busHeading, bUp) < angleDiffAbs(busHeading, bDown)) {
        return { direction: 'UP', orderedStops: upStops, nearStop: nearUp };
      } else {
        return { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
      }
    }
  }

  const distUp = haversineKm(busLat, busLon, parseFloat(nearUp.latitude), parseFloat(nearUp.longitude));
  const distDown = haversineKm(busLat, busLon, parseFloat(nearDown.latitude), parseFloat(nearDown.longitude));
  return distUp <= distDown
    ? { direction: 'UP', orderedStops: upStops, nearStop: nearUp }
    : { direction: 'DOWN', orderedStops: downStops, nearStop: nearDown };
}

/**
 * Load route stops with their coordinates for a specific direction.
 */
async function loadRouteStopsWithCoords(routeId, direction) {
  const routeStops = await RouteStop.find({ routeId, direction })
    .sort({ displayOrder: 1 })
    .lean();
  const stopIds = routeStops.map(rs => rs.stopId);
  const busStops = await BusStop.find({ _id: { $in: stopIds } }).lean();
  const stopMap = Object.fromEntries(busStops.map(s => [String(s._id), s]));
  return routeStops
    .map(rs => ({ ...stopMap[String(rs.stopId)], stopId: String(rs.stopId), displayOrder: rs.displayOrder }))
    .filter(s => s.latitude);
}

/**
 * Fare lookup based on stops traveled.
 */
async function lookupFare(stopsTravelled) {
  const sections = await FareSection.find().sort({ stops: 1 }).lean();
  if (sections.length === 0) {
    // No fare rules configured — use a sensible default
    return {
      price: Math.max(20, stopsTravelled * 10),
      sectionId: 'default',
      sectionName: 'Default (10 pts/stop)',
    };
  }
  for (const fs of sections) {
    if (stopsTravelled <= fs.stops) {
      return {
        price: fs.price,
        sectionId: String(fs._id),
        sectionName: `Section ${fs.section} (Max ${fs.stops} stops)`,
      };
    }
  }
  const last = sections[sections.length - 1];
  return {
    price: last.price,
    sectionId: String(last._id),
    sectionName: `Section ${last.section} (Max ${last.stops} stops)`,
  };
}

module.exports = {
  haversineKm,
  bearingDeg,
  angleDiffAbs,
  nearestStopInList,
  detectBusDirection,
  loadRouteStopsWithCoords,
  lookupFare,
};
