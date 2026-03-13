"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, MapPin, Loader2, CheckCircle, XCircle, AlertTriangle, Bus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS, safeFetch } from "@/services/transportApi";

type ScanPhase =
  | "checking"       // checking for active journey
  | "scanning"       // camera active
  | "locating"       // got QR, getting GPS
  | "processing"     // calling board/alight API
  | "board_success"  // boarded successfully
  | "alight_success" // alighted successfully
  | "error";         // something went wrong

interface ScanResult {
  phase: "board_success" | "alight_success";
  journeyId: string;
  stopName: string;
  fareCharged?: number;
  newBalance?: number;
  stopsTravelled?: number;
}

async function getToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) || "";
}

export default function ScanInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [phase,       setPhase]       = useState<ScanPhase>("checking");
  const [errorMsg,    setErrorMsg]    = useState("");
  const [result,      setResult]      = useState<ScanResult | null>(null);
  const [activeJourney, setActiveJourney] = useState<{ _id: string; deviceId: string } | null>(null);

  const scannerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // ── initial check: does the user already have an active journey? ──────────
  useEffect(() => {
    mountedRef.current = true;
    checkActive();
    return () => { mountedRef.current = false; };
  }, []);

  async function checkActive() {
    setPhase("checking");
    try {
      const token = await getToken();
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mountedRef.current) return;
      if (error) { setPhase("scanning"); return; }
      if (data?.journey) {
        setActiveJourney(data.journey);
        // Redirect straight to the journey map
        router.replace(`/journey/${data.journey._id}`);
      } else {
        setPhase("scanning");
      }
    } catch {
      if (mountedRef.current) setPhase("scanning");
    }
  }

  // ── start html5-qrcode scanner ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "scanning") return;

    let scanner: any = null;

    async function startScanner() {
      // Explicitly request camera permission first so mobile browsers
      // show the native permission dialog before html5-qrcode tries to use it.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        // Stop the test stream immediately — html5-qrcode will open its own
        stream.getTracks().forEach((t) => t.stop());
      } catch (err: any) {
        if (!mountedRef.current) return;
        const msg = err?.name === "NotAllowedError"
          ? "Camera permission was denied. Please allow camera access in your browser settings and try again."
          : err?.name === "NotFoundError"
          ? "No camera found on this device."
          : "Camera not available. Make sure camera permissions are granted.";
        setErrorMsg(msg);
        setPhase("error");
        return;
      }

      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");
        scanner = new Html5QrcodeScanner(
          "qr-reader",
          { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
          false
        );
        scannerRef.current = scanner;
        scanner.render(
          (decoded: string) => handleScanned(decoded, scanner),
          () => {}
        );
      } catch {
        if (mountedRef.current) {
          setErrorMsg("Camera not available. Make sure camera permissions are granted.");
          setPhase("error");
        }
      }
    }

    startScanner();

    return () => {
      try { scanner?.clear(); } catch { /* ignore */ }
    };
  }, [phase]);

  // ── handle a scanned QR value ─────────────────────────────────────────────
  const handleScanned = useCallback(async (rawValue: string, scanner: any) => {
    // Stop scanner immediately
    try { await scanner?.clear(); } catch { /* ignore */ }
    if (!mountedRef.current) return;

    // Extract deviceId from URL: /scan?d=DEVICE_ID
    let deviceId = "";
    try {
      const url    = new URL(rawValue);
      deviceId     = url.searchParams.get("d") || "";
    } catch {
      // Maybe it's just a plain deviceId string
      deviceId = rawValue.trim();
    }

    if (!deviceId) {
      setErrorMsg("This QR code is not a valid bus payment code. Please scan the QR code displayed on the bus.");
      setPhase("error");
      return;
    }

    setPhase("locating");

    // Get user GPS
    let userLat: number | null = null;
    let userLon: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 10000 })
      );
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
    } catch {
      // GPS failed — backend will use bus GPS as fallback
    }

    setPhase("processing");

    const token = await getToken();

    // Check active journey — if active on this device → alight, else → board
    const { data: activeData } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mountedRef.current) return;

    const activeJourneyData = activeData?.journey;

    if (activeJourneyData && activeJourneyData.deviceId === deviceId) {
      // ALIGHT
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ALIGHT, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ deviceId, userLat, userLon }),
      });

      if (!mountedRef.current) return;
      if (error) { setErrorMsg(error); setPhase("error"); return; }

      setResult({
        phase:          "alight_success",
        journeyId:      String(data.journey._id),
        stopName:       data.to,
        fareCharged:    data.fareCharged,
        newBalance:     data.newBalance,
        stopsTravelled: data.stopsTravelled,
      });
      setPhase("alight_success");

    } else if (activeJourneyData && activeJourneyData.deviceId !== deviceId) {
      // Already on a different bus
      setErrorMsg(`You are currently on a different bus journey. Scan the QR on your current bus (device: ...${activeJourneyData.deviceId.slice(-6)}) to exit first.`);
      setPhase("error");

    } else {
      // BOARD
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_BOARD, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ deviceId, userLat, userLon }),
      });

      if (!mountedRef.current) return;
      if (error) { setErrorMsg(error); setPhase("error"); return; }

      setResult({
        phase:     "board_success",
        journeyId: String(data.journey._id),
        stopName:  data.journey.boardingStopName,
      });
      setPhase("board_success");
    }
  }, []);

  // ── helpers ───────────────────────────────────────────────────────────────
  function retryScanner() {
    setErrorMsg("");
    setPhase("scanning");
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-12 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <QrCode size={18} className="text-primary" />
          </div>
          <h1 className="text-xl font-black">Scan Bus QR</h1>
        </div>
        <p className="text-slate-400 text-sm ml-12">
          {phase === "scanning"
            ? "Point your camera at the QR code displayed inside the bus"
            : phase === "checking"
            ? "Checking your journey status…"
            : phase === "locating"
            ? "Getting your location…"
            : phase === "processing"
            ? "Processing…"
            : ""}
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        <AnimatePresence mode="wait">

          {/* ── checking / locating / processing ── */}
          {(phase === "checking" || phase === "locating" || phase === "processing") && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-5"
            >
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-2 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  {phase === "locating" ? (
                    <MapPin size={28} className="text-primary" />
                  ) : (
                    <Bus size={28} className="text-primary" />
                  )}
                </div>
              </div>
              <p className="text-slate-300 font-semibold text-center">
                {phase === "checking"   && "Checking journey status…"}
                {phase === "locating"   && "Getting your GPS location…"}
                {phase === "processing" && "Processing your journey…"}
              </p>
            </motion.div>
          )}

          {/* ── camera scanner ── */}
          {phase === "scanning" && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-sm"
            >
              <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-700 shadow-2xl">
                {/* Corner decorations */}
                <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg z-10 pointer-events-none" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg z-10 pointer-events-none" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg z-10 pointer-events-none" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg z-10 pointer-events-none" />

                {/* Scan line animation */}
                <div className="absolute inset-x-4 top-4 bottom-4 z-10 pointer-events-none overflow-hidden rounded-2xl">
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_12px_2px_hsl(var(--primary))]"
                    animate={{ top: ["12%", "88%", "12%"] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>

                <div id="qr-reader" className="w-full" style={{ minHeight: 300 }} />
              </div>

              <p className="text-center text-xs text-slate-500 mt-4">
                Hold steady · Good lighting helps
              </p>
            </motion.div>
          )}

          {/* ── board success ── */}
          {phase === "board_success" && result && (
            <motion.div
              key="board_ok"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="w-24 h-24 rounded-full bg-emerald-500/15 flex items-center justify-center"
              >
                <CheckCircle size={52} className="text-emerald-400" />
              </motion.div>

              <div>
                <h2 className="text-2xl font-black text-emerald-400 mb-1">Boarded!</h2>
                <p className="text-slate-300 text-sm">
                  Journey started from
                </p>
                <p className="text-white font-bold text-lg mt-1 flex items-center justify-center gap-2">
                  <MapPin size={16} className="text-primary shrink-0" />
                  {result.stopName}
                </p>
              </div>

              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl px-5 py-4 text-sm text-slate-300 text-center w-full max-w-xs">
                <AlertTriangle size={14} className="inline mr-1.5 text-amber-400" />
                You cannot leave this screen until you exit the bus.
              </div>

              <Button
                className="h-14 px-8 rounded-2xl font-black text-base bg-primary hover:bg-primary/90 flex items-center gap-2"
                onClick={() => router.replace(`/journey/${result.journeyId}`)}
              >
                Open Journey Map <ArrowRight size={18} />
              </Button>
            </motion.div>
          )}

          {/* ── alight success ── */}
          {phase === "alight_success" && result && (
            <motion.div
              key="alight_ok"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center"
              >
                <CheckCircle size={52} className="text-primary" />
              </motion.div>

              <div>
                <h2 className="text-2xl font-black text-primary mb-1">Journey Complete!</h2>
                <p className="text-slate-300 text-sm">Arrived at</p>
                <p className="text-white font-bold text-lg mt-1 flex items-center justify-center gap-2">
                  <MapPin size={16} className="text-primary shrink-0" />
                  {result.stopName}
                </p>
              </div>

              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 w-full max-w-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Stops travelled</span>
                  <span className="font-bold text-white">{result.stopsTravelled}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Fare charged</span>
                  <span className="font-black text-emerald-400 text-lg">{result.fareCharged} pts</span>
                </div>
                <div className="border-t border-slate-700 pt-3 flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Remaining balance</span>
                  <span className="font-bold text-white">{result.newBalance} pts</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  className="h-12 rounded-2xl font-bold bg-primary hover:bg-primary/90"
                  onClick={() => router.replace("/")}
                >
                  Back to Map
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-2xl font-bold border-slate-700 text-slate-300"
                  onClick={() => router.replace("/wallet")}
                >
                  View Wallet
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── error ── */}
          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div className="w-24 h-24 rounded-full bg-red-500/15 flex items-center justify-center">
                <XCircle size={52} className="text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-red-400 mb-2">Something went wrong</h2>
                <p className="text-slate-400 text-sm max-w-xs leading-relaxed">{errorMsg}</p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  className="h-12 rounded-2xl font-bold bg-primary"
                  onClick={retryScanner}
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="h-12 rounded-2xl font-bold border-slate-700 text-slate-300"
                  onClick={() => router.replace("/")}
                >
                  Go Home
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
