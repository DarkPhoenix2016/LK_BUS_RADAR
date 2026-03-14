export interface BusStop {
  id: number;
  name: string;
  type: string;
  latitude: string;
  longitude: string;
  addedBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  geoFenceRadius: number;
  displayOrder?: number;
}

export interface Route {
  id: string;
  routeNumber: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  startingBusStop: number;
  endingBusStop: number;
  routeDistance: number | null;
  start?: BusStop;
  end?: BusStop;
}

export interface RoutePermit {
  id: string;
  permitNumber: string;
  routeId: string;
  ownerId: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  routePermitType: string;
  route: Route;
}

export interface RoutePermitBus {
  id: string;
  busNumber: string;
  routePermitId: string;
  addedBy: string;
  addedAt: string;
  isActive: boolean;
  seatingCapacity: number;
  driverContact: number | string;
  conductorContact: number | string;
  createdAt: string;
  updatedAt: string;
  discontinuedAt: string | null;
  totalDistance: number;
  busType: string | null;
  routePermit: RoutePermit;
}

export interface Device {
  id: string;
  imei: number;
  simNumber: number;
  routePermitBusId: string;
  discontinuedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  commandsDispatchedAt: string;
  deviceType: string;
  routePermitBus: RoutePermitBus;
  isOnline: boolean;
  lat: number | null;
  lon: number | null;
  // Fields returned by our local backend
  routeId: string | null;
  routeNumber: string | null;
  busNumber: string | null;
  seatingCapacity: number | null;
}

export interface RouteWithMeta extends Route {
  downStops: BusStop[];
  upStops: BusStop[];
  meta: {
    averageDistanceKm: string;
    standardRoutePath: { latitude: number; longitude: number }[];
  }
}

export interface RunningNumber {
  id: number;
  runningNumber: string;
  busType: string;
}

export interface RunningSlotBusStop {
  id: number;
  busStopId: number;
  weekdayTime: string;
  weekendTime: string;
  runningSlotId: number;
  busStop: { id: number; name: string };
}

export interface RunningSlot {
  id: number;
  runningDirection: string;
  runningNumberId: number;
  runningNumber: RunningNumber;
  runningSlotBusStops: RunningSlotBusStop[];
  maxBookableSeats?: number;
}

export interface TimetableEntry {
  id: number | string;
  runningSlotId: number;
  busTurnStatus: string;
  deviceId: string | null;
  createdAt: string;
  loadingStartingTime: string;
  runningSlot: RunningSlot;
  isOnline: boolean;
}

export interface Booking {
  id: string;
  bookingReference: string;
  userId: string;
  routeId: string;
  slotId: string;
  travelDate: string;
  direction: 'up' | 'down';
  passengerName: string;
  passengerEmail: string;
  status: 'draft' | 'confirmed' | 'cancelled' | 'completed';
  fareAmount?: number | null;
  paidWithPoints?: boolean;
  cancelledAt?: string;
  route?: { routeNumber: string; start?: { name: string }; end?: { name: string }; priceFullJourney?: number; routeDistance?: string | number };
}

export interface PointTransaction {
  _id: string;
  userId: string;
  type: 'topup' | 'booking_payment' | 'refund';
  amount: number;
  balanceAfter: number;
  description: string;
  bookingId?: string | null;
  createdAt: string;
}

export interface BookingPayload {
  routeId: string;
  slotId: string;
  travelDate: string;
  direction: 'up' | 'down';
  passengerName: string;
  passengerEmail: string;
}

export interface UserProfile {
  _id: string;
  email: string;
  linkedEmail?: string;
  displayName?: string;
  nic?: string;
  phone?: string;
  photoURL?: string;
  pointBalance?: number;
}

export interface BusStandContact {
  _id: string;
  location: string;
  district: string;
  phoneNumber: string;
}

