"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bus as BusIcon, Route as RouteIcon, MapPin, ChevronRight, Clock, Ticket, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { EnrichedDevice } from "@/data/transportBuilder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TimetableInnerPanel } from "@/components/panels/TimetableInnerPanel";

interface BusDetailsPanelProps {
  device: EnrichedDevice | null;
  onClose: () => void;
  onViewRoute: (routeId: string) => void;
}

export function BusDetailsPanel({ device, onClose, onViewRoute }: BusDetailsPanelProps) {
  const router = useRouter();
  const [showTimetable, setShowTimetable] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset inner panel when selected bus changes
  useEffect(() => { setShowTimetable(false); }, [device?.id]);

  // Render QR code when share dialog opens
  useEffect(() => {
    if (!shareOpen || !device || !canvasRef.current) return;
    const deepLink = `${window.location.origin}/?busId=${device.id}`;
    QRCode.toCanvas(canvasRef.current, deepLink, { width: 220, margin: 2 }).catch(() => {});
  }, [shareOpen, device]);

  if (!device) return null;

  const deepLink = typeof window !== "undefined" ? `${window.location.origin}/?busId=${device.id}` : "";

  const routeLabel = device.route?.start?.name && device.route?.end?.name
    ? `${device.route.start.name} → ${device.route.end.name}`
    : device.routeNumber && device.routeNumber !== "N/A"
      ? `Route ${device.routeNumber}`
      : "Unknown Route";

  const resolvedRouteId = device.routeId || device.route?.id;

  const handleBookSeat = () => {
    const params = new URLSearchParams();
    if (device.busNumber) params.set("bus", device.busNumber);
    if (device.routeNumber) params.set("route", device.routeNumber);
    if (resolvedRouteId) params.set("routeId", resolvedRouteId);
    router.push(`/booking?${params.toString()}`);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="bus-details-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-white shadow-2xl z-[100] border-l border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Fixed Header */}
        <div className="p-6 pb-4 shrink-0 flex justify-between items-start">
          <div className="flex gap-4 items-center">
            <div className={device.isOnline ? "bg-emerald-500/10 p-3 rounded-2xl" : "bg-slate-100 p-3 rounded-2xl"}>
              <BusIcon className={device.isOnline ? "text-emerald-600" : "text-slate-400"} size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight uppercase">
                {device.busNumber}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={device.isOnline ? "default" : "secondary"}
                  className={device.isOnline ? "bg-emerald-500 text-white border-0" : ""}
                >
                  {device.isOnline ? "ONLINE LIVE" : "OFFLINE"}
                </Badge>
                {device.routeNumber && device.routeNumber !== "N/A" && (
                  <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-black">
                    Route {device.routeNumber}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
            <X size={20} className="text-slate-400" />
          </Button>
        </div>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 pb-8 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-2xl border ${device.isOnline ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"}`}>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Status</p>
                <p className={`text-lg font-black ${device.isOnline ? "text-emerald-600" : "text-slate-500"}`}>
                  {device.isOnline ? "Live" : "Offline"}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Seats</p>
                <p className="text-lg font-black text-slate-900">
                  {device.seatingCapacity ?? "—"}
                  <span className="text-sm font-medium text-slate-400 ml-1">Seats</span>
                </p>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-4">
              <InfoRow icon={RouteIcon} label="Route" value={routeLabel} />
              <InfoRow
                icon={MapPin}
                label="Current Location"
                value={device.lat && device.lon ? `${device.lat.toFixed(4)}, ${device.lon.toFixed(4)}` : "Location unavailable"}
              />
            </div>

            <Separator className="bg-slate-100" />

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <Button
                className="w-full h-12 rounded-xl text-md font-bold shadow-lg shadow-primary/20"
                onClick={() => resolvedRouteId && onViewRoute(resolvedRouteId)}
                disabled={!resolvedRouteId}
              >
                View Full Route Details
                <ChevronRight size={18} className="ml-auto opacity-50" />
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-md font-bold border-slate-200"
                onClick={() => setShowTimetable(true)}
                disabled={!resolvedRouteId}
              >
                <Clock size={16} className="mr-2 opacity-50" />
                View Timetable
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-md font-bold border-primary/30 text-primary hover:bg-primary/5"
                onClick={handleBookSeat}
              >
                <Ticket size={16} className="mr-2 opacity-70" />
                Book a Seat
                <ChevronRight size={18} className="ml-auto opacity-50" />
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-md font-bold border-slate-200"
                onClick={() => setShareOpen(true)}
              >
                <Share2 size={16} className="mr-2" />
                Share
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* Timetable inner overlay */}
        <TimetableInnerPanel
          routeId={showTimetable ? (resolvedRouteId ?? null) : null}
          routeNumber={device.routeNumber}
          onClose={() => setShowTimetable(false)}
        />
      </motion.div>

      {/* Share dialog */}
      {shareOpen && (
        <div
          key="bus-share-dialog"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900">Share Bus</h3>
              <button
                onClick={() => setShareOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Preview card */}
            <div className="bg-primary rounded-2xl p-4 text-white mb-4">
              <p className="font-black text-lg uppercase leading-tight">{device.busNumber}</p>
              <p className="text-sm opacity-80 mt-0.5">{routeLabel}</p>
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
                  a.download = `qr_bus_${device.busNumber || device.id}.png`;
                  a.click();
                }}
              >
                Download PNG
              </Button>
              <Button
                className="rounded-xl"
                onClick={() => {
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

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex gap-4 items-start group">
      <div className="p-2.5 rounded-xl bg-slate-50 group-hover:bg-slate-100 transition-colors border border-slate-100">
        <Icon size={18} className="text-slate-400 group-hover:text-primary transition-colors" />
      </div>
      <div>
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">{label}</p>
        <p className="text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
