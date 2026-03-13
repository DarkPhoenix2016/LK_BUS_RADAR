"use client";

import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  selectedPoint: { lat: number; lng: number } | null;
  radius: number;
  onMapClick: (lat: number, lng: number) => void;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ selectedPoint }: { selectedPoint: { lat: number; lng: number } | null }) {
  const map = useMap();
  if (selectedPoint) {
    map.setView([selectedPoint.lat, selectedPoint.lng], Math.max(map.getZoom(), 15), { animate: true });
  }
  return null;
}

export default function BusStopLocationPicker({ selectedPoint, radius, onMapClick }: Props) {
  const center: [number, number] = selectedPoint ? [selectedPoint.lat, selectedPoint.lng] : [6.9271, 79.8612];

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer center={center} zoom={selectedPoint ? 15 : 10} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapClickHandler onClick={onMapClick} />
        <RecenterMap selectedPoint={selectedPoint} />

        {selectedPoint && (
          <>
            <Circle
              center={[selectedPoint.lat, selectedPoint.lng]}
              radius={radius}
              pathOptions={{ color: "#f59e0b", fillColor: "#fbbf24", fillOpacity: 0.18, weight: 2 }}
            />
            <CircleMarker
              center={[selectedPoint.lat, selectedPoint.lng]}
              radius={8}
              pathOptions={{ color: "#d97706", fillColor: "#f59e0b", fillOpacity: 0.95, weight: 2 }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>
                  {selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}
                </span>
              </Tooltip>
            </CircleMarker>
          </>
        )}
      </MapContainer>

      {!selectedPoint && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1 shadow text-xs text-slate-500 pointer-events-none whitespace-nowrap">
          Click on the map to pick the stop location
        </div>
      )}
    </div>
  );
}
