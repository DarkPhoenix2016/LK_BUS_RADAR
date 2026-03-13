"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw, ReceiptText, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken() {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-50 border-amber-200 text-amber-700",
  confirmed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  cancelled: "bg-red-50 border-red-100 text-red-500",
  completed: "bg-blue-50 border-blue-200 text-blue-700",
};

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, lastPage: 1 });
  const perPage = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${BASE}/admin/fleet/bookings?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setBookings(json.data || []);
        setMeta({ total: json.meta?.total || 0, lastPage: json.meta?.lastPage || 1 });
      } else {
        notify.error(json.error || "Failed to load bookings.");
      }
    } catch {
      notify.error("Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    const token = await getToken();
    const res = await fetch(`${BASE}/admin/fleet/bookings/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (json.success) { notify.success("Status updated."); load(); }
    else notify.error(json.error || "Failed.");
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Bookings</h1>
          <p className="text-slate-500 text-sm mt-1">{meta.total} total bookings</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={load}>
          <RefreshCw size={14} className="mr-2" /> Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
          {["all", "draft", "confirmed", "cancelled", "completed"].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn("px-3 py-2 text-xs font-bold capitalize border-r border-slate-200 last:border-0 transition-colors",
                statusFilter === s ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50")}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search reference or passenger..." className="pl-9 h-10 rounded-xl text-sm" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary opacity-30" size={32} /></div>
        ) : bookings.length === 0 ? (
          <div className="py-14 text-center"><ReceiptText size={32} className="mx-auto text-slate-200 mb-3" /><p className="text-slate-400 text-sm">No bookings found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Reference", "Route", "Date", "Direction", "Passenger", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any) => (
                  <tr key={b.id || b._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{b.bookingReference}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800 text-xs">{b.route?.routeNumber || "—"}</p>
                      {b.route?.start?.name && <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{b.route.start.name} → {b.route.end?.name}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{b.travelDate ? format(new Date(b.travelDate), "MMM d, yyyy") : "—"}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-600 capitalize">{b.direction}ward</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{b.passengerName}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[120px]">{b.passengerEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("text-[10px] font-black", STATUS_COLORS[b.status] || "")}>{b.status?.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {b.status === "confirmed" && (
                        <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs px-2 border-blue-100 text-blue-600"
                          onClick={() => updateStatus(b.id || b._id, "completed")}>Complete</Button>
                      )}
                      {b.status === "draft" && (
                        <Button size="sm" variant="outline" className="rounded-lg h-7 text-xs px-2 border-red-100 text-red-500"
                          onClick={() => updateStatus(b.id || b._id, "cancelled")}>Cancel</Button>
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
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">Page {page} of {meta.lastPage}</p>
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
    </div>
  );
}
