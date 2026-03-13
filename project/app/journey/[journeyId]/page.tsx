"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Bus, MapPin, QrCode, Shield, ChevronDown, ChevronUp, Loader2,
  Navigation, CheckCircle, AlertTriangle, X, XCircle, Coins, ArrowUpDown,
  Hash, Route as RouteIcon, Info, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS, Journey, JourneyStop, LiveBusPosition, safeFetch } from "@/services/transportApi";

const JourneyMap = dynamic(() => import("./JourneyMap"), { ssr: false, loading: () => null });

async function getToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) || "";
}

type ScanState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "scanning" }
  | { phase: "processing" }
  | { phase: "success"; to: string; fare: number; stops: number; balance: number }
  | { phase: "error"; message: string };

export default function JourneyPage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const router = useRouter();

  const [journey,      setJourney]      = useState<Journey | null>(null);
  const [stops,        setStops]        = useState<JourneyStop[]>([]);
  const [live,         setLive]         = useState<LiveBusPosition | null>(null);
  const [busNumber,      setBusNumber]      = useState<string | null>(null);
  const [routeNumber,    setRouteNumber]    = useState<string | null>(null);
  const [routeStartName, setRouteStartName] = useState<string | null>(null);
  const [routeEndName,   setRouteEndName]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [showExitWarn, setShowExitWarn] = useState(false);
  const [scan,         setScan]         = useState<ScanState>({ phase: "idle" });
  const [dirOverride,  setDirOverride]  = useState<"up" | "down" | null>(null);
  const [mobilePanel,  setMobilePanel]  = useState(false);  // right-side drawer on mobile

  const mountedRef = useRef(true);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannerRef = useRef<any>(null);

  // ── load journey ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    loadJourney();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [journeyId]);

  async function loadJourney() {
    setLoading(true);
    try {
      const token = await getToken();
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mountedRef.current) return;
      if (error || !data?.journey) { setLoading(false); return; }
      setJourney(data.journey);
      setStops(data.stops || []);
      setLive(data.live || null);
      setBusNumber(data.busNumber || data.journey?.busNumber || null);
      setRouteNumber(data.routeNumber || data.journey?.routeNumber || null);
      setRouteStartName(data.routeStartName || data.journey?.routeStartName || null);
      setRouteEndName(data.routeEndName || data.journey?.routeEndName || null);
      setLoading(false);
      startPolling(data.journey.deviceId);
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  }

  function startPolling(deviceId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const { data } = await safeFetch(API_ENDPOINTS.JOURNEY_LIVE(deviceId));
        if (mountedRef.current && data?.data) setLive(data.data);
      } catch { /* ignore */ }
    }, 10_000);
  }

  // ── prevent navigation away ──────────────────────────────────────────────────
  useEffect(() => {
    if (!journey || journey.status !== "active") return;
    window.history.pushState(null, "", window.location.href);
    const handlePop    = () => { window.history.pushState(null, "", window.location.href); setShowExitWarn(true); };
    const handleUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("popstate",     handlePop);
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("popstate",     handlePop);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [journey]);

  // ── scanner ──────────────────────────────────────────────────────────────────
  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch { /* ignore */ }
    scannerRef.current = null;
  }, []);

  const closeScanner = useCallback(async () => {
    await stopScanner();
    setScan({ phase: "idle" });
  }, [stopScanner]);

  const openScanner = useCallback(async () => {
    setScan({ phase: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: any) {
      const msg = err?.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings."
        : "Camera not available on this device.";
      setScan({ phase: "error", message: msg });
      return;
    }
    setScan({ phase: "scanning" });
  }, []);

  useEffect(() => {
    if (scan.phase !== "scanning") return;
    let scanner: any = null;
    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("journey-qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded: string) => handleScanned(decoded),
          () => {}
        );
      } catch {
        if (mountedRef.current) setScan({ phase: "error", message: "Could not start camera scanner." });
      }
    }
    startScanner();
    return () => { try { scanner?.stop?.(); } catch { /* ignore */ } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.phase]);

  const handleScanned = useCallback(async (rawValue: string) => {
    await stopScanner();
    setScan({ phase: "processing" });

    let deviceId = "";
    try {
      deviceId = new URL(rawValue).searchParams.get("d") || "";
    } catch {
      deviceId = rawValue.trim();
    }

    if (!deviceId) {
      setScan({ phase: "error", message: "Not a valid bus QR code." });
      return;
    }
    if (journey && deviceId !== journey.deviceId) {
      setScan({ phase: "error", message: "This QR code is from a different bus." });
      return;
    }

    let userLat: number | null = null;
    let userLon: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
    } catch { /* fallback to bus GPS */ }

    const token = await getToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ALIGHT, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ deviceId, userLat, userLon }),
    });

    if (!mountedRef.current) return;
    if (error) { setScan({ phase: "error", message: error }); return; }

    setScan({ phase: "success", to: data.to, fare: data.fareCharged, stops: data.stopsTravelled, balance: data.newBalance });
    setJourney((j) => j ? { ...j, status: "completed" } : j);
  }, [journey, stopScanner]);

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={36} />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6">
        <AlertTriangle size={48} className="text-amber-500" />
        <h2 className="text-xl font-bold text-slate-900">Journey not found</h2>
        <p className="text-slate-500 text-sm text-center">This journey has ended or doesn&apos;t exist.</p>
        <Button onClick={() => router.replace("/")} className="rounded-xl mt-2">Back to Map</Button>
      </div>
    );
  }

  if (journey.status === "completed") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 px-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle size={52} className="text-primary" />
        </motion.div>
        <div>
          <h2 className="text-2xl font-black text-primary">Journey Complete</h2>
          <p className="text-slate-500 mt-1 text-sm">{journey.boardingStopName} → {journey.alightingStopName}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-xs space-y-3 text-sm shadow-sm">
          <div className="flex justify-between"><span className="text-slate-500">Stops</span><span className="font-bold text-slate-900">{journey.stopsTravelled}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Fare</span><span className="font-black text-emerald-600 text-base">{journey.fareCharged} pts</span></div>
        </div>
        <Button className="h-12 px-8 rounded-2xl font-bold" onClick={() => router.replace("/")}>Back to Map</Button>
      </div>
    );
  }

  const boardingIdx       = journey.boardingStopIndex;
  const currentBusStopIdx = live
    ? stops.reduce((best, s, i) => {
        const d = Math.hypot(live.lat - parseFloat(s.latitude), live.lon - parseFloat(s.longitude));
        return d < best.d ? { i, d } : best;
      }, { i: 0, d: Infinity }).i
    : boardingIdx;

  const stopsAhead  = stops.length - currentBusStopIdx - 1;
  const displayDir  = dirOverride ?? journey.direction.toLowerCase();
  const scannerOpen = scan.phase !== "idle";

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-50 flex flex-col md:flex-row">

      {/* ── Desktop: left side panel ─────────────────────────────────────────── */}
      <div className="hidden md:flex md:w-80 lg:w-96 bg-white border-r border-slate-200 flex-col h-screen shrink-0 shadow-lg z-10">
        <SidePanelContent
          journey={journey}
          stops={stops}
          busNumber={busNumber}
          routeNumber={routeNumber}
          routeStartName={routeStartName}
          routeEndName={routeEndName}
          live={live}
          boardingIdx={boardingIdx}
          currentBusStopIdx={currentBusStopIdx}
          stopsAhead={stopsAhead}
          displayDir={displayDir}
          onDirOverride={setDirOverride}
          onScan={openScanner}
        />
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative h-full">
        <JourneyMap
          stops={stops}
          live={live}
          boardingStopIndex={boardingIdx}
          currentBusStopIndex={currentBusStopIdx}
        />

        {/* Top overlay: info bar + action buttons below it */}
        <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-4 space-y-2">

          {/* Info card */}
          <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl px-4 py-3 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Navigation size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Top row: chips + LIVE */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {routeNumber && (
                    <span className="text-[10px] font-black bg-primary text-white px-2 py-0.5 rounded-md">
                      {routeNumber}
                    </span>
                  )}
                  {busNumber && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                      <Hash size={9} />{busNumber}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-emerald-600 text-[10px] font-bold">LIVE</span>
                  </div>
                </div>
                {/* Route name */}
                {(routeStartName || routeEndName) && (
                  <p className="text-slate-500 text-[11px] font-semibold truncate leading-tight mb-0.5">
                    {routeStartName} → {routeEndName}
                  </p>
                )}
                {/* Boarding stop */}
                <p className="text-slate-900 font-black text-sm leading-tight truncate">
                  From: {journey.boardingStopName}
                </p>
                {/* Boarding time */}
                {journey.startedAt && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} className="text-slate-400 shrink-0" />
                    <p className="text-slate-400 text-[10px]">
                      Boarded {format(new Date(journey.startedAt), "MMM d · h:mm a")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Action buttons — top-right, below the info bar, mobile only */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="md:hidden flex items-center justify-end gap-2"
          >
            <button
              onClick={() => setMobilePanel(true)}
              className="h-10 px-3.5 rounded-xl bg-white/95 border border-slate-200 shadow-lg flex items-center gap-2 text-xs font-bold text-slate-600 backdrop-blur-xl"
            >
              <Info size={15} />
              Details
            </button>
            <button
              onClick={openScanner}
              className="h-10 px-4 rounded-xl bg-primary text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-primary/30 active:scale-95 transition-transform"
            >
              <QrCode size={15} />
              Scan to Exit
            </button>
          </motion.div>
        </div>
      </div>

      {/* ── Mobile: right-side drawer panel ─────────────────────────────────── */}
      <AnimatePresence>
        {mobilePanel && (
          <>
            <motion.div
              key="mob-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30 bg-black/30"
              onClick={() => setMobilePanel(false)}
            />
            <motion.div
              key="mob-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="md:hidden fixed inset-y-0 right-0 z-40 w-80 bg-white shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
                <p className="font-black text-slate-900 text-base">Journey Details</p>
                <button
                  onClick={() => setMobilePanel(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200"
                >
                  <X size={15} className="text-slate-600" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SidePanelContent
                  journey={journey}
                  stops={stops}
                  busNumber={busNumber}
                  routeNumber={routeNumber}
                  routeStartName={routeStartName}
                  routeEndName={routeEndName}
                  live={live}
                  boardingIdx={boardingIdx}
                  currentBusStopIdx={currentBusStopIdx}
                  stopsAhead={stopsAhead}
                  displayDir={displayDir}
                  onDirOverride={setDirOverride}
                  onScan={() => { setMobilePanel(false); openScanner(); }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── QR scanner modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {scannerOpen && (
          <motion.div key="scanner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white flex flex-col">
            <div className="flex items-center justify-between px-5 pt-12 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <QrCode size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-slate-900 font-black text-base">Scan to Exit</p>
                  <p className="text-slate-500 text-xs">Point at the QR code inside the bus</p>
                </div>
              </div>
              <button onClick={closeScanner} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200">
                <X size={18} className="text-slate-600" />
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10 bg-slate-50">
              {scan.phase === "requesting" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full border-4 border-primary/20 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                  </div>
                  <p className="text-slate-600 font-semibold">Requesting camera access…</p>
                </div>
              )}

              {scan.phase === "scanning" && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
                  <div className="relative rounded-3xl overflow-hidden bg-black border border-slate-300 shadow-2xl">
                    <div className="absolute top-4 left-4  w-7 h-7 border-t-4 border-l-4 border-primary rounded-tl-lg z-10 pointer-events-none" />
                    <div className="absolute top-4 right-4 w-7 h-7 border-t-4 border-r-4 border-primary rounded-tr-lg z-10 pointer-events-none" />
                    <div className="absolute bottom-4 left-4  w-7 h-7 border-b-4 border-l-4 border-primary rounded-bl-lg z-10 pointer-events-none" />
                    <div className="absolute bottom-4 right-4 w-7 h-7 border-b-4 border-r-4 border-primary rounded-br-lg z-10 pointer-events-none" />
                    <div className="absolute inset-x-4 top-4 bottom-4 z-10 pointer-events-none overflow-hidden rounded-2xl">
                      <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_2px_hsl(var(--primary))]"
                        animate={{ top: ["12%", "88%", "12%"] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                    <div id="journey-qr-reader" className="w-full" style={{ minHeight: 300 }} />
                  </div>
                  <p className="text-center text-xs text-slate-400 mt-4">Hold steady · Good lighting helps</p>
                </motion.div>
              )}

              {scan.phase === "processing" && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 size={36} className="animate-spin text-primary" />
                  </div>
                  <p className="text-slate-600 font-semibold">Calculating your fare…</p>
                </div>
              )}

              {scan.phase === "success" && (
                <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 text-center w-full max-w-xs">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}
                    className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle size={52} className="text-primary" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-black text-primary mb-1">Journey Complete!</h2>
                    <p className="text-slate-500 text-sm">Arrived at</p>
                    <p className="text-slate-900 font-bold text-lg mt-1 flex items-center justify-center gap-2">
                      <MapPin size={16} className="text-primary shrink-0" />{scan.to}
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 w-full space-y-3 text-sm shadow-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Stops travelled</span><span className="font-bold text-slate-900">{scan.stops}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Fare charged</span>
                      <span className="font-black text-emerald-600 text-base flex items-center gap-1"><Coins size={14} /> {scan.fare} pts</span></div>
                    <div className="border-t border-slate-100 pt-3 flex justify-between">
                      <span className="text-slate-500">Remaining balance</span><span className="font-bold text-slate-900">{scan.balance} pts</span>
                    </div>
                  </div>
                  <Button className="w-full h-12 rounded-2xl font-bold" onClick={() => router.replace("/")}>Back to Map</Button>
                </motion.div>
              )}

              {scan.phase === "error" && (
                <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 text-center w-full max-w-xs">
                  <div className="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center">
                    <XCircle size={52} className="text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-red-500 mb-2">Something went wrong</h2>
                    <p className="text-slate-500 text-sm leading-relaxed">{scan.message}</p>
                  </div>
                  <Button className="w-full h-12 rounded-2xl font-bold" onClick={openScanner}>Try Again</Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exit warning ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showExitWarn && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center px-6">
            <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.85 }}
              className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <Shield size={20} className="text-amber-500" />
                </div>
                <button onClick={() => setShowExitWarn(false)}><X size={18} className="text-slate-400" /></button>
              </div>
              <h3 className="text-slate-900 font-black text-lg mb-2">Can&apos;t leave yet</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                You have an active journey. Scan the bus QR code to exit and complete your payment.
              </p>
              <div className="flex flex-col gap-2">
                <Button className="h-12 rounded-2xl font-bold" onClick={() => { setShowExitWarn(false); openScanner(); }}>
                  <QrCode size={16} className="mr-2" /> Scan to Exit Now
                </Button>
                <Button variant="ghost" className="h-11 rounded-2xl text-slate-500" onClick={() => setShowExitWarn(false)}>
                  Stay on Journey
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Shared side panel content ───────────────────────────────────────────────── */
function SidePanelContent({
  journey, stops, busNumber, routeNumber, routeStartName, routeEndName, live,
  boardingIdx, currentBusStopIdx, stopsAhead, displayDir,
  onDirOverride, onScan,
}: {
  journey: Journey;
  stops: JourneyStop[];
  busNumber: string | null;
  routeNumber: string | null;
  routeStartName: string | null;
  routeEndName: string | null;
  live: LiveBusPosition | null;
  boardingIdx: number;
  currentBusStopIdx: number;
  stopsAhead: number;
  displayDir: string;
  onDirOverride: (d: "up" | "down") => void;
  onScan: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Navigation size={18} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-none">Active Journey</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-600 text-xs font-bold">LIVE</span>
            </div>
          </div>
        </div>

        {/* Route name */}
        {(routeStartName || routeEndName) && (
          <p className="text-slate-600 text-xs font-semibold truncate mb-2">
            {routeStartName} → {routeEndName}
          </p>
        )}

        {/* Chips: route number + bus number */}
        <div className="flex items-center gap-2 flex-wrap">
          {routeNumber && (
            <div className="flex items-center gap-1.5 bg-primary text-white rounded-lg px-2.5 py-1">
              <RouteIcon size={11} />
              <span className="text-xs font-black">Route {routeNumber}</span>
            </div>
          )}
          {busNumber && (
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1">
              <Hash size={11} className="text-slate-500" />
              <span className="text-xs font-bold text-slate-600">{busNumber}</span>
            </div>
          )}
          {!routeNumber && !busNumber && (
            <p className="text-xs text-slate-400 italic">Loading bus info…</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-slate-900">{stopsAhead}</p>
            <p className="text-xs text-slate-500 mt-0.5">Stops ahead</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-slate-900">{Math.round(live?.speed ?? 0)}</p>
            <p className="text-xs text-slate-500 mt-0.5">km/h</p>
          </div>
        </div>
      </div>

      {/* Direction toggle */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpDown size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Direction</span>
        </div>
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => onDirOverride("up")}
            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-0.5",
              displayDir === "up" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <ChevronUp size={12} />UP
          </button>
          <button
            onClick={() => onDirOverride("down")}
            className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-0.5",
              displayDir === "down" ? "bg-white text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <ChevronDown size={12} />DOWN
          </button>
        </div>
      </div>

      {/* Vertical stops tree — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Route Stops</p>
        <StopsTree stops={stops} boardingIdx={boardingIdx} currentIdx={currentBusStopIdx} />
      </div>

      {/* Scan button */}
      <div className="px-5 py-4 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
          <Shield size={13} className="text-amber-500 shrink-0" />
          <p className="text-amber-700 text-xs leading-relaxed">Scan the bus QR code to exit and pay.</p>
        </div>
        <Button className="w-full h-11 rounded-2xl font-black text-sm flex items-center gap-2" onClick={onScan}>
          <QrCode size={16} />
          Scan QR to Exit Bus
        </Button>
      </div>
    </>
  );
}

/* ── Vertical stops tree ────────────────────────────────────────────────────── */
function StopsTree({
  stops, boardingIdx, currentIdx,
}: {
  stops: JourneyStop[];
  boardingIdx: number;
  currentIdx: number;
}) {
  if (!stops.length) return <p className="text-xs text-slate-400">No stops loaded.</p>;

  return (
    <div>
      {stops.map((stop, i) => {
        const isPassed   = i < currentIdx;
        const isCurrent  = i === currentIdx;
        const isBoarding = i === boardingIdx;
        const isLast     = i === stops.length - 1;

        return (
          <div key={stop._id} className="flex items-start gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  "w-3 h-3 rounded-full border-2 mt-0.5 transition-all",
                  isCurrent
                    ? "bg-primary border-primary scale-125 shadow-[0_0_8px_hsl(var(--primary)/0.5)]"
                    : isBoarding
                    ? "bg-emerald-500 border-emerald-500 scale-110"
                    : isPassed
                    ? "bg-slate-300 border-slate-300"
                    : "bg-white border-slate-300"
                )}
              />
              {!isLast && (
                <div className={cn("w-0.5 flex-1 my-0.5", isPassed ? "bg-slate-300" : "bg-slate-200")}
                  style={{ minHeight: 20 }}
                />
              )}
            </div>

            {/* Stop label */}
            <div className={cn("pb-3 flex-1 min-w-0", isLast ? "pb-0" : "")}>
              <p className={cn(
                "text-sm leading-tight",
                isCurrent  ? "font-black text-primary"
                : isBoarding ? "font-bold text-emerald-600"
                : isPassed   ? "font-medium text-slate-400"
                :              "font-medium text-slate-600"
              )}>
                {stop.name}
              </p>
              {isCurrent && (
                <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded-md inline-block mt-0.5">
                  Bus is here
                </span>
              )}
              {isBoarding && !isCurrent && (
                <span className="text-[10px] text-emerald-600 font-semibold">Boarded here</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
