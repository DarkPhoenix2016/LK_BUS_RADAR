"use client";

import { BusDetailsPanel } from "@/components/panels/BusDetailsPanel";
import { RouteDetailsPanel } from "@/components/panels/RouteDetailsPanel";
import { BusCard } from "@/components/ui/BusCard";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/SearchBar";
import { useTransportData } from "@/hooks/useTransportData";
import { cn } from "@/lib/utils";
import { AlertCircle, Bus as BusIcon, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

type StatusFilter = "all" | "online" | "offline";
const PER_PAGE = 12;

export default function BusesPage() {
  const { devices, loading, error } = useTransportData();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedBus, setSelectedBus] = useState<any>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filteredBuses = devices.filter((bus) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "online" && bus.isOnline) ||
      (statusFilter === "offline" && !bus.isOnline);

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      bus.busNumber?.toLowerCase().includes(q) ||
      bus.routeNumber?.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredBuses.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredBuses.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleFilterChange = (f: StatusFilter) => { setStatusFilter(f); setPage(1); };
  const handleSearch = (q: string) => { setSearchQuery(q); setPage(1); };

  const handleViewRoute = (routeId: string) => {
    setSelectedBus(null);
    setSelectedRouteId(routeId);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto w-full">
      <header className="mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
              <BusIcon className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Fleet Overview</h1>
              <p className="text-slate-500 font-medium">Manage and track all registered bus devices</p>
            </div>
          </div>
          <SearchBar onSearch={handleSearch} placeholder="Search by bus plate or route..." />
        </div>

        {/* Status filter toggle */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            {(["all", "online", "offline"] as StatusFilter[]).map((opt) => (
              <button
                key={opt}
                onClick={() => handleFilterChange(opt)}
                className={cn(
                  "px-5 py-2 text-xs font-bold rounded-xl transition-all capitalize",
                  statusFilter === opt
                    ? "bg-white text-primary shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {opt === "all" ? "All Buses" : opt === "online" ? "Online" : "Offline"}
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-400">
            {filteredBuses.length} bus{filteredBuses.length !== 1 ? "es" : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Registered" value={devices.length} sub="Active Fleet Size" />
          <StatCard label="Online Now" value={devices.filter((d) => d.isOnline).length} sub="Real-time Tracking" color="emerald" />
          <StatCard label="Offline" value={devices.filter((d) => !d.isOnline).length} sub="Not transmitting" color="slate" />
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary opacity-20" size={48} />
          <p className="text-sm font-bold text-slate-300 uppercase tracking-widest italic">Synchronizing Fleet Data...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-10 rounded-[2rem] border border-red-100 flex flex-col items-center text-center gap-4">
          <AlertCircle size={32} className="text-red-500" />
          <p className="text-slate-500 text-sm max-w-xs mx-auto">We couldn&apos;t reach the transport server.</p>
        </div>
      ) : filteredBuses.length === 0 ? (
        <div className="bg-slate-50 p-20 rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center text-center gap-4">
          <BusIcon size={32} className="text-slate-300" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm italic">No buses match your criteria</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {pageItems.map((bus) => (
              <BusCard key={bus.id} device={bus} onClick={() => setSelectedBus(bus)} />
            ))}
          </div>
          <Pagination page={safePage} total={totalPages} onChange={setPage} />
        </>
      )}

      <BusDetailsPanel
        device={selectedBus}
        onClose={() => setSelectedBus(null)}
        onViewRoute={handleViewRoute}
      />

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

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 border-emerald-100 shadow-emerald-500/10",
    slate: "text-slate-500 border-slate-200 shadow-slate-900/5",
    default: "text-slate-900 border-slate-200 shadow-slate-900/5",
  };
  return (
    <div className={`bg-white border p-6 rounded-3xl shadow-xl ${colorMap[color || "default"]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{label}</p>
      <p className="text-3xl font-black mb-1 leading-none">{value}</p>
      <p className="text-xs font-semibold text-slate-400/80">{sub}</p>
    </div>
  );
}
