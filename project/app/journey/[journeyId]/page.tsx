"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Bus, MapPin, QrCode, Shield, ChevronDown, Loader2,
  Navigation, CheckCircle, AlertTriangle, X, XCircle, Coins,
  Hash, Route as RouteIcon, Info, Clock, Users, Wallet, Zap, Footprints,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS, Journey, JourneyStop, LiveBusPosition, safeFetch } from "@/services/transportApi";

const JourneyMap = dynamic(() => import("./JourneyMap"), { ssr: false, loading: () => null });

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const [loading,          setLoading]          = useState(true);
  const [showExitWarn,     setShowExitWarn]     = useState(false);
  const [scan,             setScan]             = useState<ScanState>({ phase: "idle" });
  const [mobilePanel,      setMobilePanel]      = useState(false);
  const [panelMinimized,   setPanelMinimized]   = useState(false);
  const [busPassengers,    setBusPassengers]    = useState<{ activeJourneys: number; seatingCapacity: number | null; available: number | null } | null>(null);
  const [pointBalance,     setPointBalance]     = useState<number | null>(null);
  const [adminClosed,      setAdminClosed]      = useState<"completed" | "cancelled" | null>(null);

  const mountedRef = useRef(true);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannerRef = useRef<any>(null);

  // ── load journey ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    loadJourney();
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [journeyId]);

  async function loadJourney() {
    setLoading(true);
    try {
      const token = await getToken();

      // Try active journey first
      const { data: activeData } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!mountedRef.current) return;

      let data = activeData;

      // If active journey doesn't match this page's journeyId, fetch by ID (completed/cancelled)
      if (!activeData?.journey || activeData.journey._id !== journeyId) {
        const { data: byIdData } = await safeFetch(API_ENDPOINTS.JOURNEY_BY_ID(journeyId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (byIdData?.journey) data = byIdData;
      }

      if (!mountedRef.current) return;

      if (!data?.journey) {
        setLoading(false);
        return;
      }

      setJourney(data.journey);
      setStops(data.stops || []);
      setLive(data.live || null);

      const bNum = data.busNumber || data.journey?.busNumber;
      const rNum = data.routeNumber || data.journey?.routeNumber;
      const rsName = data.routeStartName || data.journey?.routeStartName;
      const reName = data.routeEndName || data.journey?.routeEndName;

      setBusNumber(bNum || null);
      setRouteNumber(rNum || null);
      setRouteStartName(rsName || null);
      setRouteEndName(reName || null);

      // Fetch bus occupancy (public endpoint, no auth needed)
      const { data: pData } = await safeFetch(API_ENDPOINTS.BUS_PASSENGERS(data.journey.deviceId));
      if (mountedRef.current && pData?.data) setBusPassengers(pData.data);

      // Fetch user point balance (for low-balance warning)
      const { data: pointsData } = await safeFetch(API_ENDPOINTS.USER_POINTS, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mountedRef.current && pointsData?.data?.balance !== undefined) setPointBalance(pointsData.data.balance);

      setLoading(false);

      // Only poll live position for active journeys
      if (data.journey.status === 'active') {
        startPolling(data.journey.deviceId);
      }
    } catch (err) {
      console.error("[Journey] Unexpected error in loadJourney:", err);
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
      try {
        const token = await getToken();
        const { data: pointsData } = await safeFetch(API_ENDPOINTS.USER_POINTS, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mountedRef.current && pointsData?.data?.balance !== undefined) setPointBalance(pointsData.data.balance);
      } catch { /* ignore */ }
    }, 30_000);

    // Poll journey status every 15s to detect admin-initiated close
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const token = await getToken();
        const { data } = await safeFetch(API_ENDPOINTS.JOURNEY_BY_ID(journeyId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mountedRef.current) return;
        const newStatus = data?.journey?.status;
        if (newStatus && newStatus !== "active") {
          // Admin closed the journey — update state and stop polling
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
          setAdminClosed(newStatus as "completed" | "cancelled");
          setJourney(data.journey);
          if (data.stops) setStops(data.stops);
        }
      } catch { /* ignore */ }
    }, 15_000);
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
    setJourney((j) => j ? {
      ...j,
      status: "completed",
      fareCharged: data.fareCharged,
      stopsTravelled: data.stopsTravelled,
      alightingStopName: data.to,
      endedAt: new Date().toISOString(),
    } : j);
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

  if (journey.status === "cancelled") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-20 h-20 rounded-2xl bg-red-100 flex items-center justify-center">
          <XCircle className="text-red-500" size={40} />
        </div>
        <h2 className="text-xl font-bold text-slate-900 text-center">Journey Cancelled</h2>
        <p className="text-slate-500 text-sm text-center max-w-xs">
          This journey was cancelled by an administrator. Any fare charges have been reversed.
        </p>
        <Button onClick={() => router.replace("/journeys")} className="rounded-xl mt-2">
          View Journey History
        </Button>
        <Button variant="outline" onClick={() => router.replace("/")} className="rounded-xl">
          Back to Map
        </Button>
      </div>
    );
  }

  if (journey.status === "completed") {
    const durationMs = journey.startedAt && journey.endedAt
      ? new Date(journey.endedAt).getTime() - new Date(journey.startedAt).getTime()
      : null;
    const durationMin = durationMs ? Math.round(durationMs / 60000) : null;
    const boardingIdx2  = journey.boardingStopIndex;
    const alightingIdx2 = journey.alightingStopIndex ?? stops.length - 1;

    // Distance between traveled stops
    let distanceKm = 0;
    const takenStops = stops.slice(
      Math.min(boardingIdx2, alightingIdx2),
      Math.max(boardingIdx2, alightingIdx2) + 1
    );
    for (let i = 0; i < takenStops.length - 1; i++) {
      const s1 = takenStops[i];
      const s2 = takenStops[i + 1];
      distanceKm += haversineKm(
        parseFloat(s1.latitude), parseFloat(s1.longitude),
        parseFloat(s2.latitude), parseFloat(s2.longitude)
      );
    }

    const avgSpeed = distanceKm > 0 && durationMin && durationMin > 0
      ? distanceKm / (durationMin / 60)
      : 0;

    return (
      <div className="relative w-full h-screen overflow-hidden bg-slate-100 flex flex-col md:flex-row">

        {/* ── Desktop: left summary panel ──────────────────────────────────── */}
        <div className="hidden md:flex md:w-[400px] bg-white border-r border-slate-200 flex-col h-screen shrink-0 shadow-xl z-10">

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">

            {/* Back nav */}
            <div className="px-6 pt-5">
              <button
                onClick={() => router.replace("/journeys")}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronDown size={13} className="rotate-90" /> Journey History
              </button>
            </div>

            {/* Admin-closed notice */}
            {adminClosed === "completed" && (
              <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <Shield size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs font-bold text-amber-700">This journey was completed by an administrator.</p>
              </div>
            )}

            {/* Celebration header */}
            <div className="px-6 pt-4 pb-5 border-b border-slate-100">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="flex items-center gap-4 mb-4"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                  <CheckCircle size={30} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 leading-tight">Journey Complete!</h2>
                  {journey.endedAt && (
                    <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {format(new Date(journey.endedAt), "EEEE, MMM d · h:mm a")}
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Route / bus chips */}
              <div className="flex gap-2 flex-wrap">
                {routeNumber && (
                  <span className="flex items-center gap-1 bg-primary text-white rounded-lg px-3 py-1 text-xs font-black">
                    <RouteIcon size={10} /> Route {routeNumber}
                  </span>
                )}
                {busNumber && (
                  <span className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-1 text-xs font-bold text-slate-600">
                    <Hash size={10} /> {busNumber}
                  </span>
                )}
              </div>
            </div>

            {/* Journey timeline */}
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex gap-3">
                <div className="flex flex-col items-center shrink-0 pt-0.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm" />
                  <div className="w-px flex-1 bg-slate-200 my-1.5" style={{ minHeight: 40 }} />
                  <div className="w-3 h-3 rounded-full bg-primary shadow-sm" />
                </div>
                <div className="flex-1 space-y-5">
                  <div>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-0.5">Boarded</p>
                    <p className="text-sm font-black text-slate-900 leading-tight">{journey.boardingStopName}</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {journey.startedAt ? format(new Date(journey.startedAt), "h:mm a") : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-0.5">Alighted</p>
                    <p className="text-sm font-black text-slate-900 leading-tight">{journey.alightingStopName || "Terminal"}</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {journey.endedAt ? format(new Date(journey.endedAt), "h:mm a") : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="px-6 py-5 border-b border-slate-100">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Trip Statistics</p>
              <div className="grid grid-cols-2 gap-3">
                <SummaryStatCard icon={MapPin}      label="Distance"  value={distanceKm.toFixed(2)} unit="km"   accent="blue" />
                <SummaryStatCard icon={Clock}       label="Duration"  value={durationMin ? String(durationMin) : "—"} unit="min" accent="violet" />
                <SummaryStatCard icon={Zap}         label="Avg Speed" value={String(Math.round(avgSpeed))} unit="km/h" accent="amber" />
                <SummaryStatCard icon={Footprints}  label="Stops"     value={String(journey.stopsTravelled ?? "—")} unit="stops" accent="emerald" />
              </div>
            </div>

            {/* Points / fare card */}
            <div className="px-6 py-5 border-b border-slate-100">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-xl shadow-emerald-500/25"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Points Spent</p>
                    <div className="flex items-end gap-1.5">
                      <p className="text-4xl font-black leading-none">{journey.fareCharged ?? 0}</p>
                      <p className="text-emerald-200 text-sm font-bold mb-1">pts</p>
                    </div>
                    {journey.fareSectionName && (
                      <p className="text-emerald-100 text-[10px] font-bold mt-2 uppercase tracking-wider opacity-90">
                        {journey.fareSectionName}
                      </p>
                    )}
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Coins size={22} className="opacity-90" />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Route stops tree */}
            <div className="px-6 py-5">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Route Stops</p>
              <StopsTree stops={stops} boardingIdx={boardingIdx2} currentIdx={alightingIdx2} />
            </div>
          </div>

          {/* CTA buttons */}
          <div className="px-6 py-5 border-t border-slate-100 bg-white shrink-0 space-y-2">
            <Button
              className="w-full h-12 rounded-2xl font-black text-sm shadow-xl shadow-primary/10"
              onClick={() => router.replace("/")}
            >
              Back to Map
            </Button>
            <button
              onClick={() => router.replace("/journeys")}
              className="w-full h-10 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              View Journey History
            </button>
          </div>
        </div>

        {/* ── Map (full screen background) ─────────────────────────────────── */}
        <div className="flex-1 relative h-full">
          <JourneyMap
            stops={stops}
            live={null}
            boardingStopIndex={boardingIdx2}
            currentBusStopIndex={alightingIdx2}
            isCompleted={true}
          />

          {/* ── Mobile: bottom summary sheet ─────────────────────────────── */}
          <motion.div
            className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white rounded-t-[2.5rem] border-t border-slate-200 shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 220, delay: 0.1 }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-slate-200" />
            </div>

            <div className="px-5 pb-10 pt-2 space-y-4">
              {/* Admin-closed notice */}
              {adminClosed === "completed" && (
                <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <Shield size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-bold text-amber-700">Completed by an administrator.</p>
                </div>
              )}

              {/* Header row */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-900 text-base leading-tight">Journey Summary</h3>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-tighter">Completed</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center shrink-0">
                  <p className="text-xl font-black text-emerald-600">{journey.fareCharged ?? 0}</p>
                  <p className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">pts</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                <MobileStatPill label="km"    value={distanceKm.toFixed(1)} />
                <MobileStatPill label="min"   value={durationMin != null ? String(durationMin) : "—"} />
                <MobileStatPill label="km/h"  value={String(Math.round(avgSpeed))} />
                <MobileStatPill label="stops" value={String(journey.stopsTravelled ?? "—")} />
              </div>

              {/* Journey stops line */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <div className="w-px flex-1 bg-slate-200 my-1" style={{ minHeight: 24 }} />
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-700 truncate">{journey.boardingStopName}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {journey.startedAt ? format(new Date(journey.startedAt), "h:mm a") : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 truncate">{journey.alightingStopName || "End Terminal"}</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {journey.endedAt ? format(new Date(journey.endedAt), "h:mm a") : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <Button
                className="w-full h-12 rounded-2xl font-black shadow-lg shadow-primary/20"
                onClick={() => router.replace("/")}
              >
                Back to Map
              </Button>
              <button
                onClick={() => router.replace("/journeys")}
                className="w-full h-9 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                View History
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  function SummaryStatCard({
    icon: Icon,
    label,
    value,
    unit,
    accent,
  }: {
    icon: any;
    label: string;
    value: string;
    unit: string;
    accent: "blue" | "violet" | "amber" | "emerald";
  }) {
    const colorMap = {
      blue:    "bg-blue-50   border-blue-100   text-blue-600",
      violet:  "bg-violet-50 border-violet-100 text-violet-600",
      amber:   "bg-amber-50  border-amber-100  text-amber-600",
      emerald: "bg-emerald-50 border-emerald-100 text-emerald-600",
    };
    return (
      <div className={`border rounded-2xl p-4 ${colorMap[accent]}`}>
        <div className="flex items-center gap-1.5 mb-2">
          <Icon size={11} className="opacity-70" />
          <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</p>
        </div>
        <div className="flex items-end gap-1">
          <p className="text-2xl font-black leading-none">{value}</p>
          <p className="text-xs font-bold opacity-60 mb-0.5">{unit}</p>
        </div>
      </div>
    );
  }

  function MobileStatPill({ label, value }: { label: string; value: string }) {
    return (
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-center">
        <p className="text-base font-black text-slate-900">{value}</p>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
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
          busPassengers={busPassengers}
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

          {/* Low-balance warning */}
          {pointBalance !== null && pointBalance <= 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/95 backdrop-blur-xl text-white rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3"
            >
              <Wallet size={16} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm">Insufficient Balance</p>
                <p className="text-xs opacity-90">Please top up your wallet to continue.</p>
              </div>
              <button
                onClick={() => router.push("/wallet")}
                className="text-xs font-black bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 shrink-0 transition-colors"
              >
                Top Up
              </button>
            </motion.div>
          )}

          {/* Action buttons — top-right, below the info bar, mobile only */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="md:hidden flex items-center justify-end gap-2"
          >
            <button
              onClick={() => { setPanelMinimized(false); setMobilePanel(true); }}
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

      {/* ── Mobile: bottom sheet panel ───────────────────────────────────────── */}
      <AnimatePresence>
        {mobilePanel && (
          <>
            {/* Backdrop — only visible when expanded */}
            <motion.div
              key="mob-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: panelMinimized ? 0 : 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30 bg-black/30 pointer-events-none"
              style={{ pointerEvents: panelMinimized ? "none" : "auto" }}
              onClick={() => { if (!panelMinimized) setMobilePanel(false); }}
            />
            <motion.div
              key="mobile-panel"
              initial={{ y: "100%" }}
              animate={{ y: panelMinimized ? "calc(100% - 52px)" : 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[80vh] bg-white shadow-2xl flex flex-col rounded-t-[2.5rem] border-t border-slate-200"
            >
              {/* Notch — tap to toggle minimize/expand */}
              <button
                onClick={() => setPanelMinimized((v) => !v)}
                className="w-full flex flex-col items-center pt-2.5 pb-1 shrink-0 touch-none"
              >
                <div className={cn(
                  "w-12 h-1.5 rounded-full transition-colors",
                  panelMinimized ? "bg-primary" : "bg-slate-200"
                )} />
                {panelMinimized && (
                  <p className="text-[10px] font-black text-primary mt-1 uppercase tracking-widest">Tap to expand</p>
                )}
              </button>

              <AnimatePresence>
                {!panelMinimized && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-col flex-1 min-h-0"
                  >
                    <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b border-slate-100 shrink-0">
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
                        busPassengers={busPassengers}
                        onScan={() => { setMobilePanel(false); openScanner(); }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
  boardingIdx, currentBusStopIdx, stopsAhead, busPassengers, onScan,
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
  busPassengers: { activeJourneys: number; seatingCapacity: number | null; available: number | null } | null;
  onScan: () => void;
}) {
  // Auto-detected direction from the journey (set at boarding time by the backend)
  const dir = journey.direction; // "UP" | "DOWN"
  const isUp = dir === "UP";

  // Distance traveled so far (boarding stop → current bus stop along stop sequence)
  let distanceSoFar = 0;
  const minIdx = Math.min(boardingIdx, currentBusStopIdx);
  const maxIdx = Math.max(boardingIdx, currentBusStopIdx);
  for (let i = minIdx; i < maxIdx; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (s1?.latitude && s1?.longitude && s2?.latitude && s2?.longitude) {
      distanceSoFar += haversineKm(
        parseFloat(s1.latitude), parseFloat(s1.longitude),
        parseFloat(s2.latitude), parseFloat(s2.longitude)
      );
    }
  }

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
          {/* Auto-direction badge */}
          <div className={cn(
            "flex items-center gap-1 rounded-lg px-2.5 py-1 shrink-0",
            isUp ? "bg-blue-50 border border-blue-200" : "bg-violet-50 border border-violet-200"
          )}>
            {isUp
              ? <ArrowUp size={11} className="text-blue-600" />
              : <ArrowDown size={11} className="text-violet-600" />
            }
            <span className={cn("text-[10px] font-black uppercase tracking-wider",
              isUp ? "text-blue-600" : "text-violet-600"
            )}>
              {isUp ? "UP" : "DOWN"}
            </span>
          </div>
        </div>

        {/* Route name */}
        {(routeStartName || routeEndName) && (
          <p className="text-slate-600 text-xs font-semibold truncate mb-2">
            {isUp ? `${routeStartName} → ${routeEndName}` : `${routeEndName} → ${routeStartName}`}
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

      {/* Stats — 4-cell grid: stops ahead, speed, distance, stops passed */}
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-slate-900">{stopsAhead}</p>
            <p className="text-xs text-slate-500 mt-0.5">Stops ahead</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-primary">{Math.round(live?.speed ?? 0)}</p>
            <p className="text-xs text-slate-500 mt-0.5">km/h now</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-slate-900">{distanceSoFar.toFixed(1)}</p>
            <p className="text-xs text-slate-500 mt-0.5">km traveled</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-slate-900">
              {Math.max(0, currentBusStopIdx - boardingIdx)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Stops passed</p>
          </div>
        </div>

        {/* Bus occupancy */}
        {busPassengers != null && (
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Users size={11} className="text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bus Occupancy</p>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <p className="text-lg font-black text-primary">{busPassengers.activeJourneys}</p>
                <p className="text-[9px] text-slate-400 font-bold">On board</p>
              </div>
              <div className="border-x border-slate-200">
                <p className="text-lg font-black text-emerald-600">{busPassengers.available ?? "—"}</p>
                <p className="text-[9px] text-slate-400 font-bold">Available</p>
              </div>
              <div>
                <p className="text-lg font-black text-slate-700">{busPassengers.seatingCapacity ?? "—"}</p>
                <p className="text-[9px] text-slate-400 font-bold">Capacity</p>
              </div>
            </div>
            {busPassengers.seatingCapacity != null && (
              <div className="mt-2 w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (busPassengers.activeJourneys / busPassengers.seatingCapacity) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vertical stops tree — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Route Stops</p>
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-bold rounded-md px-2 py-0.5",
            isUp ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"
          )}>
            {isUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {isUp ? "Upward" : "Downward"}
          </div>
        </div>
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
