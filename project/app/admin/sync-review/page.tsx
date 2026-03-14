"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  GitMerge,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  CheckCheck,
  XCircle,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { auth } from "@/lib/firebase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const existing = await auth.currentUser?.getIdToken();
  if (existing) return existing;

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(""), 2000);
    const unsub = auth.onAuthStateChanged(async (u) => {
      clearTimeout(timeout);
      unsub();
      resolve((await u?.getIdToken()) || "");
    });
  });
}

async function api(path: string, method = "GET", body?: object) {
  const token = await getToken();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const payload = body ? JSON.stringify(body) : undefined;

  const primary = await fetch(`${BASE}/admin/sync-review${path}`, { method, headers, body: payload });
  if (primary.status !== 404) return primary.json();

  const fallback = await fetch(`${BASE}/admin/fleet/sync-review${path}`, { method, headers, body: payload });
  return fallback.json();
}

interface ReviewItem {
  _id: string;
  entityType: string;
  entityId: string;
  routeId: string;
  field: string;
  label: string;
  currentValue: unknown;
  incomingValue: unknown;
  status: "pending" | "approved" | "ignored";
  createdAt: string;
}

interface Stats {
  pendingTotal: number;
  byType: Record<string, number>;
}

const ENTITY_COLORS: Record<string, string> = {
  Route: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  BusStop: "bg-blue-100 text-blue-700 border-blue-200",
  RouteStop: "bg-violet-100 text-violet-700 border-violet-200",
  RunningNumber: "bg-amber-100 text-amber-700 border-amber-200",
  RunningSlot: "bg-orange-100 text-orange-700 border-orange-200",
  RunningSlotStop: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function ValueDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-300 italic text-xs">null</span>;
  const str = String(value);
  return (
    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700 break-all">
      {str || <span className="italic text-slate-300">empty</span>}
    </span>
  );
}

function ReviewRow({
  item,
  onApprove,
  onIgnore,
  busy,
}: {
  item: ReviewItem;
  onApprove: (id: string) => void;
  onIgnore: (id: string) => void;
  busy: string | null;
}) {
  const isBusy = busy === item._id;
  const colorClass = ENTITY_COLORS[item.entityType] || "bg-slate-100 text-slate-600 border-slate-200";

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`text-[10px] font-bold border ${colorClass} px-2 py-0.5 rounded-full`}>
            {item.entityType}
          </Badge>
          <span className="text-sm text-slate-700 font-medium truncate">{item.label}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-slate-400">Current:</span>
          <ValueDisplay value={item.currentValue} />
          <ChevronRight size={12} className="text-slate-300" />
          <span className="text-slate-400">Incoming:</span>
          <ValueDisplay value={item.incomingValue} />
        </div>
        {item.routeId && (
          <p className="text-[10px] text-slate-300 font-mono">route: {item.routeId}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <Button
          size="sm"
          className="h-7 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold gap-1"
          onClick={() => onApprove(item._id)}
          disabled={isBusy}
          title="Apply incoming value to database"
        >
          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2.5 rounded-lg text-slate-400 hover:text-red-500 text-xs font-bold gap-1 border border-slate-200 hover:border-red-200"
          onClick={() => onIgnore(item._id)}
          disabled={isBusy}
          title="Ignore - keep current value"
        >
          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
          Ignore
        </Button>
      </div>
    </div>
  );
}

