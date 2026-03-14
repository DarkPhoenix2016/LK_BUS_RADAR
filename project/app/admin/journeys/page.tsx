"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, ChevronLeft, ChevronRight,
  Navigation, TrendingUp, Users, DollarSign, Route,
  Plus, Pencil, Trash2, Check, X, Search, XCircle, CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken() {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

/* ─── Types ─── */
interface Journey {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  busNumber: string | null;
  routeNumber: string | null;
  routeId: string;
  direction: "UP" | "DOWN";
  boardingStopName: string;
  boardingStopIndex: number;
  alightingStopName: string | null;
  stopsTravelled: number | null;
  fareCharged: number | null;
  fareSectionName: string | null;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  endedAt: string | null;
}

interface Stats {
  totalToday: number;
  activeJourneys: number;
  revenueToday: number;
  avgStopsPerJourney: number;
  topRoutes: { routeId: string; routeNumber: string; count: number }[];
}

interface FareSection {
  _id: string;
  section: number;
  stops: number;
  price: number;
}

interface RouteStop {
  stopId: string;
  name: string;
  latitude: string;
  longitude: string;
  displayOrder: number;
}

/* ─── Status colors ─── */
const STATUS_COLORS: Record<string, string> = {
  active:    "bg-emerald-50 border-emerald-200 text-emerald-700",
  completed: "bg-blue-50 border-blue-200 text-blue-700",
  cancelled: "bg-red-50 border-red-100 text-red-500",
};

/* ─── Stat card ─── */
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ══════════════════════════ Main Page ══════════════════════════ */
export default function AdminJourneysPage() {
  const [tab, setTab] = useState<"journeys" | "fares">("journeys");

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Journeys</h1>
          <p className="text-slate-500 text-sm mt-1">Live journey tracking, history, and fare management</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white w-fit mb-6">
        {([["journeys", "Journey Management"], ["fares", "Fare Sections"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-5 py-2.5 text-sm font-bold border-r border-slate-200 last:border-0 transition-colors",
              tab === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "journeys" ? <JourneysTab /> : <FareSectionsTab />}
    </div>
  );
}

/* ══════════════════════════ Journeys Tab ══════════════════════════ */
function JourneysTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, lastPage: 1 });
  const perPage = 25;

  // Cancel modal
  const [cancelJourney, setCancelJourney] = useState<Journey | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Complete modal
  const [completeJourney, setCompleteJourney] = useState<Journey | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [completing, setCompleting] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadStats = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/journeys/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setStats(json.stats);
    } catch { /* silent */ }
  }, []);

  const loadJourneys = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`${BASE}/admin/fleet/journeys?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setJourneys(json.data || []);
        setMeta({ total: json.meta?.total || 0, lastPage: json.meta?.lastPage || 1 });
      } else {
        notify.error(json.error || "Failed to load journeys.");
      }
    } catch {
      notify.error("Failed to load journeys.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => { loadStats(); loadJourneys(); }, [loadStats, loadJourneys]);

  const refresh = () => { loadStats(); loadJourneys(); };

  /* Cancel */
  const openCancel = (j: Journey) => setCancelJourney(j);

  const handleCancel = async () => {
    if (!cancelJourney) return;
    setCancelling(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/journeys/${cancelJourney.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        notify.success("Journey cancelled.");
        setCancelJourney(null);
        refresh();
      } else {
        notify.error(json.error || "Failed to cancel.");
      }
    } catch {
      notify.error("Failed to cancel.");
    } finally {
      setCancelling(false);
    }
  };

  /* Complete */
  const openComplete = async (j: Journey) => {
    setCompleteJourney(j);
    setSelectedStop(null);
    setStopsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/journeys/${j.id}/stops`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        // Filter out boarding stop and stops before it
        const stops: RouteStop[] = json.stops || [];
        const afterBoarding = stops.filter((_s, idx) => idx > j.boardingStopIndex);
        setRouteStops(afterBoarding.length > 0 ? afterBoarding : stops);
      } else {
        notify.error(json.error || "Failed to load stops.");
        setCompleteJourney(null);
      }
    } catch {
      notify.error("Failed to load stops.");
      setCompleteJourney(null);
    } finally {
      setStopsLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!completeJourney || !selectedStop) return;
    setCompleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/journeys/${completeJourney.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ alightingStopId: selectedStop.stopId }),
      });
      const json = await res.json();
      if (json.success) {
        notify.success(`Journey completed. Fare: ${json.fareCharged} pts (${json.stopsTravelled} stop${json.stopsTravelled !== 1 ? "s" : ""})`);
        setCompleteJourney(null);
        setSelectedStop(null);
        refresh();
      } else {
        notify.error(json.error || "Failed to complete.");
      }
    } catch {
      notify.error("Failed to complete.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Navigation}  label="Journeys Today"   value={stats.totalToday}          color="bg-primary" />
          <StatCard icon={Users}        label="Active Now"        value={stats.activeJourneys}       color="bg-emerald-500" />
          <StatCard icon={DollarSign}   label="Revenue Today"    value={`${stats.revenueToday} pts`} color="bg-violet-500" />
          <StatCard icon={TrendingUp}   label="Avg Stops"         value={stats.avgStopsPerJourney}   color="bg-amber-500" />
        </div>
      )}

      {/* Top routes */}
      {stats?.topRoutes && stats.topRoutes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Route size={12} /> Top Routes (All Time)
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.topRoutes.map(r => (
              <div key={r.routeId} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                <span className="text-sm font-black text-slate-800">{r.routeNumber}</span>
                <Badge variant="outline" className="text-[10px] font-bold text-slate-500">{r.count} trips</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-3 flex-wrap flex-1">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            {(["all", "active", "completed", "cancelled"] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  "px-4 py-2 text-xs font-bold capitalize border-r border-slate-200 last:border-0 transition-colors",
                  statusFilter === s ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <div className="relative min-w-[220px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user, route, bus, stop…"
              className="pl-9 h-10 rounded-xl text-sm"
            />
          </div>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={refresh}>
          <RefreshCw size={14} className="mr-2" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary opacity-30" size={32} />
          </div>
        ) : journeys.length === 0 ? (
          <div className="py-14 text-center">
            <Navigation size={32} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">No journeys found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["User", "Bus / Route", "Boarding → Alighting", "Stops", "Fare", "Status", "Started", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {journeys.map((j) => (
                  <tr key={j.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-xs text-slate-800 truncate max-w-[140px]">{j.userName || j.userEmail}</p>
                      {j.userName && <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{j.userEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-xs text-slate-800">{j.busNumber || "—"}</p>
                      <p className="text-[10px] text-slate-400">{j.routeNumber ? `Route ${j.routeNumber}` : "—"} · {j.direction}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[160px]">{j.boardingStopName}</p>
                      {j.alightingStopName ? (
                        <p className="text-[10px] text-slate-400 truncate max-w-[160px]">→ {j.alightingStopName}</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">On board…</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-black text-sm text-slate-700">
                        {j.stopsTravelled != null ? j.stopsTravelled : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <p className="font-black text-sm text-primary">
                        {j.fareCharged != null ? `${j.fareCharged} pts` : "—"}
                      </p>
                      {j.fareSectionName && (
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter leading-none mt-0.5">
                          {j.fareSectionName}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("text-[10px] font-black", STATUS_COLORS[j.status] || "")}>
                        {j.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {j.startedAt ? format(new Date(j.startedAt), "MMM d, HH:mm") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {j.status === "active" && (
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 rounded-lg text-[10px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => openComplete(j)}
                          >
                            <CheckCircle2 size={11} className="mr-1" /> Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 rounded-lg text-[10px] border-red-100 text-red-500 hover:bg-red-50"
                            onClick={() => openCancel(j)}
                          >
                            <XCircle size={11} className="mr-1" /> Cancel
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta.lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Page {page} of {meta.lastPage} · {meta.total} total</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={14} />
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPage(p => Math.min(meta.lastPage, p + 1))} disabled={page >= meta.lastPage}>
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      <Dialog open={!!cancelJourney} onOpenChange={o => !o && setCancelJourney(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Cancel Journey</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Cancel the active journey for <span className="font-bold text-slate-900">{cancelJourney?.userName || cancelJourney?.userEmail}</span>?
            No fare will be charged.
          </p>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCancelJourney(null)}>Keep</Button>
            <Button className="rounded-xl font-bold bg-red-500 hover:bg-red-600" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 size={14} className="animate-spin mr-2" /> : <XCircle size={14} className="mr-2" />}
              Cancel Journey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Journey Dialog */}
      <Dialog open={!!completeJourney} onOpenChange={o => { if (!o) { setCompleteJourney(null); setSelectedStop(null); } }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Complete Journey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-xs">
              <p className="font-bold text-slate-700">Passenger: <span className="text-slate-900">{completeJourney?.userName || completeJourney?.userEmail}</span></p>
              <p className="font-bold text-slate-700 mt-1">Boarded at: <span className="text-slate-900">{completeJourney?.boardingStopName}</span></p>
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Select Alighting Stop</p>
              {stopsLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary opacity-40" /></div>
              ) : routeStops.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No stops available</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {routeStops.map((stop, idx) => (
                    <button
                      key={stop.stopId}
                      onClick={() => setSelectedStop(stop)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors",
                        selectedStop?.stopId === stop.stopId
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <span className="text-[10px] text-slate-400 font-bold mr-2">#{idx + 1}</span>
                      {stop.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedStop && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-bold text-emerald-700">
                Alighting at: {selectedStop.name}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => { setCompleteJourney(null); setSelectedStop(null); }}>Cancel</Button>
            <Button
              className="rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700"
              onClick={handleComplete}
              disabled={completing || !selectedStop}
            >
              {completing ? <Loader2 size={14} className="animate-spin mr-2" /> : <CheckCircle2 size={14} className="mr-2" />}
              Complete Journey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════ Fare Sections Tab ══════════════════════════ */
const FS_PER_PAGE = 10;

function FareSectionsTab() {
  const [sections, setSections] = useState<FareSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ section: "", stops: "", price: "" });
  const [newForm, setNewForm] = useState({ section: "", stops: "", price: "" });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search & filter
  const [search, setSearch] = useState("");
  const [maxStopsFilter, setMaxStopsFilter] = useState<"" | "lte5" | "lte10" | "gt10">("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/fare-sections`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setSections(json.data || []);
      else notify.error(json.error || "Failed to load fare sections.");
    } catch {
      notify.error("Failed to load fare sections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (s: FareSection) => {
    setEditId(s._id);
    setEditForm({ section: String(s.section), stops: String(s.stops), price: String(s.price) });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/fare-sections/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          section: Number(editForm.section),
          stops:   Number(editForm.stops),
          price:   Number(editForm.price),
        }),
      });
      const json = await res.json();
      if (json.success) { notify.success("Fare section updated."); setEditId(null); load(); }
      else notify.error(json.error || "Failed to update.");
    } catch {
      notify.error("Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Delete this fare section?")) return;
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/fare-sections/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) { notify.success("Deleted."); load(); }
      else notify.error(json.error || "Failed to delete.");
    } catch {
      notify.error("Failed to delete.");
    }
  };

  const addSection = async () => {
    if (!newForm.section || !newForm.stops || !newForm.price) {
      notify.error("All fields are required.");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/admin/fleet/fare-sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          section: Number(newForm.section),
          stops:   Number(newForm.stops),
          price:   Number(newForm.price),
        }),
      });
      const json = await res.json();
      if (json.success) {
        notify.success("Fare section created.");
        setNewForm({ section: "", stops: "", price: "" });
        setAdding(false);
        load();
      } else {
        notify.error(json.error || "Failed to create.");
      }
    } catch {
      notify.error("Failed to create.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = sections.filter(s => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!String(s.section).includes(q) && !String(s.stops).includes(q) && !String(s.price).includes(q)) return false;
    }
    if (maxStopsFilter === "lte5" && s.stops > 5) return false;
    if (maxStopsFilter === "lte10" && s.stops > 10) return false;
    if (maxStopsFilter === "gt10" && s.stops <= 10) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / FS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * FS_PER_PAGE, safePage * FS_PER_PAGE);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Fare Sections</h2>
          <p className="text-xs text-slate-400 mt-0.5">Define stop count → fare price mapping used for all journeys</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={load}>
            <RefreshCw size={14} className="mr-2" /> Refresh
          </Button>
          <Button className="rounded-xl" onClick={() => setAdding(v => !v)}>
            <Plus size={14} className="mr-2" /> Add Rule
          </Button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search section, stops, price…"
            className="pl-9 h-9 rounded-xl text-sm"
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white h-9">
          {([["", "All Stops"], ["lte5", "≤ 5 stops"], ["lte10", "≤ 10 stops"], ["gt10", "> 10 stops"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setMaxStopsFilter(val as any); setPage(1); }}
              className={cn(
                "px-3 text-xs font-bold border-r border-slate-200 last:border-0 transition-colors whitespace-nowrap",
                maxStopsFilter === val ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
          <p className="text-sm font-black text-primary mb-4">New Fare Rule</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block mb-1">Section #</label>
              <Input type="number" value={newForm.section} onChange={e => setNewForm(f => ({ ...f, section: e.target.value }))} placeholder="1" className="rounded-xl h-10" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block mb-1">Max Stops</label>
              <Input type="number" value={newForm.stops} onChange={e => setNewForm(f => ({ ...f, stops: e.target.value }))} placeholder="3" className="rounded-xl h-10" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block mb-1">Price (pts)</label>
              <Input type="number" value={newForm.price} onChange={e => setNewForm(f => ({ ...f, price: e.target.value }))} placeholder="27" className="rounded-xl h-10" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="rounded-xl" onClick={addSection} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : <Check size={14} className="mr-2" />}
              Save
            </Button>
            <Button variant="outline" className="rounded-xl" onClick={() => setAdding(false)}>
              <X size={14} className="mr-2" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary opacity-30" size={28} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <DollarSign size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-slate-400 text-sm">{sections.length === 0 ? "No fare sections configured yet" : "No sections match your filters"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {["Section", "Max Stops", "Price (pts)", "Actions"].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map(s => (
                <tr key={s._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  {editId === s._id ? (
                    <>
                      <td className="px-5 py-2"><Input type="number" value={editForm.section} onChange={e => setEditForm(f => ({ ...f, section: e.target.value }))} className="h-8 w-20 rounded-lg text-xs" /></td>
                      <td className="px-5 py-2"><Input type="number" value={editForm.stops} onChange={e => setEditForm(f => ({ ...f, stops: e.target.value }))} className="h-8 w-20 rounded-lg text-xs" /></td>
                      <td className="px-5 py-2"><Input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="h-8 w-24 rounded-lg text-xs" /></td>
                      <td className="px-5 py-2">
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 px-3 rounded-lg text-xs" onClick={saveEdit} disabled={saving}>
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-3 rounded-lg text-xs" onClick={() => setEditId(null)}>
                            <X size={12} />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3 font-mono text-sm font-black text-slate-700">{s.section}</td>
                      <td className="px-5 py-3"><span className="font-bold text-slate-800">{s.stops}</span><span className="text-xs text-slate-400 ml-1">stop{s.stops !== 1 ? "s" : ""}</span></td>
                      <td className="px-5 py-3"><span className="font-black text-primary text-base">{s.price}</span><span className="text-xs text-slate-400 ml-1">pts</span></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 px-3 rounded-lg text-xs border-slate-200 text-slate-600" onClick={() => startEdit(s)}><Pencil size={12} /></Button>
                          <Button size="sm" variant="outline" className="h-7 px-3 rounded-lg text-xs border-red-100 text-red-500 hover:bg-red-50" onClick={() => deleteSection(s._id)}><Trash2 size={12} /></Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {safePage} of {totalPages} · {filtered.length} section{filtered.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-xl" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs font-bold text-amber-700">
          How fare lookup works: when a journey ends, the system finds the first fare section where
          <code className="mx-1 px-1 bg-amber-100 rounded font-mono">stops &ge; stopsTravelled</code>
          and charges that section&apos;s price. Sections are evaluated in ascending stop order.
        </p>
      </div>
    </div>
  );
}
