"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface StopItem {
  stopId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  displayOrder: number;
}

export interface BusStopOption {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  stops: StopItem[];
  clickedPoint: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function StopsMapEditor({ stops, clickedPoint, onMapClick }: Props) {
  const validStops = stops.filter((s) => s.latitude != null && s.longitude != null);

  const center: [number, number] =
    validStops.length > 0
      ? [validStops[0].latitude!, validStops[0].longitude!]
      : [6.05, 80.22];

  const polyline = validStops.map((s) => [s.latitude!, s.longitude!] as [number, number]);

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer
        center={center}
        zoom={validStops.length > 0 ? 12 : 9}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapClickHandler onClick={onMapClick} />

        {/* Route path */}
        {polyline.length > 1 && (
          <Polyline
            positions={polyline}
            pathOptions={{ color: "#4f46e5", weight: 3, opacity: 0.5, dashArray: "6 5" }}
          />
        )}

        {/* Numbered stop markers */}
        {validStops.map((stop, i) => (
          <CircleMarker
            key={stop.stopId}
            center={[stop.latitude!, stop.longitude!]}
            radius={10}
            pathOptions={{ color: "#4f46e5", fillColor: "#4f46e5", fillOpacity: 0.9, weight: 2 }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]}>
              <span style={{ fontWeight: 700, fontSize: 11 }}>{i + 1}. {stop.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Clicked location pin */}
        {clickedPoint && (
          <CircleMarker
            center={[clickedPoint.lat, clickedPoint.lng]}
            radius={9}
            pathOptions={{ color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.95, weight: 2 }}
          >
            <Tooltip sticky>
              <span style={{ fontSize: 11 }}>
                {clickedPoint.lat.toFixed(5)}, {clickedPoint.lng.toFixed(5)}
              </span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      {/* Hint when nothing clicked */}
      {!clickedPoint && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1 shadow text-xs text-slate-500 pointer-events-none whitespace-nowrap">
          Click anywhere on the map to find or create a stop
        </div>
      )}
    </div>
  );
}
