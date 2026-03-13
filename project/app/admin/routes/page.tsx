"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notify } from "@/lib/notify";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft, ChevronRight,
  Eye, EyeOff,
  Loader2, Map,
  Pencil,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BusStopOption, StopItem } from "./StopsMapEditor";
import { fetchAdminConfigMap, formatConfigValue, type AdminConfigMap } from "@/lib/admin-configs";

// Dynamic import so Leaflet only runs client-side
const StopsMapEditor = dynamic(() => import("./StopsMapEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-50 rounded-xl border border-slate-200">
      <Loader2 className="animate-spin text-primary" size={24} />
    </div>
  ),
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

async function readApiJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid server response (${res.status})`);
  }
}

/* ─── types ─── */

interface RouteRecord {
  _id?: string;
  routeNumber: string;
  startStop?: string;
  endStop?: string;
  routeDistance?: number;
  isActive: boolean;
  stopCount?: number;
  priceFullJourney?: number;
  averageCompletionTime?: number;
}

interface RouteForm {
  routeNumber: string;
  routeDistance: string;
  priceFullJourney: string;
  averageCompletionTime: string;
  isActive: boolean;
}

const EMPTY_FORM: RouteForm = {
  routeNumber: "",
  routeDistance: "",
  priceFullJourney: "",
  averageCompletionTime: "",
  isActive: true,
};

function getStopName(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    return String(v.name || v.stopName || v._id || "");
  }
  return String(value);
}

function normalizeRoute(row: Record<string, unknown>): RouteRecord {
  return {
    _id: row?._id ? String(row._id) : row?.id ? String(row.id) : undefined,
    routeNumber: String(row?.routeNumber ?? ""),
    startStop: getStopName(row?.startStop ?? row?.start),
    endStop: getStopName(row?.endStop ?? row?.end),
    routeDistance:
      row?.routeDistance != null && Number.isFinite(Number(row.routeDistance))
        ? Number(row.routeDistance)
        : undefined,
    isActive: Boolean(row?.isActive ?? true),
    stopCount: Number(row?.stopCount ?? 0),
    priceFullJourney:
      row?.priceFullJourney != null ? Number(row.priceFullJourney) : undefined,
    averageCompletionTime:
      row?.averageCompletionTime != null ? Number(row.averageCompletionTime) : undefined,
  };
}

/* ─── helpers ─── */

function fmtTime(minutes: number | undefined): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ─── main component ─── */

export default function AdminRoutesPage() {
  const [allRoutes, setAllRoutes] = useState<RouteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);

  /* edit dialog */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteRecord | null>(null);
  const [form, setForm] = useState<RouteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /* stops management */
  const [stopsUp, setStopsUp] = useState<StopItem[]>([]);
  const [stopsDown, setStopsDown] = useState<StopItem[]>([]);
  const [direction, setDirection] = useState<"UP" | "DOWN">("UP");
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsSaving, setStopsSaving] = useState(false);

  /* stop name search (typeahead) */
  const [stopSearch, setStopSearch] = useState("");
  const [stopSearchResults, setStopSearchResults] = useState<BusStopOption[]>([]);
  const [stopSearchOpen, setStopSearchOpen] = useState(false);
  const stopSearchRef = useRef<HTMLDivElement>(null);

  /* map click — nearby panel */
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyStops, setNearbyStops] = useState<BusStopOption[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);

  /* create new stop */
  const [newStopName, setNewStopName] = useState("");
  const [newStopOrder, setNewStopOrder] = useState("1");
  const [newStopType, setNewStopType] = useState("");
  const [newStopRadius, setNewStopRadius] = useState("");
  const [creatingStop, setCreatingStop] = useState(false);
  const [configMap, setConfigMap] = useState<AdminConfigMap>({});

  const stopTypes = (configMap.stop_types || []).map(String);
  const geofenceRadii = (configMap.geofence_radius || []).map((value) => String(value));


  /* ── fetch routes ── */
  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/fleet/routes?perPage=1000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      const rows: RouteRecord[] = (json.data ?? []).map(normalizeRoute);
      setAllRoutes(rows);
      setPage(1);
    } catch {
      notify.error("Network error: could not fetch routes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  useEffect(() => {
    void (async () => {
      try {
        const map = await fetchAdminConfigMap();
        setConfigMap(map);
        setNewStopType((current) => current || String(map.stop_types?.[0] || "geofence"));
        setNewStopRadius((current) => current || String(map.geofence_radius?.[0] || 100));
      } catch {
        notify.error("Failed to load config values.");
      }
    })();
  }, []);

  useEffect(() => { setPage(1); }, [searchInput, statusFilter]);

  /* ── click outside stop search dropdown ── */
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (stopSearchRef.current && !stopSearchRef.current.contains(e.target as Node)) {
        setStopSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ── debounced stop search ── */
  useEffect(() => {
    if (!stopSearch.trim()) { setStopSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE}/admin/fleet/bus-stops?search=${encodeURIComponent(stopSearch)}&limit=15`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setStopSearchResults(data.data ?? []);
      } catch { setStopSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [stopSearch]);

  /* ── filtering / pagination ── */
  const searchFiltered = allRoutes.filter((r) => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.routeNumber || "").toLowerCase().includes(q) ||
      (r.startStop || "").toLowerCase().includes(q) ||
      (r.endStop || "").toLowerCase().includes(q)
    );
  });

  const filteredRoutes = searchFiltered.filter((r) => {
    if (statusFilter === "active") return r.isActive;
    if (statusFilter === "inactive") return !r.isActive;
    return true;
  });

  const totalActive = allRoutes.filter((r) => r.isActive).length;
  const totalInactive = allRoutes.length - totalActive;

  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredRoutes.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  /* ── open edit dialog ── */
  async function openEdit(route: RouteRecord) {
    if (!route._id) { notify.warning("This route has no ID and cannot be edited."); return; }
    setEditingRoute(route);
    setForm({
      routeNumber: route.routeNumber ?? "",
      routeDistance: route.routeDistance != null ? String(route.routeDistance) : "",
      priceFullJourney: route.priceFullJourney != null ? String(route.priceFullJourney) : "",
      averageCompletionTime: route.averageCompletionTime != null ? String(route.averageCompletionTime) : "",
      isActive: route.isActive,
    });
    setDirection("UP");
    setStopsUp([]);
    setStopsDown([]);
    setStopSearch("");
    setStopSearchResults([]);
    setDialogOpen(true);

    const token = await getToken();
    await loadStops(route._id, token);
  }

  async function loadStops(routeId: string, token: string) {
    setStopsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/fleet/routes/${routeId}/stops`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiJson<{ data?: { up?: StopItem[]; down?: StopItem[] } }>(res);
      setStopsUp(data.data?.up ?? []);
      setStopsDown(data.data?.down ?? []);
    } catch {
      setStopsUp([]);
      setStopsDown([]);
    } finally {
      setStopsLoading(false);
    }
  }

  function openCreate() {
    setEditingRoute(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  /* reset create form when direction switches */
  useEffect(() => {
    setNewStopName("");
    setNewStopOrder("1");
  }, [direction]);

  /* map click — fetch nearby stops and keep marker visible */
  async function handleMapClick(lat: number, lng: number) {
    setClickedPoint({ lat, lng });
    setLoadingNearby(true);
    setNewStopName("");
    try {
      const token = await getToken();
      const res = await fetch(
        `${API_BASE}/admin/fleet/bus-stops?lat=${lat}&lng=${lng}&radius=0.03&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await readApiJson<{ data?: BusStopOption[] }>(res);
      setNearbyStops(data.data ?? []);
    } catch {
      setNearbyStops([]);
    } finally {
      setLoadingNearby(false);
    }
  }

  function normalizeStopOrders(stops: StopItem[]): StopItem[] {
    return stops.map((s, i) => ({ ...s, displayOrder: i + 1 }));
  }

  function getStopsByDirection(targetDirection: "UP" | "DOWN"): StopItem[] {
    return targetDirection === "UP" ? stopsUp : stopsDown;
  }

  function setStopsByDirection(targetDirection: "UP" | "DOWN", next: StopItem[]) {
    if (targetDirection === "UP") {
      setStopsUp(normalizeStopOrders(next));
      return;
    }
    setStopsDown(normalizeStopOrders(next));
  }

  function withInsertedStop(stops: StopItem[], stop: StopItem, orderInput: string): StopItem[] {
    const next = [...stops];
    const parsedOrder = Number(orderInput);
    const requested = Number.isFinite(parsedOrder) ? Math.floor(parsedOrder) : stops.length + 1;
    const insertAt = Math.max(0, Math.min(stops.length, requested - 1));
    next.splice(insertAt, 0, stop);
    return normalizeStopOrders(next);
  }

  /* create a new BusStop at the clicked location and add to route */
  async function handleCreateStop() {
    if (!newStopName.trim() || !clickedPoint) return;
    setCreatingStop(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/fleet/bus-stops`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newStopName.trim(),
          latitude: clickedPoint.lat,
          longitude: clickedPoint.lng,
          type: newStopType || undefined,
          geoFenceRadius: newStopRadius ? Number(newStopRadius) : undefined,
        }),
      });
      const data = await readApiJson<{ success?: boolean; data?: BusStopOption; error?: string }>(res);
      if (data.success && data.data) {
        addStop(data.data as BusStopOption, direction, newStopOrder);
        setNewStopName("");
        setNewStopOrder("1");
        notify.success("Stop point created and added.");
      } else {
        notify.error(String(data.error || "Failed to create stop."));
      }
    } catch (err) {
      notify.error("Failed to create stop.", { description: String(err) });
    } finally {
      setCreatingStop(false);
    }
  }

  /* ── save details ── */
  async function handleSaveDetails() {
    if (!form.routeNumber.trim()) { notify.warning("Route Number is required."); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        routeNumber: form.routeNumber.trim(),
        isActive: form.isActive,
      };
      if (form.routeDistance) body.routeDistance = Number(form.routeDistance);
      if (form.priceFullJourney) body.priceFullJourney = Number(form.priceFullJourney);
      if (form.averageCompletionTime) body.averageCompletionTime = Number(form.averageCompletionTime);

      const url = editingRoute
        ? `${API_BASE}/admin/fleet/routes/${editingRoute._id}`
        : `${API_BASE}/admin/fleet/routes`;
      const method = editingRoute ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        await fetchRoutes();
        notify.success(editingRoute ? "Route updated successfully." : "Route created successfully.");
      } else {
        notify.error(json.message || "Failed to save route.");
      }
    } catch {
      notify.error("Network error: could not save route.");
    } finally {
      setSaving(false);
    }
  }

  /* ── save stops (both directions) ── */
  async function saveDirectionStops(routeId: string, targetDirection: "UP" | "DOWN", token: string) {
    const directionStops = getStopsByDirection(targetDirection);
    const payload = normalizeStopOrders(directionStops).map((s, i) => ({
      routeId,
      direction: targetDirection,
      stopId: s.stopId,
      displayOrder: i + 1,
    }));

    const res = await fetch(`${API_BASE}/admin/fleet/routes/${routeId}/stops`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ direction: targetDirection, stops: payload }),
    });
    const json = await readApiJson<{ success?: boolean; error?: string; message?: string }>(res);
    if (!res.ok || !json.success) {
      throw new Error(String(json.error || json.message || `Failed to save ${targetDirection} stops.`));
    }
  }

  async function handleSaveStops() {
    if (!editingRoute?._id) return;
    setStopsSaving(true);
    try {
      const token = await getToken();
      await saveDirectionStops(editingRoute._id, "UP", token);
      await saveDirectionStops(editingRoute._id, "DOWN", token);
      await loadStops(editingRoute._id, token);
      await fetchRoutes();
      notify.success("Stops saved for both directions.");
    } catch (err) {
      notify.error(String(err || "Network error: could not save stops."));
    } finally {
      setStopsSaving(false);
    }
  }

  /* ── toggle active ── */
  async function handleToggleActive(route: RouteRecord) {
    if (!route._id) return;
    setTogglingId(route._id);
    try {
      const token = await getToken();
      await fetch(`${API_BASE}/admin/fleet/routes/${route._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !route.isActive }),
      });
      await fetchRoutes();
      notify.success(`Route ${route.isActive ? "deactivated" : "activated"} successfully.`);
    } catch {
      notify.error("Network error.");
    } finally {
      setTogglingId(null);
    }
  }

  /* ── stop list helpers ── */
  const currentStops = direction === "UP" ? stopsUp : stopsDown;

  function addStop(stop: BusStopOption, targetDirection: "UP" | "DOWN" = direction, orderInput = "") {
    const targetStops = getStopsByDirection(targetDirection);
    if (targetStops.some((s) => s.stopId === stop.id)) return;
    const next = withInsertedStop(
      targetStops,
      {
        stopId: stop.id,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        displayOrder: targetStops.length + 1,
      },
      orderInput
    );
    setStopsByDirection(targetDirection, next);
  }

  function removeStop(index: number, targetDirection: "UP" | "DOWN" = direction) {
    const targetStops = getStopsByDirection(targetDirection);
    setStopsByDirection(targetDirection, targetStops.filter((_, i) => i !== index));
  }

  function moveStop(index: number, dir: "up" | "down", targetDirection: "UP" | "DOWN" = direction) {
    const targetStops = getStopsByDirection(targetDirection);
    const arr = [...targetStops];
    const swapWith = dir === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= arr.length) return;
    [arr[index], arr[swapWith]] = [arr[swapWith], arr[index]];
    setStopsByDirection(targetDirection, arr);
  }

  function populateReverseToOtherDirection() {
    const source = currentStops;
    const reversed = normalizeStopOrders([...source].reverse());
    if (direction === "UP") {
      setStopsDown(reversed);
      return;
    }
    setStopsUp(reversed);
  }

  /* ── drag-to-reorder ── */
  const dragIndex = useRef<number | null>(null);

  function handleDragStart(e: React.DragEvent, index: number) {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from == null || from === dropIndex) return;
    const arr = [...currentStops];
    const [item] = arr.splice(from, 1);
    arr.splice(dropIndex, 0, item);
    setStopsByDirection(direction, arr);
    dragIndex.current = null;
  }

  /* ─── render ─── */

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
            <Map className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Routes</h1>
            <p className="text-sm text-slate-500 font-medium">Manage bus routes and their stops</p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl font-bold gap-2">
          <Plus size={16} /> Add Route
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Routes", value: allRoutes.length, filter: "all" as const, text: "text-blue-600", sub: `${totalActive} active` },
          { label: "Active Routes", value: totalActive, filter: "active" as const, text: "text-emerald-600", sub: `${totalInactive} inactive` },
          { label: "Inactive Routes", value: totalInactive, filter: "inactive" as const, text: "text-amber-600", sub: "click to filter" },
          { label: "Search Results", value: searchFiltered.length, filter: "all" as const, text: "text-violet-600", sub: `for "${searchInput || "all"}"` },
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

      {/* Search */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by route number or stop..."
            className="pl-9 rounded-xl h-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={28} className="animate-spin text-primary opacity-30" />
            <span className="text-sm font-bold text-slate-300 uppercase tracking-widest">Loading...</span>
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Map size={32} className="text-slate-200" />
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No routes found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="pl-5 font-black text-slate-600 text-xs uppercase tracking-wider">Route</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Start Stop</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">End Stop</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Stops</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Distance</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Full Fare</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Avg Time</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Status</TableHead>
                <TableHead className="pr-5 font-black text-slate-600 text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((route, index) => (
                <TableRow
                  key={route._id || `${route.routeNumber}-${index}`}
                  className="hover:bg-slate-50/60"
                >
                  <TableCell className="pl-5 font-bold text-slate-800">{route.routeNumber}</TableCell>
                  <TableCell className="text-slate-600 max-w-[140px] truncate">
                    {route.startStop || <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 max-w-[140px] truncate">
                    {route.endStop || <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    {route.stopCount != null && route.stopCount > 0 ? (
                      <Badge variant="secondary" className="rounded-lg font-bold text-xs">
                        {route.stopCount}
                      </Badge>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {route.routeDistance != null ? `${route.routeDistance} km` : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {route.priceFullJourney != null
                      ? <span className="font-mono">Rs.{route.priceFullJourney}</span>
                      : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">
                    {route.averageCompletionTime != null
                      ? fmtTime(route.averageCompletionTime)
                      : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell>
                    {route.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-200 font-semibold">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10"
                        onClick={() => openEdit(route)}
                        title="Edit route"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={
                          route.isActive
                            ? "h-8 w-8 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                            : "h-8 w-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        }
                        onClick={() => handleToggleActive(route)}
                        disabled={!route._id || togglingId === route._id}
                        title={route.isActive ? "Deactivate" : "Activate"}
                      >
                        {togglingId === route._id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : route.isActive ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
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
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl"
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
            <ChevronLeft size={15} />
          </Button>
          <span className="text-sm font-bold text-slate-600">
            Page <span className="text-primary">{safePage}</span> of {totalPages}
            <span className="text-slate-400 font-normal ml-2">({filteredRoutes.length} routes)</span>
          </span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
            <ChevronRight size={15} />
          </Button>
        </div>
      )}

      {/* ─── Edit / Create Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[82vw] sm:max-w-[82vw] w-[82vw] rounded-2xl p-0 overflow-hidden max-h-[95vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
            <DialogTitle className="text-lg font-black text-slate-900">
              {editingRoute ? `Edit Route — ${editingRoute.routeNumber}` : "Add New Route"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
            <TabsList className="mx-6 mt-4 w-fit shrink-0">
              <TabsTrigger value="details" className="rounded-lg">Details</TabsTrigger>
              <TabsTrigger value="stops" className="rounded-lg" disabled={!editingRoute}>
                Stops
                {editingRoute && (stopsUp.length + stopsDown.length) > 0 && (
                  <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 rounded-md">
                    {stopsUp.length + stopsDown.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Details Tab ── */}
            <TabsContent value="details" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Route Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.routeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, routeNumber: e.target.value }))}
                    placeholder="e.g. 02"
                    className="rounded-xl h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Route Distance (km)
                  </Label>
                  <Input
                    type="number" min={0} step="0.1"
                    value={form.routeDistance}
                    onChange={(e) => setForm((f) => ({ ...f, routeDistance: e.target.value }))}
                    placeholder="e.g. 45.5"
                    className="rounded-xl h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Full Journey Price (LKR)
                  </Label>
                  <Input
                    type="number" min={0} step="1"
                    value={form.priceFullJourney}
                    onChange={(e) => setForm((f) => ({ ...f, priceFullJourney: e.target.value }))}
                    placeholder="e.g. 350"
                    className="rounded-xl h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Average Journey Time (minutes)
                  </Label>
                  <Input
                    type="number" min={0} step="1"
                    value={form.averageCompletionTime}
                    onChange={(e) => setForm((f) => ({ ...f, averageCompletionTime: e.target.value }))}
                    placeholder="e.g. 90"
                    className="rounded-xl h-10"
                  />
                  {form.averageCompletionTime && (
                    <p className="text-xs text-slate-400">
                      ≈ {fmtTime(Number(form.averageCompletionTime))}
                    </p>
                  )}
                </div>

                {editingRoute && (
                  <div className="sm:col-span-2 flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {form.isActive ? "Active" : "Inactive"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {form.isActive ? "Route is visible to users" : "Route is hidden from users"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-8">
                <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button className="rounded-xl font-bold" onClick={handleSaveDetails} disabled={saving}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : editingRoute ? "Save Changes" : "Create Route"}
                </Button>
              </div>
            </TabsContent>

            {/* ── Stops Tab ── */}
            <TabsContent value="stops" className="flex-1 min-h-0 flex flex-col px-6 pb-6 mt-4">
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {(["UP", "DOWN"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`px-5 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                        direction === d
                          ? "bg-primary text-white"
                          : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {d === "UP" ? "↑ Upward" : "↓ Downward"}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-slate-400 font-medium">
                  Up: {stopsUp.length} | Down: {stopsDown.length}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl font-bold"
                    onClick={populateReverseToOtherDirection}
                    disabled={currentStops.length === 0}
                  >
                    Populate Reverse to {direction === "UP" ? "Down" : "Up"}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-xl font-bold gap-2"
                    onClick={handleSaveStops}
                    disabled={stopsSaving}
                  >
                    {stopsSaving ? <Loader2 size={13} className="animate-spin" /> : null}
                    Save All Stops
                  </Button>
                </div>
              </div>

              {stopsLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="animate-spin text-primary opacity-40" size={28} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[260px_300px_minmax(0,1fr)] gap-4">
                  {/* Column 1: Current Up/Down stops */}
                  <div className="flex flex-col min-h-0 border border-slate-100 rounded-2xl overflow-hidden bg-white">
                    <div className="p-3 border-b border-slate-100">
                      <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Current Stops</p>
                    </div>
                    <div className="flex-1 min-h-1 grid grid-rows-2">
                      {([
                        { key: "UP" as const, label: "Upward", items: stopsUp },
                        { key: "DOWN" as const, label: "Downward", items: stopsDown },
                      ]).map((group) => (
                        <div key={group.key} className="min-h-0 border-b last:border-b-0 border-slate-100 p-2">
                          <button
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${
                              direction === group.key ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-50"
                            }`}
                            onClick={() => setDirection(group.key)}
                          >
                            {group.label} ({group.items.length})
                          </button>
                          <div className="mt-1.5 space-y-1 overflow-y-auto max-h-[25vh] pr-1">
                            {group.items.length === 0 ? (
                              <p className="text-xs text-slate-400 px-2 py-1">No stops</p>
                            ) : (
                              group.items.map((stop, i) => (
                                <div key={`${group.key}-${stop.stopId}-${i}`} className="rounded-lg border border-slate-100 px-2 py-1.5 bg-slate-50">
                                  <p className="text-[11px] font-bold text-slate-700">{i + 1}. {stop.name}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column 2: Add/Edit current direction */}
                  <div className="flex flex-col min-h-0 border border-slate-100 rounded-2xl overflow-hidden bg-white">
                    <div className="p-3 border-b border-slate-100 space-y-2">
                      <p className="text-xs font-black text-slate-600 uppercase tracking-wider">
                        Add Stop ({direction})
                      </p>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Display Order</Label>
                        <Input
                          type="number"
                          min={1}
                          max={currentStops.length + 1}
                          value={newStopOrder}
                          onChange={(e) => setNewStopOrder(e.target.value)}
                          className="rounded-xl h-8 text-sm"
                        />
                        <p className="text-[11px] text-slate-400">
                          Insert at selected order and auto re-order preview.
                        </p>
                      </div>
                    </div>
                    <div className="p-3 border-b border-slate-100" ref={stopSearchRef}>
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Search Existing Stop</Label>
                      <div className="relative mt-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <Input
                          value={stopSearch}
                          onChange={(e) => { setStopSearch(e.target.value); setStopSearchOpen(true); }}
                          onFocus={() => setStopSearchOpen(true)}
                          placeholder="Search stop..."
                          className="pl-9 rounded-xl h-9 text-sm"
                        />
                        {stopSearchOpen && stopSearchResults.length > 0 && (
                          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                            {stopSearchResults.map((s) => (
                              <button
                                key={s.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addStop(s, direction, newStopOrder);
                                  setStopSearch("");
                                  setStopSearchOpen(false);
                                  setStopSearchResults([]);
                                }}
                                disabled={currentStops.some((cs) => cs.stopId === s.id)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-primary/10 hover:text-primary transition-colors border-b border-slate-50 last:border-0 disabled:opacity-40 disabled:pointer-events-none"
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-3 border-b border-slate-100 space-y-2">
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Create New Stop Point</Label>
                      <Input
                        placeholder="Stop name"
                        value={newStopName}
                        onChange={(e) => setNewStopName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateStop(); }}
                        className="rounded-xl h-9 text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={newStopType} onValueChange={setNewStopType}>
                          <SelectTrigger className="rounded-xl h-9 text-sm">
                            <SelectValue placeholder="Stop type" />
                          </SelectTrigger>
                            <SelectContent>
                            {stopTypes.map((type) => (
                              <SelectItem key={type} value={type}>{formatConfigValue(type)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={newStopRadius} onValueChange={setNewStopRadius}>
                          <SelectTrigger className="rounded-xl h-9 text-sm">
                            <SelectValue placeholder="Geofence" />
                          </SelectTrigger>
                          <SelectContent>
                            {geofenceRadii.map((radius) => (
                              <SelectItem key={radius} value={radius}>{formatConfigValue(radius)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="sm"
                        className="w-full rounded-xl gap-1 h-9"
                        onClick={handleCreateStop}
                        disabled={!newStopName.trim() || !clickedPoint || !newStopType || !newStopRadius || creatingStop}
                      >
                        {creatingStop ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Create &amp; Add at Order
                      </Button>
                      {!clickedPoint && <p className="text-[11px] text-slate-400">Click map first to set location.</p>}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                      {currentStops.length === 0 ? (
                        <p className="text-xs text-slate-400 px-2 py-3">No {direction} stops yet.</p>
                      ) : (
                        currentStops.map((stop, i) => (
                          <div
                            key={`${stop.stopId}-${i}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, i)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, i)}
                            className="flex items-center gap-2 rounded-xl px-2 py-1.5 cursor-grab active:cursor-grabbing hover:bg-slate-50 border border-transparent hover:border-primary/20 transition-all group"
                          >
                            <span className="text-xs font-black text-primary w-5 text-center shrink-0">{i + 1}</span>
                            <span className="flex-1 text-xs text-slate-700 font-medium truncate">{stop.name}</span>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => moveStop(i, "up")} disabled={i === 0}
                                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-400 hover:text-slate-700">
                                <ArrowUp size={11} />
                              </button>
                              <button onClick={() => moveStop(i, "down")} disabled={i === currentStops.length - 1}
                                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-400 hover:text-slate-700">
                                <ArrowDown size={11} />
                              </button>
                              <button onClick={() => removeStop(i)}
                                className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Column 3: Large map and point context */}
                  <div className="min-h-0 flex flex-col gap-3">
                    <div className="flex-1 min-h-0" style={{ minHeight: 320 }}>
                      <StopsMapEditor
                        stops={currentStops}
                        clickedPoint={clickedPoint}
                        onMapClick={handleMapClick}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Stop Point Details</p>
                        {editingRoute?._id && (
                          <code className="text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                            routeId: {editingRoute._id}
                          </code>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                          <p className="font-semibold text-slate-500">Direction</p>
                          <p className="font-bold text-slate-800">{direction}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5">
                          <p className="font-semibold text-slate-500">Next Display Order</p>
                          <p className="font-bold text-slate-800">{currentStops.length + 1}</p>
                        </div>
                      </div>

                      {clickedPoint ? (
                        <div className="space-y-3">
                          <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5">
                            <p className="text-xs font-semibold text-amber-700">Clicked Point</p>
                            <p className="text-xs font-mono text-amber-800">
                              lat: {clickedPoint.lat.toFixed(6)} | lng: {clickedPoint.lng.toFixed(6)}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-slate-500">Nearby existing stops</p>
                            {loadingNearby ? (
                              <div className="text-xs text-slate-400 flex items-center gap-2">
                                <Loader2 size={12} className="animate-spin" /> Searching nearby stops...
                              </div>
                            ) : nearbyStops.length === 0 ? (
                              <p className="text-xs text-slate-400">No nearby stops found.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {nearbyStops.map((s) => {
                                  const alreadyAdded = currentStops.some((cs) => cs.stopId === s.id);
                                  return (
                                    <Button
                                      key={s.id}
                                      size="sm"
                                      variant={alreadyAdded ? "outline" : "secondary"}
                                      className="rounded-lg h-7 text-xs"
                                      disabled={alreadyAdded}
                                      onClick={() => addStop(s, direction, newStopOrder)}
                                    >
                                      {s.name}
                                    </Button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">Click anywhere on the map to place a marker and manage stop points.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
