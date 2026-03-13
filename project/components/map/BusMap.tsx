"use client";

import { EnrichedDevice } from "@/data/transportBuilder";
import { BusStop, RouteWithMeta } from "@/services/transportApi";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from "react-leaflet";
import { createBusIcon } from "./BusMarker";
import { RoutePolyline } from "./RoutePolyline";

// Kandy city centre — Sri Lanka
const DEFAULT_CENTER: [number, number] = [7.2906, 80.6337];
const DEFAULT_ZOOM = 12;

function hasCoords(stop?: Partial<BusStop> | null): boolean {
  if (!stop) return false;
  return stop.latitude !== null && stop.latitude !== undefined &&
         stop.longitude !== null && stop.longitude !== undefined;
}

function toPoint(stop: Partial<BusStop>): [number, number] | null {
  if (!hasCoords(stop)) return null;
  const lat = Number(stop.latitude);
  const lon = Number(stop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function normalizeStops(stops: Partial<BusStop>[]): BusStop[] {
  return stops
    .filter((s) => toPoint(s) !== null)
    .map((s, idx) => ({
      id: idx + 1,
      name: String(s.name ?? `Point ${idx + 1}`),
      type: String(s.type ?? "regular_stop"),
      latitude: String(s.latitude),
      longitude: String(s.longitude),
      addedBy: "",
      isActive: true,
      createdAt: "",
      updatedAt: "",
      geoFenceRadius: Number(s.geoFenceRadius ?? 0),
      displayOrder: Number(s.displayOrder ?? idx + 1),
    }));
}

function resolveOverlayStops(routeMeta: RouteWithMeta, direction: "up" | "down"): BusStop[] {
  const directionStops = normalizeStops(direction === "up" ? routeMeta.upStops : routeMeta.downStops);
  if (directionStops.length >= 2) return directionStops;

  const standardPathStops = normalizeStops(
    (routeMeta.meta?.standardRoutePath || []).map((p, idx) => ({
      id: idx + 1,
      name: idx === 0
        ? (routeMeta.start?.name || "Start")
        : idx === (routeMeta.meta?.standardRoutePath?.length || 0) - 1
        ? (routeMeta.end?.name || "End")
        : `Path ${idx + 1}`,
      latitude: String(p.latitude),
      longitude: String(p.longitude),
      displayOrder: idx + 1,
    }))
  );
  if (standardPathStops.length >= 2) return standardPathStops;

  return normalizeStops([
    { id: 1, name: routeMeta.start?.name || "Start", latitude: routeMeta.start?.latitude, longitude: routeMeta.start?.longitude, displayOrder: 1 },
    { id: 2, name: routeMeta.end?.name || "End",     latitude: routeMeta.end?.latitude,   longitude: routeMeta.end?.longitude,   displayOrder: 2 },
  ]);
}

// Single shared user-location icon instance
const USER_LOCATION_ICON = L.divIcon({
  html: `
    <div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;inset:0;background:#6366f1;border-radius:50%;opacity:0.25;animation:lk-gps-ping 1.8s ease-out infinite"></div>
      <div style="width:14px;height:14px;background:#6366f1;border-radius:50%;border:2.5px solid white;box-shadow:0 0 8px rgba(99,102,241,0.7)"></div>
    </div>
    <style>@keyframes lk-gps-ping{0%{transform:scale(.8);opacity:.4}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}</style>`,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface BusMapProps {
  devices: EnrichedDevice[];
  onBusClick: (device: EnrichedDevice) => void;
  selectedDevice?: EnrichedDevice;
  userCenter?: [number, number];
  routeOverlay?: RouteWithMeta | null;
  routeDirection?: "up" | "down";
  focusPoint?: [number, number] | null;
}

function MapUpdater({ center, zoom }: { center?: [number, number]; zoom?: number }) {
  const map = useMap();
  const applied = useRef(false);
  useEffect(() => {
    if (!center) return;
    if (!applied.current) {
      applied.current = true;
      map.flyTo(center, zoom ?? 15, { duration: 1.2 });
    } else {
      map.flyTo(center, zoom ?? map.getZoom(), { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

function RouteFitter({ routeMeta, direction }: { routeMeta: RouteWithMeta; direction: "up" | "down" }) {
  const map = useMap();
  useEffect(() => {
    const points = resolveOverlayStops(routeMeta, direction)
      .map((s) => toPoint(s))
      .filter((p): p is [number, number] => Boolean(p));
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14, duration: 1.2 });
    }
  }, [routeMeta.id, direction, map]);
  return null;
}


export default function BusMap({
  devices,
  onBusClick,
  selectedDevice,
  userCenter,
  routeOverlay,
  routeDirection = "up",
  focusPoint,
}: BusMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const flyTarget =
    focusPoint ??
    (selectedDevice?.lat && selectedDevice?.lon
      ? [selectedDevice.lat, selectedDevice.lon] as [number, number]
      : userCenter);

  const routeStops = useMemo(
    () => routeOverlay ? resolveOverlayStops(routeOverlay, routeDirection) : [],
    [routeOverlay, routeDirection]
  );

  const visibleDevices = useMemo(() => {
    const base = routeOverlay
      ? devices.filter((d) => d.routeId === routeOverlay.id || d.route?.id === routeOverlay.id)
      : devices;
    const list = [...base];
    if (selectedDevice?.lat && selectedDevice?.lon && !list.some((d) => d.id === selectedDevice.id)) {
      list.push(selectedDevice);
    }
    return list;
  }, [devices, routeOverlay, selectedDevice]);

  if (!isMounted) return <div className="w-full h-full bg-slate-100 animate-pulse" />;

  return (
    <div className="w-full h-full relative [&_.leaflet-bottom]:mb-16 md:[&_.leaflet-bottom]:mb-0">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          updateWhenIdle={true}
          updateWhenZooming={false}
          keepBuffer={1}
          maxNativeZoom={18}
          maxZoom={18}
        />
        <ZoomControl position="bottomright" />

        {routeOverlay && routeStops.length > 1 && (
          <RoutePolyline stops={routeStops} direction={routeDirection} />
        )}
        {routeOverlay && !selectedDevice && !focusPoint && (
          <RouteFitter routeMeta={routeOverlay} direction={routeDirection} />
        )}

        {userCenter && (
          <Marker position={userCenter} icon={USER_LOCATION_ICON} interactive={false} zIndexOffset={1000} />
        )}

        {visibleDevices.map((device) => {
          if (!device.lat || !device.lon) return null;
          const isSelected = selectedDevice?.id === device.id;
          return (
            <Marker
              key={device.id}
              position={[device.lat, device.lon]}
              icon={createBusIcon(device.isOnline, device.routeNumber, isSelected)}
              zIndexOffset={isSelected ? 500 : 0}
              eventHandlers={{ click: () => onBusClick(device) }}
            />
          );
        })}

        {flyTarget && <MapUpdater center={flyTarget} zoom={selectedDevice || focusPoint ? 16 : 15} />}
      </MapContainer>
    </div>
  );
}
