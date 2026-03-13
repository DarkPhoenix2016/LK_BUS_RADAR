"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, Bus, Plus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  X, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}
async function apiFetch(path: string, method = "GET", body?: object) {
  const token = await getToken();
  const res = await fetch(`${BASE}/admin/fleet${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

interface Permit { id: string; permitNumber: string; routePermitType: string; }
interface BusRecord {
  id: string;
  busNumber: string;
  isOnline: boolean;
  routeNumber: string | null;
  routePermitId: string | null;
  seatingCapacity: number | null;
  driverContact: string;
  conductorContact: string;
  totalDistance: number | null;
  permit: Permit | null;
}
interface VacantPermit { id: string; permitNumber: string; routePermitType: string; routeNumber: string; }

type SortKey = "busNumber" | "routeNumber" | "seatingCapacity" | "totalDistance" | "permitNumber" | "routePermitType";
type SortDir = "asc" | "desc";

const EMPTY_FORM = { busNumber: "", routePermitId: "", seatingCapacity: "", driverContact: "", conductorContact: "" };

// Sortable header cell
function SortHead({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (col: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">
      <button
        onClick={() => onSort(col)}
        className="flex items-center gap-1 hover:text-primary transition-colors group"
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
        ) : (
          <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />
        )}
      </button>
    </TableHead>
  );
}

// Searchable permit dropdown
function PermitDropdown({ value, selectedLabel, includeId, onChange }: {
  value: string;
  selectedLabel: string;
  includeId?: string;
  onChange: (id: string, label: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<VacantPermit[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      search,
      ...(includeId ? { includeId } : {}),
    });
    apiFetch(`/buses/vacant-permits?${params.toString()}`).then((r) => {
      setOptions(r.data || []);
    });
  }, [search, includeId]);

  useEffect(() => {
    setLabel(selectedLabel || "");
  }, [selectedLabel]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(p: VacantPermit) {
    const lbl = `${p.permitNumber}${p.routeNumber ? ` — Route ${p.routeNumber}` : ""}`;
    setLabel(lbl);
    setSearch("");
    setOpen(false);
    onChange(p.id, lbl);
  }

  function clear() {
    setLabel("");
    setSearch("");
    onChange("", "");
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={open ? search : (label || "")}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search permit number or route..."
            className="rounded-xl h-10 pr-8"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {value && (
          <Button variant="ghost" size="icon" onClick={clear} className="h-10 w-10 rounded-xl shrink-0">
            <X size={14} />
          </Button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No vacant permits found</p>
          ) : (
            options.map((p) => (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); select(p); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
              >
                <span className="font-bold text-slate-800">{p.permitNumber}</span>
                {p.routeNumber && <span className="text-slate-400 ml-2">Route {p.routeNumber}</span>}
                {p.routePermitType && (
                  <Badge variant="secondary" className="ml-2 text-[10px] py-0">{p.routePermitType}</Badge>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminBusesPage() {
  const [allBuses, setAllBuses] = useState<BusRecord[]>([]);
  const [totalPermits, setTotalPermits] = useState(0);
  const [totalOnlineLiveVehicles, setTotalOnlineLiveVehicles] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [sortKey, setSortKey] = useState<SortKey>("busNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBus, setEditingBus] = useState<BusRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [permitLabel, setPermitLabel] = useState("");

  const fetchBuses = useCallback(async () => {
    setLoading(true);
    try {
      const perPage = 1000;
      let currentPage = 1;
      let lastPage = 1;
      const rows: BusRecord[] = [];

      do {
        const params = new URLSearchParams({
          page: String(currentPage),
          perPage: String(perPage),
        });
        const json = await apiFetch(`/buses?${params}`);
        rows.push(...(json.data || []));
        lastPage = Number(json.meta?.lastPage || 1);
        currentPage += 1;
      } while (currentPage <= lastPage);

      setAllBuses(rows);
    } catch {
      notify.error("Failed to load buses.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPermitCount = useCallback(async () => {
    try {
      const json = await apiFetch("/permits?page=1&perPage=1");
      setTotalPermits(Number(json.meta?.total || 0));
    } catch {
      setTotalPermits(0);
    }
  }, []);

  const fetchOnlineLiveVehiclesCount = useCallback(async () => {
    try {
      const json = await apiFetch("/stats");
      setTotalOnlineLiveVehicles(Number(json?.data?.onlineDevices || 0));
    } catch {
      setTotalOnlineLiveVehicles(0);
    }
  }, []);

  useEffect(() => {
    fetchBuses();
    setPage(1);
  }, [fetchBuses]);

  useEffect(() => {
    fetchPermitCount();
  }, [fetchPermitCount]);

  useEffect(() => {
    fetchOnlineLiveVehiclesCount();
  }, [fetchOnlineLiveVehiclesCount]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, globalSearch]);

  const searchFiltered = allBuses.filter((b) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (b.busNumber || "").toLowerCase().includes(q) ||
      (b.routeNumber || "").toLowerCase().includes(q) ||
      (b.permit?.permitNumber || "").toLowerCase().includes(q) ||
      (b.permit?.routePermitType || "").toLowerCase().includes(q)
    );
  });

  const filteredBuses = searchFiltered.filter((b) => {
    if (statusFilter === "online") return Boolean(b.isOnline);
    if (statusFilter === "offline") return !b.isOnline;
    return true;
  });

  const totalWithPermit = allBuses.filter((b) => b.permit).length;
  const totalWithoutPermit = allBuses.length - totalWithPermit;
  const totalOnline = totalOnlineLiveVehicles;
  const totalOffline = Math.max(0, allBuses.length - totalOnline);

  // Client-side sort
  const sorted = [...filteredBuses].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    if (sortKey === "busNumber") { av = a.busNumber; bv = b.busNumber; }
    else if (sortKey === "routeNumber") { av = a.routeNumber || ""; bv = b.routeNumber || ""; }
    else if (sortKey === "seatingCapacity") { av = a.seatingCapacity ?? -1; bv = b.seatingCapacity ?? -1; }
    else if (sortKey === "totalDistance") { av = a.totalDistance ?? -1; bv = b.totalDistance ?? -1; }
    else if (sortKey === "permitNumber") { av = a.permit?.permitNumber || ""; bv = b.permit?.permitNumber || ""; }
    else if (sortKey === "routePermitType") { av = a.permit?.routePermitType || ""; bv = b.permit?.routePermitType || ""; }
    if (typeof av === "number") return sortDir === "asc" ? av - (bv as number) : (bv as number) - av;
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv), undefined, { numeric: true })
      : String(bv).localeCompare(String(av), undefined, { numeric: true });
  });

  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
    setPage(1);
  }

  function openCreate() {
    setEditingBus(null);
    setForm(EMPTY_FORM);
    setPermitLabel("");
    setDialogOpen(true);
  }
  function openEdit(b: BusRecord) {
    setEditingBus(b);
    setForm({
      busNumber: b.busNumber,
      routePermitId: b.routePermitId || "",
      seatingCapacity: b.seatingCapacity != null ? String(b.seatingCapacity) : "",
      driverContact: b.driverContact,
      conductorContact: b.conductorContact,
    });
    setPermitLabel(b.permit ? `${b.permit.permitNumber}${b.routeNumber ? ` — Route ${b.routeNumber}` : ""}` : "");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.busNumber.trim()) { notify.warning("Bus Number is required."); return; }
    if (!form.routePermitId) { notify.warning("Route Permit is required."); return; }
    if (!form.seatingCapacity || Number(form.seatingCapacity) <= 0) { notify.warning("Seating Capacity is required."); return; }
    if (!form.driverContact.trim()) { notify.warning("Driver Contact is required."); return; }
    if (!form.conductorContact.trim()) { notify.warning("Conductor Contact is required."); return; }
    setSaving(true);
    const body = {
      busNumber: form.busNumber.trim(),
      routePermitId: form.routePermitId || undefined,
      seatingCapacity: form.seatingCapacity ? Number(form.seatingCapacity) : undefined,
      driverContact: form.driverContact.trim() || undefined,
      conductorContact: form.conductorContact.trim() || undefined,
    };
    try {
      const json = editingBus
        ? await apiFetch(`/buses/${editingBus.id}`, "PUT", body)
        : await apiFetch("/buses", "POST", body);
      if (json.success) {
        setDialogOpen(false);
        fetchBuses();
        fetchPermitCount();
        notify.success(editingBus ? "Bus updated successfully." : "Bus created successfully.");
      } else notify.error(json.error || "Failed to save bus.");
    } catch {
      notify.error("Failed to save bus.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(b: BusRecord) {
    if (!confirm(`Delete bus "${b.busNumber}"?`)) return;
    try {
      const json = await apiFetch(`/buses/${b.id}`, "DELETE");
      if (json.success) {
        fetchBuses();
        fetchPermitCount();
        notify.success("Bus deleted successfully.");
      } else notify.error(json.error || "Failed to delete bus.");
    } catch {
      notify.error("Failed to delete bus.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
            <Bus className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Buses</h1>
            <p className="text-sm text-slate-500">Manage registered fleet</p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2 font-bold">
          <Plus size={16} /> Add Bus
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Buses", value: allBuses.length, filter: "all" as const, text: "text-blue-600", sub: `${totalPermits} total permits` },
          { label: "Online Buses", value: totalOnline, filter: "online" as const, text: "text-emerald-600", sub: `${totalWithPermit} with permits` },
          { label: "Offline Buses", value: totalOffline, filter: "offline" as const, text: "text-amber-600", sub: `${totalWithoutPermit} without permits` },
          { label: "Search Results", value: searchFiltered.length, filter: "all" as const, text: "text-violet-600", sub: `for "${globalSearch || "all"}"` },
        ].map(({ label, value, filter, text, sub }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(filter)}
            className={`text-left bg-white border rounded-2xl p-4 shadow-sm transition-colors ${
              statusFilter === filter ? "border-primary ring-2 ring-primary/20" : "border-slate-100 hover:border-slate-200"
            }`}
          >
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-2xl font-black mt-1 ${text}`}>{loading ? "—" : value}</p>
            <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
          </button>
        ))}
      </div>

      {/* Global search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={globalSearch}
          onChange={(e) => { setGlobalSearch(e.target.value); setPage(1); }}
          placeholder="Search buses, routes, permits..."
          className="pl-9 rounded-xl h-10"
        />
        {globalSearch && (
          <button onClick={() => setGlobalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary opacity-20" />
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Bus size={32} className="text-slate-200" />
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No buses found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <SortHead label="Bus Number" col="busNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Route" col="routeNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Seating" col="seatingCapacity" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Distance" col="totalDistance" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Permit No." col="permitNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Permit Type" col="routePermitType" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <TableHead className="text-right pr-4 font-black text-slate-600 text-xs uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((b) => (
                <TableRow key={b.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-bold text-slate-800">{b.busNumber}</TableCell>
                  <TableCell className="text-slate-600">{b.routeNumber || <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-slate-600">{b.seatingCapacity ?? <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell className="text-slate-600">{b.totalDistance != null ? `${b.totalDistance} km` : <span className="text-slate-300">—</span>}</TableCell>
                  <TableCell>
                    {b.permit ? (
                      <div>
                        <p className="text-xs font-bold text-slate-700">{b.permit.permitNumber}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{b.permit.id.slice(0, 8)}…</p>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    {b.permit?.routePermitType ? (
                      <Badge variant="secondary" className="text-xs">{b.permit.routePermitType}</Badge>
                    ) : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:text-primary hover:bg-primary/10" onClick={() => openEdit(b)}>
                        <Pencil size={13} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(b)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            <ChevronLeft size={15} />
          </Button>
          <span className="text-sm font-bold text-slate-600">
            Page <span className="text-primary">{safePage}</span> of {totalPages}
            <span className="text-slate-400 font-normal ml-2">({sorted.length} buses)</span>
          </span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
            <ChevronRight size={15} />
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-slate-900">{editingBus ? "Edit Bus" : "Add New Bus"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bus Number *</Label>
              <Input value={form.busNumber} onChange={(e) => setForm((f) => ({ ...f, busNumber: e.target.value }))} placeholder="e.g. NA-1234" className="rounded-xl h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Route Permit *</Label>
              <PermitDropdown
                value={form.routePermitId}
                selectedLabel={permitLabel}
                includeId={editingBus?.routePermitId || undefined}
                onChange={(id, label) => {
                  setForm((f) => ({ ...f, routePermitId: id }));
                  setPermitLabel(label);
                }}
              />
              <p className="text-[11px] text-slate-400">Select permit or clear to unassign during edit</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Seating Capacity *</Label>
                <Input type="number" min={1} value={form.seatingCapacity} onChange={(e) => setForm((f) => ({ ...f, seatingCapacity: e.target.value }))} placeholder="e.g. 52" className="rounded-xl h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Driver Contact *</Label>
                <Input value={form.driverContact} onChange={(e) => setForm((f) => ({ ...f, driverContact: e.target.value }))} placeholder="+94 7X XXX XXXX" className="rounded-xl h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Conductor Contact *</Label>
                <Input value={form.conductorContact} onChange={(e) => setForm((f) => ({ ...f, conductorContact: e.target.value }))} placeholder="+94 7X XXX XXXX" className="rounded-xl h-10" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button className="rounded-xl font-bold" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : editingBus ? "Save Changes" : "Create Bus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
