"use client";

import { useState, useEffect, useRef } from "react";
import { useTransportData } from "@/hooks/useTransportData";
import { RouteCard } from "@/components/ui/RouteCard";
import { RouteDetailsPanel } from "@/components/panels/RouteDetailsPanel";
import { Loader2, Route as RouteIcon, ArrowRightLeft, MapPin, Info, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { API_ENDPOINTS } from "@/services/transportApi";
import { cn } from "@/lib/utils";

const PER_PAGE = 12;

interface StopSuggestion {
  id: string;
  name: string;
}

export default function RoutesPage() {
  const { routes, devices, loading, error } = useTransportData();
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Stop mode state
  const [stopMode, setStopMode] = useState(false);
  const [fromStopQ, setFromStopQ] = useState("");
  const [toStopQ, setToStopQ] = useState("");
  const [fromStopSuggestions, setFromStopSuggestions] = useState<StopSuggestion[]>([]);
  const [toStopSuggestions, setToStopSuggestions] = useState<StopSuggestion[]>([]);
  const [fromStop, setFromStop] = useState<StopSuggestion | null>(null);
  const [toStop, setToStop] = useState<StopSuggestion | null>(null);
  const [stopRoutes, setStopRoutes] = useState<any[]>([]);
  const [stopRoutesLoading, setStopRoutesLoading] = useState(false);
  const [stopRoutesSearched, setStopRoutesSearched] = useState(false);

  const fromDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced bus stop search
  useEffect(() => {
    if (!stopMode) return;
    if (fromStop) return; // already selected
    if (fromStopQ.length < 2) { setFromStopSuggestions([]); return; }
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    fromDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(API_ENDPOINTS.BUS_STOPS_SEARCH(fromStopQ));
        const json = await res.json();
        if (json.success) setFromStopSuggestions(json.data || []);
      } catch { setFromStopSuggestions([]); }
    }, 300);
    return () => { if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current); };
  }, [fromStopQ, stopMode, fromStop]);

  useEffect(() => {
    if (!stopMode) return;
    if (toStop) return;
    if (toStopQ.length < 2) { setToStopSuggestions([]); return; }
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    toDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(API_ENDPOINTS.BUS_STOPS_SEARCH(toStopQ));
        const json = await res.json();
        if (json.success) setToStopSuggestions(json.data || []);
      } catch { setToStopSuggestions([]); }
    }, 300);
    return () => { if (toDebounceRef.current) clearTimeout(toDebounceRef.current); };
  }, [toStopQ, stopMode, toStop]);

  async function findRoutesByStops() {
    if (!fromStop && !toStop) return;
    setStopRoutesLoading(true);
    setStopRoutesSearched(true);
    try {
      const params = new URLSearchParams();
      if (fromStop) params.set("fromStopId", fromStop.id);
      if (toStop) params.set("toStopId", toStop.id);
      const res = await fetch(API_ENDPOINTS.ROUTES_BY_STOPS(params.toString()));
      const json = await res.json();
      if (json.success) setStopRoutes(json.data || []);
      else setStopRoutes([]);
    } catch {
      setStopRoutes([]);
    } finally {
      setStopRoutesLoading(false);
    }
  }

  // Name-mode filtering
  const filteredRoutes = routes.filter((route) => {
    const from = fromQuery.trim().toLowerCase();
    const to = toQuery.trim().toLowerCase();
    const startName = route.start?.name?.toLowerCase() || "";
    const endName = route.end?.name?.toLowerCase() || "";
    const routeNum = route.routeNumber?.toLowerCase() || "";

    const matchFrom = !from || startName.includes(from) || routeNum.includes(from);
    const matchTo = !to || endName.includes(to) || routeNum.includes(to);
    return matchFrom && matchTo;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredRoutes.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleFromChange = (v: string) => { setFromQuery(v); setPage(1); };
  const handleToChange = (v: string) => { setToQuery(v); setPage(1); };

  const getActiveBusesCount = (routeId: string) =>
    devices.filter((d) => d.routeId === routeId && d.isOnline).length;

  const swap = () => {
    setFromQuery(toQuery);
    setToQuery(fromQuery);
    setPage(1);
  };

  const swapStops = () => {
    const tmpStop = fromStop;
    const tmpQ = fromStopQ;
    setFromStop(toStop);
    setFromStopQ(toStopQ);
    setToStop(tmpStop);
    setToStopQ(tmpQ);
    setFromStopSuggestions([]);
    setToStopSuggestions([]);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto w-full">
      <header className="mb-10">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <RouteIcon className="text-white" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Active Routes</h1>
            <p className="text-slate-500 font-medium">Explore and track high-frequency transit routes</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-2xl border border-slate-200 overflow-hidden bg-white mb-4 w-fit">
          <button
            onClick={() => setStopMode(false)}
            className={cn(
              "px-4 py-2 text-sm font-bold transition-colors",
              !stopMode ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            By Name / Number
          </button>
          <button
            onClick={() => setStopMode(true)}
            className={cn(
              "px-4 py-2 text-sm font-bold transition-colors border-l border-slate-200",
              stopMode ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Search size={13} className="inline mr-1.5 -mt-0.5" />
            Search by Stop
          </button>
        </div>

        {!stopMode ? (
          /* Name/number search */
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
              <Input
                placeholder="From — departure stop or route no."
                value={fromQuery}
                onChange={(e) => handleFromChange(e.target.value)}
                className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
              />
            </div>
            <Button variant="outline" size="icon" onClick={swap} className="rounded-2xl h-12 w-12 shrink-0 border-slate-200">
              <ArrowRightLeft size={16} className="text-slate-500" />
            </Button>
            <div className="relative flex-1">
              <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" />
              <Input
                placeholder="To — destination stop"
                value={toQuery}
                onChange={(e) => handleToChange(e.target.value)}
                className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
              />
            </div>
          </div>
        ) : (
          /* Stop-based search */
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              {/* From stop */}
              <div className="relative flex-1">
                <MapPin size={16} className="absolute left-3 top-3.5 text-emerald-500" />
                <Input
                  placeholder="From stop — type to search…"
                  value={fromStop ? fromStop.name : fromStopQ}
                  onChange={(e) => {
                    setFromStop(null);
                    setFromStopQ(e.target.value);
                  }}
                  className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
                />
                {!fromStop && fromStopSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 max-h-48 overflow-y-auto">
                    {fromStopSuggestions.map((s) => (
                      <button
                        key={s.id}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl"
                        onClick={() => { setFromStop(s); setFromStopQ(s.name); setFromStopSuggestions([]); }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="outline" size="icon" onClick={swapStops} className="rounded-2xl h-12 w-12 shrink-0 border-slate-200 mt-0">
                <ArrowRightLeft size={16} className="text-slate-500" />
              </Button>

              {/* To stop */}
              <div className="relative flex-1">
                <MapPin size={16} className="absolute left-3 top-3.5 text-rose-500" />
                <Input
                  placeholder="To stop — type to search…"
                  value={toStop ? toStop.name : toStopQ}
                  onChange={(e) => {
                    setToStop(null);
                    setToStopQ(e.target.value);
                  }}
                  className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
                />
                {!toStop && toStopSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg z-50 max-h-48 overflow-y-auto">
                    {toStopSuggestions.map((s) => (
                      <button
                        key={s.id}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 first:rounded-t-2xl last:rounded-b-2xl"
                        onClick={() => { setToStop(s); setToStopQ(s.name); setToStopSuggestions([]); }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Button
              className="rounded-2xl h-11 px-6 font-bold"
              disabled={(!fromStop && !toStop) || stopRoutesLoading}
              onClick={findRoutesByStops}
            >
              {stopRoutesLoading ? <Loader2 size={15} className="animate-spin mr-2" /> : <Search size={15} className="mr-2" />}
              Find Routes
            </Button>
          </div>
        )}
      </header>

      {/* Stop-mode results */}
      {stopMode ? (
        stopRoutesLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-primary opacity-20" size={48} />
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest italic">Searching Routes...</p>
          </div>
        ) : stopRoutesSearched && stopRoutes.length === 0 ? (
          <div className="bg-slate-50 p-20 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center text-center gap-4">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm italic">No routes found for selected stops</p>
          </div>
        ) : stopRoutes.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {stopRoutes.map((route: any) => (
              <RouteCard
                key={route.id}
                route={route}
                activeBusesCount={getActiveBusesCount(route.id)}
                onClick={() => setSelectedRouteId(route.id)}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-50 p-16 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center text-center gap-3">
            <Search size={32} className="text-slate-300" />
            <p className="text-slate-400 font-medium text-sm">Select stops above and click "Find Routes"</p>
          </div>
        )
      ) : (
        /* Name-mode results */
        loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-primary opacity-20" size={48} />
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest italic">Fetching Routes...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 p-10 rounded-[2rem] border border-red-100 flex flex-col items-center text-center gap-4">
            <Info className="text-red-500" size={32} />
            <p className="font-bold text-slate-900 tracking-tight italic">Error loading routes.</p>
          </div>
        ) : filteredRoutes.length === 0 ? (
          <div className="bg-slate-50 p-20 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center text-center gap-4">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-sm italic">No routes match your search</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {pageItems.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  activeBusesCount={getActiveBusesCount(route.id)}
                  onClick={() => setSelectedRouteId(route.id)}
                />
              ))}
            </div>
            <Pagination page={safePage} total={totalPages} onChange={setPage} />
          </>
        )
      )}

      <RouteDetailsPanel
        routeId={selectedRouteId}
        onClose={() => setSelectedRouteId(null)}
      />
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-2">
      <Button variant="outline" size="icon" onClick={() => onChange(page - 1)} disabled={page === 1} className="rounded-xl h-9 w-9">
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-bold text-slate-600">
        Page <span className="text-primary">{page}</span> of {total}
      </span>
      <Button variant="outline" size="icon" onClick={() => onChange(page + 1)} disabled={page === total} className="rounded-xl h-9 w-9">
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
