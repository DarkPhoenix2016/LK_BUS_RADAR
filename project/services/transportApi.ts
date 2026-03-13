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

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const API_ENDPOINTS = {
  ROUTES: `${BASE_URL}/api/public/routes`,
  DEVICES: `${BASE_URL}/api/public/devices-for-live-map`,
  ROUTE_META: (id: string) => `${BASE_URL}/api/public/withMeta/${id}`,
  TIMETABLE: (id: string) => `${BASE_URL}/api/public/timetable/bus-turn-running-slots/${id}`,
  BOOKING_CREATE: `${BASE_URL}/api/booking/create`,
  BOOKING_MY: `${BASE_URL}/api/booking/my`,
  BOOKING_GET: (id: string) => `${BASE_URL}/api/booking/${id}`,
  BOOKING_CANCEL: (id: string) => `${BASE_URL}/api/booking/${id}/cancel`,
  BOOKING_PAY: (id: string) => `${BASE_URL}/api/booking/${id}/pay`,
  USER_PROFILE: `${BASE_URL}/api/user/profile`,
  USER_POINTS: `${BASE_URL}/api/user/points`,
  USER_POINTS_TOPUP: `${BASE_URL}/api/user/points/topup`,
  BUS_GET: (id: string) => `${BASE_URL}/api/public/bus/${id}`,
  BUS_STANDS: `${BASE_URL}/api/public/bus-stands`,
  BUS_STANDS_DISTRICTS: `${BASE_URL}/api/public/bus-stands/districts`,
  BUS_STOPS_SEARCH: (q: string) => `${BASE_URL}/api/public/bus-stops/search?q=${encodeURIComponent(q)}`,
  ROUTES_BY_STOPS: (params: string) => `${BASE_URL}/api/public/routes-by-stops?${params}`,
  JOURNEY_ACTIVE:  `${BASE_URL}/api/journey/active`,
  JOURNEY_BOARD:   `${BASE_URL}/api/journey/board`,
  JOURNEY_ALIGHT:  `${BASE_URL}/api/journey/alight`,
  JOURNEY_HISTORY: `${BASE_URL}/api/journey/history`,
  JOURNEY_LIVE:    (deviceId: string) => `${BASE_URL}/api/public/live-vehicle/${deviceId}`,
};

export const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
