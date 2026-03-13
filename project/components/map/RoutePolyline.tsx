"use client";

import { BusStop } from "@/services/transportApi";
import type { Polyline as LeafletPolyline } from "leaflet";
import { Flag, MapPin } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, Polyline, Tooltip } from "react-leaflet";

interface RoutePolylineProps {
  stops: BusStop[];
  direction: "up" | "down";
}

const COLOR: Record<"up" | "down", string> = {
  up: "#4f46e5",
  down: "#0d9488",
};

/* ───────── CSS Injection ───────── */

const STYLE_ID = "lk-route-anim";

function injectStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = STYLE_ID;

  s.textContent = `
    @keyframes lk-flow-fwd { from { stroke-dashoffset: 0 } to { stroke-dashoffset: -20 } }
    @keyframes lk-flow-rev { from { stroke-dashoffset: 0 } to { stroke-dashoffset: 20 } }

    .lk-route-line {
      stroke-dasharray: 12 8;
      will-change: stroke-dashoffset;
    }

    .lk-up {
      animation: lk-flow-fwd 1.1s linear infinite;
    }

    .lk-down {
      animation: lk-flow-rev 1.1s linear infinite;
    }

    .lk-stop-tip {
      padding: 2px 7px !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      border-radius: 6px !important;
      border: 1px solid rgba(0,0,0,0.08) !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12) !important;
      white-space: nowrap !important;
      background: white !important;
    }

    .lk-stop-tip-terminal {
      font-size: 11px !important;
      font-weight: 900 !important;
      padding: 3px 9px !important;
    }

    .lk-stop-tip::before {
      display: none !important;
    }
  `;

  document.head.appendChild(s);
}

/* ───────── OSRM ROUTING ───────── */

const OSRM = "https://router.project-osrm.org/route/v1/driving";

function sample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;

  const out: T[] = [arr[0]];
  const step = (arr.length - 1) / (max - 1);

  for (let i = 1; i < max - 1; i++) {
    out.push(arr[Math.round(i * step)]);
  }

  out.push(arr[arr.length - 1]);
  return out;
}

