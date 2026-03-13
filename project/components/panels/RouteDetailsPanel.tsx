"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Route as RouteIcon, MapPin, ArrowRightLeft, Bus as BusIcon, Radio, Share2 } from "lucide-react";
import useSWR from "swr";
import QRCode from "qrcode";
import { API_ENDPOINTS, fetcher, RouteWithMeta } from "@/services/transportApi";
import { EnrichedDevice } from "@/data/transportBuilder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { RouteTimetableContent } from "@/components/panels/RouteTimetableContent";

interface RouteDetailsPanelProps {
  routeId: string | null;
  onClose: () => void;
  devices?: EnrichedDevice[];
  onDirectionChange?: (dir: "up" | "down") => void;
  onBusSelect?: (device: EnrichedDevice) => void;
}

export function RouteDetailsPanel({
  routeId,
  onClose,
  devices = [],
  onDirectionChange,
  onBusSelect,
}: RouteDetailsPanelProps) {
  const { data: route, error, isLoading } = useSWR<RouteWithMeta>(
    routeId ? API_ENDPOINTS.ROUTE_META(routeId) : null,
    fetcher
  );

  const [stopDirection, setStopDirection] = useState<"up" | "down">("up");
  const [shareOpen, setShareOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!shareOpen || !routeId || !canvasRef.current) return;
    const deepLink = `${window.location.origin}/?routeId=${routeId}`;
    QRCode.toCanvas(canvasRef.current, deepLink, { width: 220, margin: 2 }).catch(() => {});
  }, [shareOpen, routeId]);

  const stops = stopDirection === "up" ? route?.upStops : route?.downStops;
  const resolvedDistance = route?.routeDistance ?? Number(route?.meta?.averageDistanceKm || 0);

  const liveDevices = devices.filter(
    (d) => d.isOnline && (d.routeId === routeId || d.route?.id === routeId)
  );
  const allRouteDevices = devices.filter(
    (d) => d.routeId === routeId || d.route?.id === routeId
  );

  const handleDirectionChange = (dir: "up" | "down") => {
    setStopDirection(dir);
    onDirectionChange?.(dir);
  };

  return (
    <AnimatePresence>
      {routeId && (
        <motion.div
          key="route-panel"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-white shadow-2xl z-[110] border-l border-slate-200 flex flex-col overflow-hidden"
        >
          {/* Fixed header */}
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl">
                <RouteIcon className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 leading-tight">
                  Route {route?.routeNumber || "—"}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {route?.start?.name && route?.end?.name
                    ? `${route.start.name} → ${route.end.name}`
                    : "Detailed Route Information"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)} className="rounded-full" title="Share route">
                <Share2 size={18} className="text-slate-400" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X size={20} className="text-slate-400" />
              </Button>
            </div>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="flex-1 min-h-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-primary opacity-20" size={40} />
                <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Loading Route Data...</p>
              </div>
            ) : error ? (
              <div className="m-6 bg-red-50 text-red-600 p-6 rounded-2xl border border-red-100">
                <p className="font-bold text-sm">Failed to load route details.</p>
              </div>
            ) : (
              <Tabs defaultValue="stops" className="w-full">
                <div className="px-6 pt-4 pb-0 border-b border-slate-100">
                  <TabsList className="w-full rounded-xl bg-slate-100 p-1">
                    <TabsTrigger value="stops" className="flex-1 rounded-lg text-xs font-bold">
                      Stop Sequence
                    </TabsTrigger>
                    <TabsTrigger value="timetable" className="flex-1 rounded-lg text-xs font-bold">
                      Timetable
                    </TabsTrigger>
                    <TabsTrigger value="live" className="flex-1 rounded-lg text-xs font-bold relative">
                      Live Buses
                      {liveDevices.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full text-[9px] text-white font-black flex items-center justify-center">
                          {liveDevices.length}
                        </span>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* STOPS TAB */}
                <TabsContent value="stops" className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Distance</p>
                      <p className="text-xl font-black text-slate-900">
                        {resolvedDistance > 0 ? resolvedDistance : "0"} <span className="text-sm font-medium text-slate-400 italic">km</span>
                      </p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Stops</p>
                      <p className="text-xl font-black text-slate-900">
                        {stops?.length || 0} <span className="text-sm font-medium text-slate-400 italic">pts</span>
                      </p>
                    </div>
                  </div>

                  {/* Direction toggle */}
                  <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
                    <button
                      onClick={() => handleDirectionChange("up")}
                      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all ${stopDirection === "up" ? "bg-white text-primary shadow-sm" : "text-slate-400"}`}
                    >
                      <MapPin size={12} />
                      <span>Upward</span>
                      {route?.start?.name && route?.end?.name && (
                        <span className="text-[9px] font-medium normal-case opacity-70">{route.start.name} → {route.end.name}</span>
                      )}
                    </button>
                    <button
                      onClick={() => handleDirectionChange("down")}
                      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all ${stopDirection === "down" ? "bg-white text-primary shadow-sm" : "text-slate-400"}`}
                    >
                      <ArrowRightLeft size={12} />
                      <span>Downward</span>
                      {route?.start?.name && route?.end?.name && (
                        <span className="text-[9px] font-medium normal-case opacity-70">{route.end.name} → {route.start.name}</span>
                      )}
                    </button>
                  </div>

                  {/* Stops timeline */}
                  {stops && stops.length > 0 ? (
                    <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                      {stops.map((stop, i) => (
                        <div key={stop.id} className="relative group">
                          <div className={`absolute -left-[27px] top-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200 z-10 transition-colors
                            ${i === 0 || i === stops.length - 1 ? "bg-primary" : "bg-white group-hover:bg-slate-100"}`}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">{stop.name}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                              {i === 0 ? "Departure Point" : i === stops.length - 1 ? "Terminal Arrival" : `Stop #${i + 1}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-sm text-slate-400 py-8">No stops data for this direction.</p>
                  )}
                </TabsContent>

                {/* TIMETABLE TAB */}
                <TabsContent value="timetable" className="pt-2">
                  {routeId && <RouteTimetableContent routeId={routeId} />}
                </TabsContent>

                {/* LIVE BUSES TAB */}
                <TabsContent value="live" className="p-6 space-y-4">
                  {allRouteDevices.length === 0 ? (
                    <div className="text-center py-16 space-y-3">
                      <Radio size={36} className="mx-auto text-slate-200" />
                      <p className="text-sm font-bold text-slate-400">No buses tracked on this route</p>
                    </div>
                  ) : (
                    allRouteDevices.map((device) => (
                      <button
                        key={device.id}
                        onClick={() => onBusSelect?.(device)}
                        className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-primary hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-xl ${device.isOnline ? "bg-emerald-50" : "bg-slate-50"}`}>
                            <BusIcon size={20} className={device.isOnline ? "text-emerald-600" : "text-slate-400"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-slate-900 uppercase">{device.busNumber}</p>
                              <Badge
                                variant="outline"
                                className={device.isOnline
                                  ? "border-emerald-200 text-emerald-700 bg-emerald-50 text-[9px] font-black"
                                  : "border-slate-200 text-slate-400 text-[9px] font-black"
                                }
                              >
                                {device.isOnline ? "LIVE" : "OFFLINE"}
                              </Badge>
                            </div>
                            {device.routePermitBus?.busType && (
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                {device.routePermitBus.busType.replace(/_/g, " ")}
                              </p>
                            )}
                          </div>
                          {device.isOnline && (
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-bold text-slate-400">
                                {device.lat?.toFixed(3)}, {device.lon?.toFixed(3)}
                              </p>
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            )}
          </ScrollArea>
        </motion.div>
      )}

      {/* Share dialog */}
      {shareOpen && routeId && (
        <div
          key="share-dialog"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900">Share Route</h3>
              <button
                onClick={() => setShareOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Preview card */}
            <div className="bg-primary rounded-2xl p-4 text-white mb-4">
              <p className="font-black text-lg leading-tight">Route {route?.routeNumber || "—"}</p>
              {route?.start?.name && route?.end?.name && (
                <p className="text-sm opacity-80 mt-0.5">{route.start.name} → {route.end.name}</p>
              )}
            </div>

            {/* QR code */}
            <div className="flex justify-center mb-4">
              <canvas ref={canvasRef} className="rounded-xl" />
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  const canvas = canvasRef.current;
                  if (!canvas) return;
                  const a = document.createElement("a");
                  a.href = canvas.toDataURL("image/png");
                  a.download = `qr_route_${route?.routeNumber || routeId}.png`;
                  a.click();
                }}
              >
                Download PNG
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => {
                  const deepLink = `${window.location.origin}/?routeId=${routeId}`;
                  navigator.clipboard.writeText(deepLink).catch(() => {});
                }}
              >
                Copy Link
              </Button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
