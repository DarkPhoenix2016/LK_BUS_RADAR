"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useTransportData } from "@/hooks/useTransportData";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterOption } from "@/components/ui/Filters";
import { BusDetailsPanel } from "@/components/panels/BusDetailsPanel";
import { RouteDetailsPanel } from "@/components/panels/RouteDetailsPanel";
import { EnrichedDevice } from "@/data/transportBuilder";
import { API_ENDPOINTS, fetcher, RouteWithMeta, Route } from "@/services/transportApi";
import { Loader2, RefreshCw, MapPin, X, ListFilter, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useSWR from "swr";

const BusMap = dynamic(() => import("@/components/map/BusMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary opacity-20" />
    </div>
  ),
});

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { routes, devices, routeMap, loading, error, refreshDevices } = useTransportData();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterOption>("online");
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBus, setSelectedBus] = useState<EnrichedDevice | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [mapDirection, setMapDirection] = useState<"up" | "down">("up");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapFocusPoint, setMapFocusPoint] = useState<[number, number] | null>(null);
  const [pendingBusId, setPendingBusId] = useState<string | null>(null);
  const [stopRoutesLabel, setStopRoutesLabel] = useState<string | null>(null);
  const [stopRoutes, setStopRoutes] = useState<Route[]>([]);
  const [stopRoutesLoading, setStopRoutesLoading] = useState(false);

  // Read deep-link params once on mount
  useEffect(() => {
    const rid = searchParams.get("routeId");
    const bid = searchParams.get("busId");
    router.replace("/", { scroll: false });
    if (rid) {
      setSelectedRouteId(rid);
    } else if (bid) {
      setPendingBusId(bid);
    }
  }, []);

  // Once data loads, resolve the pending busId deep-link
  useEffect(() => {
    if (!pendingBusId || loading) return;

    const resolveBus = async () => {
      // 1. Check if it's already in our live devices list
      const found = devices.find((d) => d.id === pendingBusId || d.routePermitBusId === pendingBusId);
      if (found) {
        setSelectedBus(found);
        if (found.lat && found.lon) setMapFocusPoint([found.lat, found.lon]);
        setPendingBusId(null);
        return;
      }

      // 2. If not found in live set, focus once devices load later — just wait
      try {
        const res = await fetch(API_ENDPOINTS.BUS_GET(pendingBusId));
        const data = await res.json();
        if (data && data.busNumber) {
          const enrichedOfflineBus = {
            ...data,
            route: data.routeId ? routeMap.get(data.routeId) : undefined,
          } as EnrichedDevice;
          setSelectedBus(enrichedOfflineBus);
          if (data.lat && data.lon) setMapFocusPoint([data.lat, data.lon]);
        }
      } catch (err) {
        console.error("Failed to resolve offline bus deep-link", err);
      } finally {
        setPendingBusId(null);
      }
    };

    resolveBus();
  }, [pendingBusId, devices, loading]);

  // Request GPS on load — explicit function also called from the map locate button
  function requestGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  useEffect(() => { requestGPS(); }, []);

  // Fetch route meta for map overlay when a route is selected
  const { data: selectedRouteMeta } = useSWR<RouteWithMeta>(
    selectedRouteId ? API_ENDPOINTS.ROUTE_META(selectedRouteId) : null,
    fetcher
  );

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "online" && d.isOnline) ||
        (filter === "offline" && !d.isOnline);
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        d.busNumber?.toLowerCase().startsWith(q) ||
        d.routeNumber?.toLowerCase().startsWith(q);
      return matchesFilter && matchesSearch;
    });
  }, [devices, filter, searchQuery]);

  const handleViewRoute = (routeId: string) => {
    setSelectedBus(null);
    setMapFocusPoint(null);
    setSelectedRouteId(routeId);
  };

  const handleStopSelect = async (stopId: string, stopName: string) => {
    setStopRoutesLabel(stopName);
    setStopRoutes([]);
    setStopRoutesLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.ROUTES_BY_STOPS(`fromStopId=${encodeURIComponent(stopId)}`));
      const data = await res.json();
      if (data.success) setStopRoutes(data.data || []);
    } catch {
      setStopRoutes([]);
    } finally {
      setStopRoutesLoading(false);
    }
  };

  const handleBusSelectFromPanel = (device: EnrichedDevice) => {
    setSelectedRouteId(null);
    setSelectedBus(device);
    if (device.lat && device.lon) {
      setMapFocusPoint([device.lat, device.lon]);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative h-screen overflow-hidden">
      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <BusMap
          devices={filteredDevices}
          onBusClick={(d) => { setSelectedBus(d); setMapFocusPoint(null); }}
          selectedDevice={selectedBus || undefined}
          userCenter={userLocation ?? undefined}
          routeOverlay={selectedRouteMeta ?? null}
          routeDirection={mapDirection}
          focusPoint={mapFocusPoint}
        />
      </div>

      {/* Floating UI Overlays */}
      <div className="relative z-10 pointer-events-none p-4 md:p-8 flex flex-col h-full">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start pointer-events-auto">
          <div className="relative w-full max-w-md">
            <SearchBar
              onSearch={setSearchQuery}
              routes={routes}
              onRouteSelect={(id) => { setSelectedBus(null); setSelectedRouteId(id); setMapFocusPoint(null); setStopRoutesLabel(null); }}
              onStopSelect={handleStopSelect}
              showDropdown
              placeholder="Search routes or bus stops..."
            />
            {/* Stop routes floating panel */}
            {stopRoutesLabel && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-40 overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-50">
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-emerald-600" />
                    <span className="text-xs font-black text-slate-700">Routes via <span className="text-emerald-700">{stopRoutesLabel}</span></span>
                  </div>
                  <button onClick={() => { setStopRoutesLabel(null); setStopRoutes([]); }} className="text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
                {stopRoutesLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={20} className="animate-spin text-primary opacity-30" />
                  </div>
                ) : stopRoutes.length === 0 ? (
                  <div className="px-5 py-6 text-center text-sm font-bold text-slate-400">No routes found for this stop</div>
                ) : (
                  <ul>
                    {stopRoutes.map((route) => (
                      <li key={route.id}>
                        <button
                          className="w-full px-5 py-3 flex items-center gap-4 text-left hover:bg-slate-50 transition-colors"
                          onMouseDown={(e) => { e.preventDefault(); setSelectedBus(null); setSelectedRouteId(route.id); setMapFocusPoint(null); setStopRoutesLabel(null); }}
                        >
                          <div className="bg-slate-100 rounded-xl px-2 py-1 shrink-0">
                            <span className="text-xs font-black text-slate-700 italic">{route.routeNumber}</span>
                          </div>
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {route.start?.name || "—"} → {route.end?.name || "—"}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refreshDevices()}
              className="bg-white/90 backdrop-blur-md border-white/20 shadow-xl rounded-2xl hover:bg-white"
            >
              <RefreshCw size={18} className={cn("text-slate-600", loading && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (userLocation) setMapFocusPoint([...userLocation]);
                else requestGPS();
              }}
              className={cn(
                "backdrop-blur-md border-white/20 shadow-xl rounded-full hover:bg-white",
                userLocation
                  ? "bg-white/90 text-primary"
                  : "bg-white/90 text-slate-400"
              )}
              title={userLocation ? "Focus my location" : "Enable GPS location"}
            >
              <LocateFixed size={18} />
            </Button>
            <div className="relative bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-white/20 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-sm font-bold text-slate-700">
                {devices.filter((d) => d.isOnline).length}{" "}
                <span className="text-slate-400 font-medium ml-1">Buses Live</span>
              </p>
              <div className="w-px h-4 bg-slate-200" />
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-bold rounded-xl px-2 py-1 transition-colors",
                  filter !== "online"
                    ? "text-primary bg-primary/10"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                )}
                title="Filter buses"
              >
                <ListFilter size={14} />
                {filter === "online" ? "Online" : filter === "offline" ? "Offline" : "All"}
              </button>

              {/* Dropdown */}
              {filterOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden min-w-[130px]">
                  {(["online", "all", "offline"] as FilterOption[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setFilter(opt); setFilterOpen(false); }}
                      className={cn(
                        "w-full px-4 py-2.5 text-xs font-bold text-left capitalize transition-colors",
                        filter === opt
                          ? "bg-primary/10 text-primary"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {opt === "online" ? "Online Only" : opt === "offline" ? "Offline Only" : "Show All"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <BusDetailsPanel
        device={selectedBus}
        onClose={() => { setSelectedBus(null); setMapFocusPoint(null); }}
        onViewRoute={handleViewRoute}
      />

      <RouteDetailsPanel
        routeId={selectedRouteId}
        onClose={() => { setSelectedRouteId(null); setMapDirection("up"); }}
        devices={devices}
        onDirectionChange={setMapDirection}
        onBusSelect={handleBusSelectFromPanel}
      />

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-red-50 border border-red-100 px-6 py-3 rounded-2xl shadow-2xl text-red-600 text-sm font-bold z-50 animate-bounce">
          Connection lost. Retrying...
        </div>
      )}
    </div>
  );
}