export interface Journey {
  _id: string;
  userId: string;
  deviceId: string;
  routeId: string;
  direction: 'UP' | 'DOWN';
  boardingStopId: string;
  boardingStopName: string;
  boardingStopIndex: number;
  boardingLat: number | null;
  boardingLon: number | null;
  alightingStopId: string | null;
  alightingStopName: string | null;
  alightingStopIndex: number | null;
  stopsTravelled: number | null;
  fareCharged: number | null;
  fareSectionName?: string | null;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  // enriched fields from active endpoint
  busNumber?: string | null;
  routeNumber?: string | null;
  routeStartName?: string | null;
  routeEndName?: string | null;
}

export interface JourneyStop {
  _id: string;
  name: string;
  latitude: string;
  longitude: string;
  displayOrder: number;
}

export interface LiveBusPosition {
  _id: string;
  busId: string;
  routeId: string;
  lat: number;
  lon: number;
  speed: number;
  heading: number;
  isOnline: boolean;
  timestamp: string;
}

export interface FareSection {
  _id: string;
  section: number;
  stops: number;
  price: number;
}

const rawBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** Helper to ensure URLs have the correct /api/api prefix */
function getUrl(path: string) {
  // All endpoints are mounted under /api in the server, 
  // and the environment requires an additional /api prefix.
  return `${rawBaseUrl}/api${path}`;
}

export const API_ENDPOINTS = {
  ROUTES: getUrl('/public/routes'),
  DEVICES: getUrl('/public/devices-for-live-map'),
  ROUTE_META: (id: string) => getUrl(`/public/withMeta/${id}`),
  TIMETABLE: (id: string) => getUrl(`/public/timetable/bus-turn-running-slots/${id}`),
  BOOKING_CREATE: getUrl('/booking/create'),
  BOOKING_MY: getUrl('/booking/my'),
  BOOKING_GET: (id: string) => getUrl(`/booking/${id}`),
  BOOKING_CANCEL: (id: string) => getUrl(`/booking/${id}/cancel`),
  BOOKING_PAY: (id: string) => getUrl(`/booking/${id}/pay`),
  USER_PROFILE: getUrl('/user/profile'),
  USER_POINTS: getUrl('/user/points'),
  USER_POINTS_TOPUP: getUrl('/user/points/topup'),
  BUS_GET: (id: string) => getUrl(`/public/bus/${id}`),
  BUS_STANDS: getUrl('/public/bus-stands'),
  BUS_STANDS_DISTRICTS: getUrl('/public/bus-stands/districts'),
  BUS_STOPS_SEARCH: (q: string) => getUrl(`/public/bus-stops/search?q=${encodeURIComponent(q)}`),
  ROUTES_BY_STOPS: (params: string) => getUrl(`/public/routes-by-stops?${params}`),
  JOURNEY_ACTIVE:  getUrl('/journey/active'),
  JOURNEY_BY_ID:   (id: string) => getUrl(`/journey/${id}`),
  JOURNEY_BOARD:   getUrl('/journey/board'),
  JOURNEY_ALIGHT:  getUrl('/journey/alight'),
  JOURNEY_HISTORY: getUrl('/journey/history'),
  JOURNEY_LIVE:    (deviceId: string) => getUrl(`/public/live-vehicle/${deviceId}`),
  BUS_PASSENGERS:  (deviceId: string) => getUrl(`/public/bus-passengers/${deviceId}`),
  SLOT_AVAILABILITY: (routeId: string, travelDate: string) =>
    getUrl(`/public/slot-availability?routeId=${encodeURIComponent(routeId)}&travelDate=${encodeURIComponent(travelDate)}`),
};

export const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });

/** Safe JSON fetch — returns null and error message if response is not JSON */
export async function safeFetch(url: string, options?: RequestInit): Promise<{ data: any; error: string | null }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return { data: null, error: `Server error (${res.status})` };
    }
    const data = await res.json();
    if (!res.ok) return { data: null, error: data?.error || `Error ${res.status}` };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || "Network error" };
  }
}
