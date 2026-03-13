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

  <!-- rotate arrow -->
  <g transform="rotate(${heading} 512 512)">

    <!-- blue circle -->
    <path d="M63.3 512.2a448.5 448 0 1 0 897 0 448.5 448 0 1 0-897 0Z" fill="#4D6BFF"/>

    <!-- arrow -->
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

  // Fallback straight-line coords (used if OSRM fails)
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

  // Derive coords to use: OSRM road coords or fallback straight lines
  const displayCoords = roadCoords.length > 1 ? roadCoords : fallbackCoords;

  // Approximate split point: proportion of stops passed
  const splitFraction =
    validStops.length > 1
      ? currentBusStopIndex / (validStops.length - 1)
      : 0;
  const splitIdx     = Math.floor(splitFraction * (displayCoords.length - 1));
  const passedCoords  = displayCoords.slice(0, splitIdx + 1);
  const upcomingCoords = displayCoords.slice(splitIdx);

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

      {/* Passed route segment (dimmed) */}
      {passedCoords.length > 1 && (
        <Polyline positions={passedCoords} color="#94a3b8" weight={5} opacity={0.7} />
      )}

      {/* Upcoming route segment (primary blue) */}
      {upcomingCoords.length > 1 && (
        <Polyline positions={upcomingCoords} color="hsl(221, 83%, 53%)" weight={5} opacity={1} />
      )}

      {/* All stops */}
      {validStops.map((stop, i) => {
        const lat        = parseFloat(stop.latitude);
        const lon        = parseFloat(stop.longitude);
        const isBoarding = i === boardingStopIndex;
        const isPassed   = i < currentBusStopIndex;
        const isCurrent  = i === currentBusStopIndex;

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

      {/* Bus marker */}
      {live?.lat && live?.lon && (
        <BusMarkerLayer live={live} markerRef={markerRef} />
      )}

      {/* Camera follow */}
      {live?.lat && live?.lon && (
        <CameraController lat={live.lat} lon={live.lon} />
      )}
    </MapContainer>
  );
}