export default function SyncReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterEntityType, setFilterEntityType] = useState("all");
  const [filterRouteId, setFilterRouteId] = useState("");

  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = items.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  useEffect(() => { setPage(1); }, [filterStatus, filterEntityType, filterRouteId]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: filterStatus, perPage: "100" });
      if (filterEntityType && filterEntityType !== "all") params.set("entityType", filterEntityType);
      if (filterRouteId.trim()) params.set("routeId", filterRouteId.trim());
      const data = await api(`?${params}`);
      if (!data?.success) {
        notify.error(data?.error || "Failed to load review items.");
        return;
      }
      setItems(data.data || []);
      setTotal(data.total || 0);
    } catch {
      notify.error("Failed to load review items.");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterEntityType, filterRouteId]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api("/stats");
      if (data?.success) setStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  async function handleApprove(id: string) {
    setBusyItem(id);
    try {
      const res = await api(`/${id}/approve`, "PATCH");
      if (!res?.success) { notify.error("Failed to apply change."); return; }
      notify.success("Change applied.");
      setItems((prev) => prev.filter((i) => i._id !== id));
      setTotal((t) => t - 1);
      await fetchStats();
    } catch {
      notify.error("Failed.");
    } finally {
      setBusyItem(null);
    }
  }

  async function handleIgnore(id: string) {
    setBusyItem(id);
    try {
      const res = await api(`/${id}/ignore`, "PATCH");
      if (!res?.success) { notify.error("Failed to ignore."); return; }
      notify.success("Change ignored.");
      setItems((prev) => prev.filter((i) => i._id !== id));
      setTotal((t) => t - 1);
      await fetchStats();
    } catch {
      notify.error("Failed.");
    } finally {
      setBusyItem(null);
    }
  }

  async function handleBatch(action: "approve" | "ignore") {
    const visibleIds = items.map((i) => i._id);
    if (visibleIds.length === 0) return;
    const label = action === "approve" ? "Apply" : "Ignore";
    if (!confirm(`${label} all ${visibleIds.length} visible items?`)) return;

    setBatchBusy(true);
    try {
      const res = await api("/batch", "PATCH", { action, ids: visibleIds });
      if (!res?.success) { notify.error(`Batch ${action} failed.`); return; }
      notify.success(`${label}d ${visibleIds.length} items.`);
      setItems([]);
      setTotal(0);
      await fetchStats();
    } catch {
      notify.error("Batch action failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  const pendingCount = stats?.pendingTotal ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <GitMerge className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Sync Review</h1>
            <p className="text-slate-500 text-sm">
              Review external API changes before they overwrite manually-edited data
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => { fetchItems(); fetchStats(); }}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Pending</p>
            <p className={`text-3xl font-black mt-1 ${pendingCount > 0 ? "text-amber-500" : "text-slate-300"}`}>
              {pendingCount}
            </p>
          </div>
          {Object.entries(stats.byType).map(([type, count]) => (
            <div key={type} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{type}</p>
              <p className="text-2xl font-black text-slate-700 mt-1">{count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters + content */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-50 flex items-center gap-3 flex-wrap">
          <Filter size={14} className="text-slate-400 shrink-0" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="rounded-xl h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterEntityType} onValueChange={setFilterEntityType}>
            <SelectTrigger className="rounded-xl h-9 w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="Route">Route</SelectItem>
              <SelectItem value="BusStop">BusStop</SelectItem>
              <SelectItem value="RouteStop">RouteStop</SelectItem>
              <SelectItem value="RunningNumber">RunningNumber</SelectItem>
              <SelectItem value="RunningSlot">RunningSlot</SelectItem>
              <SelectItem value="RunningSlotStop">RunningSlotStop</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Filter by Route ID..."
            value={filterRouteId}
            onChange={(e) => setFilterRouteId(e.target.value)}
            className="rounded-xl h-9 w-48"
          />

          <span className="text-xs text-slate-400 ml-auto">{total} items</span>

          {filterStatus === "pending" && items.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="rounded-xl h-8 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => handleBatch("approve")}
                disabled={batchBusy}
              >
                {batchBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                Apply All
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl h-8 gap-1.5 text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => handleBatch("ignore")}
                disabled={batchBusy}
              >
                {batchBusy ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Ignore All
              </Button>
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check size={20} className="text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-400">
              {filterStatus === "pending" ? "No pending changes to review." : "No items found."}
            </p>
            <p className="text-xs text-slate-300 mt-1">
              {filterStatus === "pending" && "Everything is in sync or already reviewed."}
            </p>
          </div>
        ) : (
          <div>
            <div>
              {paginatedItems.map((item) => (
                <ReviewRow
                  key={item._id}
                  item={item}
                  onApprove={handleApprove}
                  onIgnore={handleIgnore}
                  busy={busyItem}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Page {safePage} of {totalPages} · {items.length} total
                </span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" size="sm" className="h-8 rounded-xl px-3" 
                    disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" size="sm" className="h-8 rounded-xl px-3" 
                    disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-700">
        <p className="font-bold mb-1">How this works</p>
        <ul className="space-y-1 text-xs text-amber-600 list-disc list-inside">
          <li>Static data syncs every <strong>1 hour</strong> from the external API.</li>
          <li>If incoming data <strong>differs</strong> from a manually-edited value, it is held here for review instead of being applied automatically.</li>
          <li><strong>Apply</strong> — overwrites the current DB value with the incoming API value.</li>
          <li><strong>Ignore</strong> — keeps the current DB value unchanged.</li>
          <li>On the <strong>next sync cycle</strong>, unreviewed pending items are replaced by the latest diff data.</li>
        </ul>
      </div>
    </div>
  );
}
