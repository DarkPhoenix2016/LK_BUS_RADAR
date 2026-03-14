"use client";

import { JourneyStop, LiveBusPosition } from "@/services/transportApi";
import L from "leaflet";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";

interface JourneyMapProps {
  stops: JourneyStop[];
  live: LiveBusPosition | null;
  boardingStopIndex: number;
  currentBusStopIndex: number;
  /** When true: fits map to the traveled route and styles markers for the summary view */
  isCompleted?: boolean;
}

/* ── sample array to at most N elements ──────────────────────────────────── */
function sampleToN<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const result: T[] = [arr[0]];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 1; i < n - 1; i++) result.push(arr[Math.round(i * step)]);
  result.push(arr[arr.length - 1]);
  return result;
}

/* ── auto-fit bounds to the traveled route for completed journeys ─────────── */
function FitBoundsController({
  stops,
  from,
  to,
}: {
  stops: JourneyStop[];
  from: number;
  to: number;
}) {
  const map = useMap();
  useEffect(() => {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const slice = stops.slice(lo, hi + 1).filter((s) => s.latitude && s.longitude);
    if (slice.length >= 2) {
      const bounds = L.latLngBounds(
        slice.map((s) => [parseFloat(s.latitude), parseFloat(s.longitude)] as [number, number])
      );
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    } else if (slice.length === 1) {
      map.setView(
        [parseFloat(slice[0].latitude), parseFloat(slice[0].longitude)],
        15,
        { animate: true }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/* ── smooth-follow camera controller ──────────────────────────────────────── */
function CameraController({ lat, lon }: { lat: number; lon: number }) {
  const map     = useMap();
  const prevRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!lat || !lon) return;
    const next: [number, number] = [lat, lon];
    if (
      !prevRef.current ||
      Math.abs(prevRef.current[0] - lat) > 0.0001 ||
      Math.abs(prevRef.current[1] - lon) > 0.0001
    ) {
      map.panTo(next, { animate: true, duration: 1.0 });
      prevRef.current = next;
    }
  }, [lat, lon, map]);

  return null;
}

/* ── rotating bus marker ─────────────────────────────────────────────────── */
function createBusIcon(heading: number) {
  const svg = `
<svg viewBox="0 0 1024 1024" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(${heading} 512 512)">
    <path d="M63.3 512.2a448.5 448 0 1 0 897 0 448.5 448 0 1 0-897 0Z" fill="#4D6BFF"/>
    <path d="M416.09375 605.09375c1.21875 0.5625 2.15625 1.5 2.71875 2.71875l82.3125 175.6875c3.1875 6.84375 12.84375 7.03125 15.75 0.375l201.84375-465.75c3.5625-8.15625-4.78125-16.5-12.9375-12.9375L240.125 507.03125c-6.75 2.90625-6.5625 12.5625 0.375 15.75l175.59375 82.3125z" fill="#ffffff"/>
  </g>
</svg>
`;
  return L.divIcon({
    html: svg,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    className: "",
  });
}

/* ── Leaflet Marker via useEffect ─────────────────────────────────────────── */
function BusMarkerLayer({
  live,
  markerRef,
}: {
  live: LiveBusPosition;
  markerRef: React.MutableRefObject<L.Marker | null>;
}) {
  const map = useMap();

  useEffect(() => {
    const icon   = createBusIcon(live.heading ?? 0);
    const marker = L.marker([live.lat, live.lon], { icon, zIndexOffset: 1000 }).addTo(map);
    markerRef.current = marker;
    return () => { marker.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

/* ── main map ─────────────────────────────────────────────────────────────── */
export default function JourneyMap({
  stops,
  live,
  boardingStopIndex,
  currentBusStopIndex,
  isCompleted = false,
}: JourneyMapProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const mapRef    = useRef<L.Map | null>(null);

  const [roadCoords, setRoadCoords] = useState<[number, number][]>([]);

  const validStops = stops.filter((s) => s.latitude && s.longitude);

  const center: [number, number] =
    live?.lat && live?.lon
      ? [live.lat, live.lon]
      : validStops.length > 0
      ? [
          parseFloat(validStops[Math.floor(validStops.length / 2)].latitude),
          parseFloat(validStops[Math.floor(validStops.length / 2)].longitude),
        ]
      : [6.0, 80.0];

  // Fallback straight-line coords
  const fallbackCoords: [number, number][] = validStops.map((s) => [
    parseFloat(s.latitude),
    parseFloat(s.longitude),
  ]);

  // Fetch OSRM road-following path once on mount
  useEffect(() => {
    if (validStops.length < 2) return;
    const sampled = sampleToN(validStops, 20);
    const coordStr = sampled
      .map((s) => `${parseFloat(s.longitude)},${parseFloat(s.latitude)}`)
      .join(";");

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
    )
      .then((r) => r.json())
      .then((data) => {
        const coords = data?.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(coords) && coords.length > 1) {
          setRoadCoords(coords.map(([lon, lat]: [number, number]) => [lat, lon]));
        }
      })
      .catch(() => {/* fallback to straight lines */});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update bus marker position smoothly
  useEffect(() => {
    if (!live?.lat || !live?.lon || !markerRef.current) return;
    markerRef.current.setLatLng([live.lat, live.lon]);
    markerRef.current.setIcon(createBusIcon(live.heading ?? 0));
  }, [live]);

  const displayCoords = roadCoords.length > 1 ? roadCoords : fallbackCoords;

  // ── Route segment colouring ────────────────────────────────────────────────
  let beforeBoardingCoords: [number, number][] = [];
  let traveledCoords: [number, number][] = [];
  let afterAlightingCoords: [number, number][] = [];
  let passedCoords: [number, number][] = [];
  let upcomingCoords: [number, number][] = [];

  if (isCompleted && validStops.length > 1) {
    // Three-segment coloring: before boarding (dim), traveled (primary), after alighting (dim)
    const boardingFraction  = boardingStopIndex  / (validStops.length - 1);
    const alightingFraction = currentBusStopIndex / (validStops.length - 1);
    const bIdx = Math.floor(boardingFraction  * (displayCoords.length - 1));
    const aIdx = Math.floor(alightingFraction * (displayCoords.length - 1));
    beforeBoardingCoords = displayCoords.slice(0, bIdx + 1);
    traveledCoords       = displayCoords.slice(bIdx, aIdx + 1);
    afterAlightingCoords = displayCoords.slice(aIdx);
  } else {
    // Active journey: passed (dim) / upcoming (primary)
    const splitFraction  = validStops.length > 1 ? currentBusStopIndex / (validStops.length - 1) : 0;
    const splitIdx       = Math.floor(splitFraction * (displayCoords.length - 1));
    passedCoords   = displayCoords.slice(0, splitIdx + 1);
    upcomingCoords = displayCoords.slice(splitIdx);
  }

  return (
    <MapContainer
      center={center}
      zoom={15}
      zoomControl={false}
      attributionControl={false}
      style={{ height: "100%", width: "100%" }}
      ref={mapRef as any}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution=""
        maxZoom={19}
        updateWhenIdle={true}
        updateWhenZooming={false}
        keepBuffer={1}
      />

      {/* ── Completed journey route segments ─────────────────────────────── */}
      {isCompleted && (
        <>
          {beforeBoardingCoords.length > 1 && (
            <Polyline positions={beforeBoardingCoords} color="#cbd5e1" weight={4} opacity={0.6} />
          )}
          {traveledCoords.length > 1 && (
            <Polyline positions={traveledCoords} color="hsl(221,83%,53%)" weight={6} opacity={1} />
          )}
          {afterAlightingCoords.length > 1 && (
            <Polyline positions={afterAlightingCoords} color="#cbd5e1" weight={4} opacity={0.6} />
          )}
        </>
      )}

      {/* ── Active journey route segments ────────────────────────────────── */}
      {!isCompleted && (
        <>
          {passedCoords.length > 1 && (
            <Polyline positions={passedCoords} color="#94a3b8" weight={5} opacity={0.7} />
          )}
          {upcomingCoords.length > 1 && (
            <Polyline positions={upcomingCoords} color="hsl(221, 83%, 53%)" weight={5} opacity={1} />
          )}
        </>
      )}

      {/* ── Stop markers ─────────────────────────────────────────────────── */}
      {validStops.map((stop, i) => {
        const lat        = parseFloat(stop.latitude);
        const lon        = parseFloat(stop.longitude);
        const isBoarding = i === boardingStopIndex;
        const isAlighting = isCompleted && i === currentBusStopIndex;

        if (isCompleted) {
          // Completed view: large boarding (green) and alighting (primary) markers, others subtle
          const isTraveled = i >= Math.min(boardingStopIndex, currentBusStopIndex) &&
                             i <= Math.max(boardingStopIndex, currentBusStopIndex);
          return (
            <CircleMarker
              key={stop._id}
              center={[lat, lon]}
              radius={isBoarding || isAlighting ? 9 : isTraveled ? 5 : 3}
              pathOptions={{
                color:       isBoarding ? "#059669" : isAlighting ? "hsl(221,83%,53%)" : isTraveled ? "hsl(221,83%,53%)" : "#cbd5e1",
                fillColor:   isBoarding ? "#34d399" : isAlighting ? "hsl(221,83%,53%)" : isTraveled ? "#93c5fd" : "#e2e8f0",
                fillOpacity: 1,
                weight:      isBoarding || isAlighting ? 3 : 2,
              }}
            />
          );
        }

        // Active view
        const isPassed  = i < currentBusStopIndex;
        const isCurrent = i === currentBusStopIndex;
        return (
          <CircleMarker
            key={stop._id}
            center={[lat, lon]}
            radius={isBoarding || isCurrent ? 7 : 5}
            pathOptions={{
              color:       isBoarding ? "#059669" : isCurrent ? "hsl(221,83%,53%)" : isPassed ? "#94a3b8" : "#60a5fa",
              fillColor:   isBoarding ? "#34d399" : isCurrent ? "hsl(221,83%,53%)" : isPassed ? "#cbd5e1" : "#93c5fd",
              fillOpacity: 1,
              weight:      2,
            }}
          />
        );
      })}

      {/* Bus marker (active only) */}
      {live?.lat && live?.lon && (
        <BusMarkerLayer live={live} markerRef={markerRef} />
      )}

      {/* Camera follow (active only) */}
      {live?.lat && live?.lon && (
        <CameraController lat={live.lat} lon={live.lon} />
      )}

      {/* Auto-fit bounds for completed journeys */}
      {isCompleted && validStops.length >= 2 && (
        <FitBoundsController
          stops={validStops}
          from={boardingStopIndex}
          to={currentBusStopIndex}
        />
      )}
    </MapContainer>
  );
}
