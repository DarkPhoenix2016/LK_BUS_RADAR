"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  QrCode, MapPin, CheckCircle, XCircle, AlertTriangle, 
  Bus, ArrowRight, RefreshCw, X, Loader2, Camera 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { API_ENDPOINTS, safeFetch } from "@/services/transportApi";

type ScanPhase =
  | "checking"
  | "scanning"
  | "locating"
  | "processing"
  | "board_success"
  | "alight_success"
  | "error";

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
  const router = useRouter();

  const [phase, setPhase] = useState<ScanPhase>("checking");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  
  // Camera management
  const [cameras, setCameras] = useState<any[]>([]);
  const [activeCamIdx, setActiveCamIdx] = useState(0);
  const [isStarting, setIsStarting] = useState(false);

  const scannerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  // ── initial check ──────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    checkActive();
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkActive() {
    setPhase("checking");
    try {
      const token = await getToken();
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mountedRef.current) return;
      
      if (data?.journey) {
        router.replace(`/journey/${data.journey._id}`);
      } else {
        setPhase("scanning");
      }
    } catch {
      if (mountedRef.current) setPhase("scanning");
    }
  }

  // ── camera lifecycle ───────────────────────────────────────────────────────
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error("Failed to stop scanner", err);
      }
      scannerRef.current = null;
    }
  };

  const startCamera = async (cameraId: string) => {
    if (!mountedRef.current) return;
    setIsStarting(true);
    await stopScanner();

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-video-container");
      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        { 
          fps: 20, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0 
        },
        (decoded: string) => handleScanned(decoded),
        () => {}
      );
    } catch (err) {
      console.error("Camera start error", err);
      setErrorMsg("Could not start camera. Please ensure permissions are granted.");
      setPhase("error");
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (phase !== "scanning") return;

    async function initCamera() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        
        // Request permission and get devices
        const devices = await Html5Qrcode.getCameras();
        if (!mountedRef.current) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Auto-select back camera if possible
          const backCamIdx = devices.findIndex(d => 
            d.label.toLowerCase().includes("back") || 
            d.label.toLowerCase().includes("environment") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.toLowerCase().includes("camera 0")
          );
          const startIdx = backCamIdx !== -1 ? backCamIdx : 0;
          setActiveCamIdx(startIdx);
          await startCamera(devices[startIdx].id);
        } else {
          setErrorMsg("No cameras found on this device.");
          setPhase("error");
        }
      } catch (err: any) {
        if (!mountedRef.current) return;
        setErrorMsg("Camera permission denied or not available.");
        setPhase("error");
      }
    }

    initCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cycleCamera = async () => {
    if (cameras.length < 2 || isStarting) return;
    const nextIdx = (activeCamIdx + 1) % cameras.length;
    setActiveCamIdx(nextIdx);
    await startCamera(cameras[nextIdx].id);
  };

  // ── scanning logic ─────────────────────────────────────────────────────────
  const handleScanned = async (rawValue: string) => {
    await stopScanner();
    if (!mountedRef.current) return;

    let deviceId = "";
    try {
      const url = new URL(rawValue);
      deviceId = url.searchParams.get("d") || "";
    } catch {
      deviceId = rawValue.trim();
    }

    if (!deviceId) {
      setErrorMsg("Invalid QR code. Please scan the QR code on the bus.");
      setPhase("error");
      return;
    }

    setPhase("locating");

    let userLat: number | null = null;
    let userLon: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
    } catch { /* ignore */ }

    setPhase("processing");
    const token = await getToken();

    // Determine board or alight
    const { data: activeData } = await safeFetch(API_ENDPOINTS.JOURNEY_ACTIVE, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mountedRef.current) return;
    const activeJ = activeData?.journey;

    if (activeJ && activeJ.deviceId === deviceId) {
      // ALIGHT
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_ALIGHT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, userLat, userLon }),
      });
      if (error) { setErrorMsg(error); setPhase("error"); return; }
      setResult({
        phase: "alight_success",
        journeyId: String(data.journey._id),
        stopName: data.to,
        fareCharged: data.fareCharged,
        newBalance: data.newBalance,
        stopsTravelled: data.stopsTravelled,
      });
      setPhase("alight_success");
    } else if (activeJ) {
      setErrorMsg("You are already on another bus journey. Please exit that bus first.");
      setPhase("error");
    } else {
      // BOARD
      const { data, error } = await safeFetch(API_ENDPOINTS.JOURNEY_BOARD, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, userLat, userLon }),
      });
      if (error) { setErrorMsg(error); setPhase("error"); return; }
      setResult({
        phase: "board_success",
        journeyId: String(data.journey._id),
        stopName: data.journey.boardingStopName,
      });
      setPhase("board_success");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Target video elements styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        #qr-video-container video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 2rem !important;
        }
        #qr-video-container canvas {
          display: none !important;
        }
      `}} />

      {/* Top Header */}
      <div className="w-full max-w-md px-6 pt-10 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <QrCode className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-tight">Bus Radar</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">QR Scanner</p>
          </div>
        </div>
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors shadow-sm"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 w-full max-w-md flex flex-col items-center px-6">
        <AnimatePresence mode="wait">
          
          {/* Scanning Phase */}
          {phase === "scanning" && (
            <motion.div 
              key="scan"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full space-y-6"
            >
              <div className="relative aspect-square w-full bg-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl border-4 border-white">
                {/* The actual scanner container */}
                <div id="qr-video-container" className="w-full h-full" />
                
                {/* Visual Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/5">
                  <div className="w-64 h-64 relative">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-[6px] border-l-[6px] border-primary rounded-tl-2xl shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-[6px] border-r-[6px] border-primary rounded-tr-2xl shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-[6px] border-l-[6px] border-primary rounded-bl-2xl shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-[6px] border-r-[6px] border-primary rounded-br-2xl shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    
                    {/* Animated Scan Line */}
                    <motion.div 
                      className="absolute left-2 right-2 h-1 bg-primary/80 shadow-[0_0_15px_rgba(59,130,246,0.8)] rounded-full"
                      animate={{ top: ["5%", "95%", "5%"] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                </div>

                {/* Camera Toggle Button */}
                {cameras.length > 1 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); cycleCamera(); }}
                    className="absolute bottom-6 right-6 w-14 h-14 bg-white/80 backdrop-blur-md rounded-2xl flex items-center justify-center text-slate-900 hover:bg-white transition-all active:scale-90 pointer-events-auto shadow-xl border border-white/50"
                  >
                    <RefreshCw size={24} className={isStarting ? "animate-spin" : ""} />
                  </button>
                )}

                {isStarting && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                    <Loader2 className="animate-spin text-primary" size={32} />
                    <p className="text-xs font-bold text-primary uppercase tracking-tighter">Switching Lens</p>
                  </div>
                )}
              </div>

              <div className="text-center space-y-2 bg-white/50 py-4 rounded-3xl border border-white/50 shadow-sm">
                <p className="text-slate-900 font-black">Scanning for Bus QR Code</p>
                <p className="text-slate-500 text-sm font-medium">Position the code inside the box</p>
              </div>
            </motion.div>
          )}

          {/* Loading Phases */}
          {(phase === "checking" || phase === "locating" || phase === "processing") && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 space-y-6"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-4 border-slate-200" />
                <div className="absolute w-24 h-24 rounded-full border-4 border-t-primary border-transparent animate-spin" />
                <div className="absolute bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
                  {phase === "locating" ? <MapPin className="text-primary" /> : <Bus className="text-primary" />}
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-900 font-black text-lg">
                  {phase === "checking" && "Checking Status"}
                  {phase === "locating" && "Finding Bus Stop"}
                  {phase === "processing" && "Finalizing Payment"}
                </p>
                <p className="text-slate-500 text-sm mt-1 italic">Please wait a moment...</p>
              </div>
            </motion.div>
          )}

          {/* Success Board */}
          {phase === "board_success" && result && (
            <motion.div key="board_ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full text-center space-y-8 py-10">
              <div className="relative mx-auto w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
                  <CheckCircle size={48} className="text-emerald-600" />
                </motion.div>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-slate-900">Welcome Aboard!</h2>
                <p className="text-slate-500">Boarded successfully at</p>
                <p className="text-xl font-bold text-primary flex items-center justify-center gap-2">
                  <MapPin size={18} /> {result.stopName}
                </p>
              </div>
              <Button 
                onClick={() => router.replace(`/journey/${result.journeyId}`)}
                className="w-full h-14 rounded-2xl text-lg font-black bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 flex items-center gap-3"
              >
                Track Journey <ArrowRight size={20} />
              </Button>
            </motion.div>
          )}

          {/* Success Alight */}
          {phase === "alight_success" && result && (
            <motion.div key="alight_ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full text-center space-y-6 py-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle size={40} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-slate-900">Journey Ended</h2>
                <p className="text-slate-500">Arrived at {result.stopName}</p>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">Stops</span>
                  <span className="font-black text-slate-900">{result.stopsTravelled} stops</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold text-sm">Fare</span>
                  <span className="text-xl font-black text-emerald-600">{result.fareCharged} pts</span>
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-slate-500 text-xs">New Balance</span>
                  <span className="font-bold text-slate-900 text-sm">{result.newBalance} pts</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button onClick={() => router.replace("/")} className="h-12 rounded-2xl font-black">Back to Home</Button>
                <Button variant="ghost" onClick={() => router.replace("/wallet")} className="h-12 rounded-2xl font-bold text-slate-500">View Wallet</Button>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {phase === "error" && (
            <motion.div key="err" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full text-center space-y-8 py-10">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <XCircle size={48} className="text-red-600" />
              </div>
              <div className="space-y-2 px-4">
                <h2 className="text-2xl font-black text-slate-900">Something went wrong</h2>
                <p className="text-slate-500 text-sm leading-relaxed">{errorMsg}</p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => { setErrorMsg(""); setPhase("scanning"); }} className="w-full h-14 rounded-2xl font-black bg-slate-900 hover:bg-slate-800">
                  Try Again
                </Button>
                <Button variant="ghost" onClick={() => router.replace("/")} className="w-full h-12 rounded-2xl font-bold text-slate-500">
                  Go Home
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Safety Note */}
      <div className="w-full max-w-md px-10 pb-10">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
            Ensure you scan the correct QR code on the bus. Payment will be deducted automatically based on your location.
          </p>
        </div>
      </div>
    </div>
  );
}
