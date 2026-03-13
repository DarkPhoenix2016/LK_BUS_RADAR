"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Permit {
  id: string;
  permitNumber: string;
  routePermitType: string;
  routeId: string | null;
  ownerId: string | null;
  routeNumber: string;
  ownerName: string;
  ownerNic: string;
}

interface Meta {
  total: number;
  page: number;
  perPage: number;
  lastPage: number;
}

interface RouteOption {
  id: string;
  routeNumber: string;
  startName: string;
  endName: string;
}

interface OwnerOption {
  id: string;
  name: string;
  nic: string;
  email: string;
}

type SortKey = "permitNumber" | "routePermitType" | "routeNumber" | "ownerName";
type SortDir = "asc" | "desc";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

async function api(path: string, method = "GET", body?: object) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/admin/fleet${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const emptyForm = { permitNumber: "", routePermitType: "", routeId: "", ownerId: "" };

export default function PermitsPage() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, perPage: 20, lastPage: 1 });
  const [totalPermitsGlobal, setTotalPermitsGlobal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [globalSearch, setGlobalSearch] = useState("");
  const [page, setPage] = useState(1);

  const [sortKey, setSortKey] = useState<SortKey>("permitNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPermit, setEditingPermit] = useState<Permit | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Route searchable dropdown
  const [routeSearch, setRouteSearch] = useState("");
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [routeDropOpen, setRouteDropOpen] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const routeDropRef = useRef<HTMLDivElement>(null);

  // Owner searchable dropdown
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerDropOpen, setOwnerDropOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<OwnerOption | null>(null);
  const ownerDropRef = useRef<HTMLDivElement>(null);

  // Click-outside for route dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (routeDropRef.current && !routeDropRef.current.contains(e.target as Node)) {
        setRouteDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Click-outside for owner dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ownerDropRef.current && !ownerDropRef.current.contains(e.target as Node)) {
        setOwnerDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced route search
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/routes/search?q=${encodeURIComponent(routeSearch)}`);
        setRouteOptions(data.routes ?? data.data ?? []);
      } catch {
        setRouteOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [routeSearch]);

  // Debounced owner search
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/owners/search?q=${encodeURIComponent(ownerSearch)}`);
        setOwnerOptions(data.owners ?? data.data ?? []);
      } catch {
        setOwnerOptions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ownerSearch]);

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "20",
        search: globalSearch,
      });
      const data = await api(`/permits?${params.toString()}`);
      if (data?.success === false) {
        notify.error(data?.error || "Failed to load permits.");
        return;
      }
      const raw: Permit[] = data.permits ?? data.data ?? [];
      const sorted = [...raw].sort((a, b) => {
        const av = (a[sortKey] ?? "").toLowerCase();
        const bv = (b[sortKey] ?? "").toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
      setPermits(sorted);
      setMeta(
        data.meta ?? {
          total: raw.length,
          page,
          perPage: 20,
          lastPage: Math.ceil(raw.length / 20) || 1,
        }
      );
    } catch {
      notify.error("Failed to load permits.");
    } finally {
      setLoading(false);
    }
  }, [page, globalSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchPermits();
  }, [fetchPermits]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api("/permits?page=1&perPage=1");
        setTotalPermitsGlobal(Number(data?.meta?.total || 0));
      } catch {
        setTotalPermitsGlobal(0);
      }
    })();
  }, []);

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3 text-primary" />
    );
  }

  async function loadInitialDropdownOptions() {
    try {
      const [rData, oData] = await Promise.all([
        api("/routes/search?q="),
        api("/owners/search?q="),
      ]);
      setRouteOptions(rData.routes ?? rData.data ?? []);
      setOwnerOptions(oData.owners ?? oData.data ?? []);
    } catch {
      // silently fail — user can still type to search
    }
  }

  function openCreate() {
    setEditingPermit(null);
    setForm(emptyForm);
    setSelectedRoute(null);
    setSelectedOwner(null);
    setRouteSearch("");
    setOwnerSearch("");
    loadInitialDropdownOptions();
    setDialogOpen(true);
  }

  function openEdit(permit: Permit) {
    setEditingPermit(permit);
    setForm({
      permitNumber: permit.permitNumber,
      routePermitType: permit.routePermitType,
      routeId: permit.routeId ?? "",
      ownerId: permit.ownerId ?? "",
    });
    setRouteSearch("");
    setOwnerSearch("");
    // Pre-fill selected items from permit data
    setSelectedRoute(
      permit.routeId
        ? { id: permit.routeId, routeNumber: permit.routeNumber, startName: "", endName: "" }
        : null
    );
    setSelectedOwner(
      permit.ownerId
        ? { id: permit.ownerId, name: permit.ownerName, nic: permit.ownerNic, email: "" }
        : null
    );
    loadInitialDropdownOptions();
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.permitNumber.trim() || !form.routePermitType.trim() || !form.routeId || !form.ownerId) {
      notify.warning("All fields are mandatory (Permit Number, Permit Type, Route, Owner).");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        permitNumber: form.permitNumber,
        routePermitType: form.routePermitType,
        routeId: form.routeId || null,
        ownerId: form.ownerId || null,
      };
      if (editingPermit) {
        const res = await api(`/permits/${editingPermit.id}`, "PUT", payload);
        if (!res?.success) {
          notify.error(res?.error || "Failed to save permit.");
          return;
        }
        notify.success("Permit updated successfully.");
      } else {
        const res = await api("/permits", "POST", payload);
        if (!res?.success) {
          notify.error(res?.error || "Failed to save permit.");
          return;
        }
        notify.success("Permit created successfully.");
      }
      setDialogOpen(false);
      fetchPermits();
    } catch {
      notify.error("Failed to save permit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(permit: Permit) {
    if (!window.confirm(`Delete permit "${permit.permitNumber}"? This cannot be undone.`)) return;
    try {
      const res = await api(`/permits/${permit.id}`, "DELETE");
      if (!res?.success) {
        notify.error(res?.error || "Failed to delete permit.");
        return;
      }
      notify.success("Permit deleted.");
      fetchPermits();
    } catch {
      notify.error("Failed to delete permit.");
    }
  }

  function selectRoute(r: RouteOption) {
    setSelectedRoute(r);
    setForm((f) => ({ ...f, routeId: r.id }));
    setRouteDropOpen(false);
    setRouteSearch("");
  }

  function clearRoute() {
    setSelectedRoute(null);
    setForm((f) => ({ ...f, routeId: "" }));
    setRouteSearch("");
  }

  function selectOwner(o: OwnerOption) {
    setSelectedOwner(o);
    setForm((f) => ({ ...f, ownerId: o.id }));
    setOwnerDropOpen(false);
    setOwnerSearch("");
  }

  function clearOwner() {
    setSelectedOwner(null);
    setForm((f) => ({ ...f, ownerId: "" }));
    setOwnerSearch("");
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <FileText className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Route Permits</h1>
            <p className="text-slate-500 font-medium text-sm">
              {meta.total} permit{meta.total !== 1 ? "s" : ""} registered
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" />
          Add Permit
        </Button>
      </div>

      {/* Insight counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Permits", value: totalPermitsGlobal, color: "text-blue-600" },
          { label: "Search Results", value: meta.total, color: "text-violet-600" },
          { label: "With Route Linked", value: permits.filter((p) => Boolean(p.routeId)).length, color: "text-emerald-600" },
          { label: "With Owner Linked", value: permits.filter((p) => Boolean(p.ownerId)).length, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="pl-9 rounded-xl"
          placeholder="Search permits..."
          value={globalSearch}
          onChange={(e) => {
            setGlobalSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary opacity-30" />
          </div>
        ) : permits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <FileText className="w-10 h-10 opacity-30" />
            <p className="text-sm font-bold uppercase tracking-widest italic">No permits found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {(
                  [
                    { key: "permitNumber" as SortKey, label: "Permit Number" },
                    { key: "routePermitType" as SortKey, label: "Type" },
                    { key: "routeNumber" as SortKey, label: "Route" },
                    { key: "ownerName" as SortKey, label: "Owner" },
                  ] as { key: SortKey; label: string }[]
                ).map(({ key, label }, i) => (
                  <TableHead
                    key={key}
                    className={`text-xs font-black uppercase tracking-wider text-slate-400 ${i === 0 ? "pl-6" : ""}`}
                  >
                    <button
                      onClick={() => handleSortClick(key)}
                      className="flex items-center gap-1 hover:text-slate-700 transition-colors"
                    >
                      {label}
                      <SortIcon col={key} />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="text-xs font-black uppercase tracking-wider text-slate-400 pr-6 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permits.map((permit) => (
                <TableRow key={permit.id} className="hover:bg-slate-50/60">
                  <TableCell className="pl-6">
                    <span className="font-bold text-slate-900">{permit.permitNumber}</span>
                  </TableCell>
                  <TableCell>
                    {permit.routePermitType ? (
                      <Badge variant="secondary" className="capitalize rounded-lg text-xs">
                        {permit.routePermitType}
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {permit.routeNumber ? (
                      <span className="font-mono text-sm font-bold text-primary bg-primary/8 px-2 py-0.5 rounded-lg">
                        {permit.routeNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {permit.ownerName ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-slate-800 text-sm">{permit.ownerName}</span>
                        {permit.ownerNic && (
                          <Badge variant="outline" className="text-[10px] w-fit rounded-md px-1.5">
                            {permit.ownerNic}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-slate-200 hover:border-primary/40 hover:text-primary"
                        onClick={() => openEdit(permit)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-slate-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50"
                        onClick={() => handleDelete(permit)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
      {meta.lastPage > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-bold text-slate-600">
            Page <span className="text-primary">{meta.page}</span> of {meta.lastPage}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl h-9 w-9"
            onClick={() => setPage((p) => Math.min(meta.lastPage, p + 1))}
            disabled={page >= meta.lastPage}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900">
              {editingPermit ? "Edit Permit" : "Add Permit"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Permit Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Permit Number <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. RP-001234"
                value={form.permitNumber}
                onChange={(e) => setForm((f) => ({ ...f, permitNumber: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            {/* Route Permit Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Permit Type <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. express, normal"
                value={form.routePermitType}
                onChange={(e) => setForm((f) => ({ ...f, routePermitType: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            {/* Route Searchable Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Route <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={routeDropRef}>
                {selectedRoute ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="font-mono font-bold text-primary text-sm">
                      {selectedRoute.routeNumber}
                    </span>
                    {selectedRoute.startName && selectedRoute.endName && (
                      <span className="text-slate-500 text-xs truncate">
                        {selectedRoute.startName} → {selectedRoute.endName}
                      </span>
                    )}
                    <button
                      onClick={clearRoute}
                      className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      className="pl-9 rounded-xl"
                      placeholder="Search routes..."
                      value={routeSearch}
                      onChange={(e) => {
                        setRouteSearch(e.target.value);
                        setRouteDropOpen(true);
                      }}
                      onFocus={() => setRouteDropOpen(true)}
                    />
                  </div>
                )}

                {routeDropOpen && !selectedRoute && routeOptions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {routeOptions.map((r) => (
                      <button
                        key={r.id}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectRoute(r);
                        }}
                      >
                        <span className="font-mono font-bold text-primary text-sm shrink-0">
                          {r.routeNumber}
                        </span>
                        <span className="text-slate-500 text-xs truncate">
                          {r.startName} → {r.endName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {routeDropOpen && !selectedRoute && routeOptions.length === 0 && routeSearch && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl">
                    <div className="px-4 py-3 text-sm text-slate-400 text-center">No routes found</div>
                  </div>
                )}
              </div>
            </div>

            {/* Owner Searchable Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Owner <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={ownerDropRef}>
                {selectedOwner ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="font-semibold text-slate-800 text-sm">{selectedOwner.name}</span>
                    <span className="text-slate-400 text-xs">
                      {selectedOwner.nic || selectedOwner.email}
                    </span>
                    <button
                      onClick={clearOwner}
                      className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      className="pl-9 rounded-xl"
                      placeholder="Search owners..."
                      value={ownerSearch}
                      onChange={(e) => {
                        setOwnerSearch(e.target.value);
                        setOwnerDropOpen(true);
                      }}
                      onFocus={() => setOwnerDropOpen(true)}
                    />
                  </div>
                )}

                {ownerDropOpen && !selectedOwner && ownerOptions.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    {ownerOptions.map((o) => (
                      <button
                        key={o.id}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-3 border-b border-slate-50 last:border-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectOwner(o);
                        }}
                      >
                        <span className="font-semibold text-slate-800 text-sm">{o.name}</span>
                        <span className="text-slate-400 text-xs">{o.nic || o.email}</span>
                      </button>
                    ))}
                  </div>
                )}

                {ownerDropOpen && !selectedOwner && ownerOptions.length === 0 && ownerSearch && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl">
                    <div className="px-4 py-3 text-sm text-slate-400 text-center">No owners found</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="rounded-xl gap-2" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingPermit ? "Save Changes" : "Create Permit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