async function getRoadPath(
  waypoints: { lat: number; lon: number }[]
): Promise<[number, number][]> {
  if (waypoints.length < 2) return [];

  const pts = sample(waypoints, 20);
  const coord = pts.map((p) => `${p.lon},${p.lat}`).join(";");

  try {
    const res = await fetch(
      `${OSRM}/${coord}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(9000) }
    );

    if (!res.ok) return [];

    const json = await res.json();

    if (json.code !== "Ok") return [];

    return json.routes[0].geometry.coordinates.map(
      ([lon, lat]: [number, number]) => [lat, lon]
    );
  } catch {
    return [];
  }
}

/* ───────── STOP SAMPLING ───────── */
// If > 5 stops: pick start, start↔mid midpoint, mid, mid↔end midpoint, end.
// Otherwise show all stops.
function pickLabelStops(stops: BusStop[]): Set<number> {
  const n = stops.length;
  if (n <= 5) return new Set(stops.map((_, i) => i));
  const mid = Math.round((n - 1) / 2);
  return new Set([
    0,
    Math.round(mid / 2),
    mid,
    Math.round(mid + (n - 1 - mid) / 2),
    n - 1,
  ]);
}

/* ───────── STOP MARKERS ───────── */

const StopMarkers = memo(function StopMarkers({
  stops,
  color,
}: {
  stops: BusStop[];
  color: string;
}) {
  const labelIndices = useMemo(() => pickLabelStops(stops), [stops]);

  return (
    <>
      {stops.map((stop, i) => {
        const isTerminal = i === 0 || i === stops.length - 1;
        const showLabel = labelIndices.has(i);

        return (
          <CircleMarker
            key={stop.id}
            center={[parseFloat(stop.latitude), parseFloat(stop.longitude)]}
            radius={isTerminal ? 8 : 5}
            pathOptions={{
              color: "white",
              fillColor: isTerminal ? color : "#94a3b8",
              fillOpacity: 1,
              weight: isTerminal ? 2.5 : 2,
            }}
          >
            {showLabel && (
              <Tooltip
                permanent
                direction={i === 0 ? "right" : "top"}
                offset={isTerminal ? [10, 0] : [0, -8]}
                opacity={1}
                className={
                  isTerminal
                    ? "lk-stop-tip lk-stop-tip-terminal"
                    : "lk-stop-tip"
                }
              >
                <span className="flex items-center gap-1">
                  {i === 0 && <MapPin size={12} />}
                  {i === stops.length - 1 && <Flag size={12} />}
                  {stop.name}
                </span>
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}
    </>
  );
});

/* ───────── ANIMATION HELPER ───────── */

function applyAnimClass(
  layer: LeafletPolyline | null,
  direction: "up" | "down"
) {
  const el = layer?.getElement();

  if (!el) return;

  el.classList.add("lk-route-line");

  el.classList.remove("lk-up", "lk-down");

  el.classList.add(direction === "up" ? "lk-up" : "lk-down");
}

/* ───────── MAIN COMPONENT ───────── */

export const RoutePolyline = memo(function RoutePolyline({
  stops,
  direction,
}: RoutePolylineProps) {
  const color = COLOR[direction];

  const validStops = useMemo(
    () =>
      stops.filter((s) => {
        const lat = Number(s.latitude);
        const lon = Number(s.longitude);
        return Number.isFinite(lat) && Number.isFinite(lon);
      }),
    [stops]
  );

  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);
  const [fetching, setFetching] = useState(false);

  const keyRef = useRef("");
  const polylineRef = useRef<LeafletPolyline | null>(null);

  useEffect(() => {
    injectStyles();
  }, []);

  useEffect(() => {
    if (validStops.length < 2) return;

    const key = validStops.map((s) => `${s.latitude}|${s.longitude}`).join(";");

    if (key === keyRef.current) return;

    keyRef.current = key;

    setRoadPath(null);
    setFetching(true);

    getRoadPath(
      validStops.map((s) => ({
        lat: parseFloat(s.latitude),
        lon: parseFloat(s.longitude),
      }))
    )
      .then((pts) => setRoadPath(pts.length > 1 ? pts : null))
      .finally(() => setFetching(false));
  }, [validStops]);

  const straightPath = useMemo<[number, number][]>(
    () =>
      validStops.map((s) => [
        parseFloat(s.latitude),
        parseFloat(s.longitude),
      ]),
    [validStops]
  );

  const displayPath = useMemo<[number, number][] | null>(() => {
    if (!roadPath) return null;
    return direction === "down" ? [...roadPath].reverse() : roadPath;
  }, [roadPath, direction]);

  const displayStraight = useMemo<[number, number][]>(
    () =>
      direction === "down"
        ? [...straightPath].reverse()
        : straightPath,
    [straightPath, direction]
  );

  return (
    <>
      {/* Straight dashed line: shown while OSRM is loading (placeholder)
          and kept if OSRM returns nothing (fallback for 2-stop routes or
          failed/blocked requests) */}
      {!displayPath && displayStraight.length > 1 && (
        <Polyline
          positions={displayStraight}
          pathOptions={{
            color,
            weight: fetching ? 3 : 4,
            opacity: fetching ? 0.35 : 0.6,
            dashArray: "6 8",
          }}
        />
      )}

      {displayPath && displayPath.length > 1 && (
        <Polyline
          key={direction}
          ref={polylineRef}
          positions={displayPath}
          pathOptions={{
            color,
            weight: 6,
            opacity: 0.92,
          }}
          eventHandlers={{
            add: (e) =>
              applyAnimClass(e.target as LeafletPolyline, direction),
          }}
        />
      )}

      <StopMarkers stops={validStops} color={color} />
    </>
  );
});
