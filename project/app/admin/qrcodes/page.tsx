"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  Bus,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  QrCode,
  RefreshCw,
  Route as RouteIcon,
  Search
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

type QRTab = "routes" | "buses" | "journey";

interface RouteRow {
  id?: string;
  _id?: string;
  routeNumber?: string;
  startStop?: { name?: string } | null;
  endStop?: { name?: string } | null;
}

interface BusRow {
  id: string;
  busNumber?: string;
  routeNumber?: string | null;
}

interface DeviceRow {
  id: string;
  imei?: number;
  busNumber?: string | null;
  routeNumber?: string | null;
  isOnline?: boolean;
}

interface SelectedItem {
  label: string;
  subLabel?: string;
  deepLink: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

async function fetchPagedFleet<T>(path: string): Promise<T[]> {
  const token = await getToken();
  const rows: T[] = [];
  let page = 1;
  let lastPage = 1;
  const perPage = 1000;

  do {
    const res = await fetch(`${API_BASE}/admin/fleet/${path}?page=${page}&perPage=${perPage}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || `Failed to fetch ${path}`);
    }

    rows.push(...(json.data || []));
    lastPage = Number(json.meta?.lastPage || 1);
    page += 1;
  } while (page <= lastPage);

  return rows;
}

function QRDisplay({ item }: { item: SelectedItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, item.deepLink, { width: 220, margin: 2 }, (err) => {
      if (!err) setReady(true);
    });
  }, [item.deepLink]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr_${item.label.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 flex items-center justify-center" style={{ minHeight: 250 }}>
        {!ready && <Loader2 size={28} className="animate-spin text-slate-300" />}
        <canvas ref={canvasRef} className={ready ? "block rounded-xl" : "hidden"} />
      </div>
      <div className="text-center">
        <p className="font-black text-slate-900 text-lg">{item.label}</p>
        {item.subLabel && <p className="text-sm text-slate-500 mt-0.5">{item.subLabel}</p>}
        <p className="text-[10px] text-slate-300 mt-1 font-mono break-all">{item.deepLink}</p>
      </div>
      <Button className="h-11 px-6 rounded-xl font-bold" onClick={handleDownload} disabled={!ready}>
        <Download size={15} className="mr-2" /> Download PNG
      </Button>
    </div>
  );
}

export default function QRCodesPage() {
  const [activeTab, setActiveTab] = useState<QRTab>("routes");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedItem | null>(null);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [buses, setBuses] = useState<BusRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [busesLoading, setBusesLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  async function loadRoutes() {
    setRoutesLoading(true);
    try {
      const rows = await fetchPagedFleet<RouteRow>("routes");
      setRoutes(rows);
    } catch (err) {
      notify.error("Failed to load routes.", { description: String(err) });
    } finally {
      setRoutesLoading(false);
    }
  }

  async function loadBuses() {
    setBusesLoading(true);
    try {
      const rows = await fetchPagedFleet<BusRow>("buses");
      setBuses(rows);
    } catch (err) {
      notify.error("Failed to load buses.", { description: String(err) });
    } finally {
      setBusesLoading(false);
    }
  }

  async function loadDevices() {
    setDevicesLoading(true);
    try {
      const rows = await fetchPagedFleet<DeviceRow>("devices");
      setDevices(rows);
    } catch (err) {
      notify.error("Failed to load devices.", { description: String(err) });
    } finally {
      setDevicesLoading(false);
    }
  }

  useEffect(() => {
    loadRoutes();
    loadBuses();
    loadDevices();
  }, []);

  const switchTab = (tab: QRTab) => {
    setActiveTab(tab);
    setSearch("");
    setSelected(null);
  };

  const q = search.toLowerCase().trim();

  const filteredDevices = devices.filter((d) => {
    if (!q) return true;
    return (
      String(d.imei || "").includes(q) ||
      (d.busNumber || "").toLowerCase().includes(q) ||
      (d.routeNumber || "").toLowerCase().includes(q)
    );
  });

  const filteredRoutes = routes.filter((r) => {
    if (!q) return true;
    const startName = r.startStop?.name || "";
    const endName = r.endStop?.name || "";
    return (
      (r.routeNumber || "").toLowerCase().includes(q) ||
      startName.toLowerCase().includes(q) ||
      endName.toLowerCase().includes(q)
    );
  });

  const filteredBuses = buses.filter((b) => {
    if (!q) return true;
    return (
      (b.busNumber || "").toLowerCase().includes(q) ||
      (b.routeNumber || "").toLowerCase().includes(q)
    );
  });

  const isLoading =
    activeTab === "routes" ? routesLoading :
    activeTab === "buses"  ? busesLoading  :
    devicesLoading;

  const filteredItems = activeTab === "routes" ? filteredRoutes : activeTab === "journey" ? filteredDevices : filteredBuses;
  const PER_PAGE = 20;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  useEffect(() => { setPage(1); }, [activeTab, search]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900">QR Codes</h1>
        <p className="text-slate-500 text-sm mt-1">
          Generate QR codes for routes, buses, or bus devices for the hands-free payment system.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => switchTab("routes")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
            activeTab === "routes"
              ? "bg-primary text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <RouteIcon size={15} /> Routes
        </button>
        <button
          onClick={() => switchTab("buses")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
            activeTab === "buses"
              ? "bg-primary text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <Bus size={15} /> Buses
        </button>
        <button
          onClick={() => switchTab("journey")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors",
            activeTab === "journey"
              ? "bg-emerald-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          <QrCode size={15} /> Journey QR
        </button>

        <Button
          variant="outline"
          size="sm"
          className="rounded-xl ml-auto"
          onClick={() => {
            setSelected(null);
            if (activeTab === "routes") loadRoutes();
            else if (activeTab === "journey") loadDevices();
            else loadBuses();
          }}
          disabled={isLoading}
        >
          <RefreshCw size={14} className="mr-1.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 620 }}>
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  activeTab === "routes"  ? "Search routes..." :
                  activeTab === "journey" ? "Search by IMEI, bus or route number..." :
                  "Search by bus or route number..."
                }
                className="pl-9 h-9 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-primary opacity-30" size={28} />
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="text-center text-slate-400 py-12 text-sm">
                No items found match your search.
              </p>
            ) : activeTab === "journey" ? (
              paginatedItems.map((item: any) => {
                const dev = item as DeviceRow;
                const deepLink   = `${siteUrl}/scan?d=${dev.id}`;
                const label      = dev.busNumber ? `Bus ${dev.busNumber}` : `Device ${dev.id.slice(-8)}`;
                const subLabel   = [dev.routeNumber ? `Route ${dev.routeNumber}` : null, dev.isOnline ? "● Online" : "○ Offline"].filter(Boolean).join("  ·  ");
                const isSelected = selected?.deepLink === deepLink;

                return (
                  <button
                    key={dev.id}
                    onClick={() => setSelected({ label, subLabel, deepLink })}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-slate-50 transition-colors flex items-center gap-3",
                      isSelected ? "bg-emerald-50 border-l-4 border-l-emerald-600" : "hover:bg-slate-50"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-emerald-600" : "bg-slate-100")}>
                      <QrCode size={13} className={isSelected ? "text-white" : "text-slate-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{label}</p>
                      {subLabel && <p className="text-xs text-slate-400">{subLabel}</p>}
                    </div>
                    {isSelected && <QrCode size={14} className="text-emerald-600 ml-auto shrink-0" />}
                  </button>
                );
              })
            ) : activeTab === "routes" ? (
              paginatedItems.map((item: any, index) => {
                const route = item as RouteRow;
                const routeId = route.id || route._id || `route-${index}`;
                const deepLink = `${siteUrl}/?routeId=${routeId}`;
                const label = `Route ${route.routeNumber || routeId}`;
                const subLabel = route.startStop?.name && route.endStop?.name
                  ? `${route.startStop.name} → ${route.endStop.name}`
                  : undefined;
                const isSelected = selected?.deepLink === deepLink;

                return (
                  <button
                    key={routeId}
                    onClick={() => setSelected({ label, subLabel, deepLink })}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-slate-50 transition-colors flex items-center gap-3",
                      isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-slate-50"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-primary" : "bg-slate-100")}>
                      <RouteIcon size={13} className={isSelected ? "text-white" : "text-slate-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{label}</p>
                      {subLabel && <p className="text-xs text-slate-400 truncate">{subLabel}</p>}
                    </div>
                    {isSelected && <QrCode size={14} className="text-primary ml-auto shrink-0" />}
                  </button>
                );
              })
            ) : (
              paginatedItems.map((item: any) => {
                const bus = item as BusRow;
                const deepLink = `${siteUrl}/?busId=${bus.id}`;
                const label = bus.busNumber || `Bus ${bus.id}`;
                const subLabel = bus.routeNumber ? `Route ${bus.routeNumber}` : undefined;
                const isSelected = selected?.deepLink === deepLink;

                return (
                  <button
                    key={bus.id}
                    onClick={() => setSelected({ label, subLabel, deepLink })}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-slate-50 transition-colors flex items-center gap-3",
                      isSelected ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-slate-50"
                    )}
                  >
                    <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", isSelected ? "bg-primary" : "bg-slate-100")}>
                      <Bus size={13} className={isSelected ? "text-white" : "text-slate-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{label}</p>
                      {subLabel && <p className="text-xs text-slate-400">{subLabel}</p>}
                    </div>
                    {isSelected && <QrCode size={14} className="text-primary ml-auto shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination controls */}
          {!isLoading && totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button 
                  variant="outline" size="icon" className="h-7 w-7 rounded-lg" 
                  disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft size={12} />
                </Button>
                <Button 
                  variant="outline" size="icon" className="h-7 w-7 rounded-lg" 
                  disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight size={12} />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-8" style={{ minHeight: 400 }}>
          {selected ? (
            <QRDisplay item={selected} />
          ) : (
            <div className="text-center text-slate-300">
              <QrCode size={56} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-bold text-slate-400">
                Select a {activeTab === "routes" ? "route" : activeTab === "journey" ? "device" : "bus"} to generate its QR code
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
