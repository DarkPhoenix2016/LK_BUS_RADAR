"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Clock,
  Plus,
  Search,
  Trash2,
  Bus,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchAdminConfigMap, formatConfigValue } from "@/lib/admin-configs";
import { notify } from "@/lib/notify";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

async function api(path: string, method = "GET", body?: object) {
  const token = await getToken();
  const res = await fetch(`${BASE}/admin/fleet${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/* ─── helpers (mirrored from public RouteTimetableContent) ─── */
function formatTime(raw: string | undefined | null): string {
  if (!raw || raw.length < 4) return "—";
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}
function formatBusType(busType: string | undefined | null): string {
  if (!busType) return "";
  return busType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── types ─── */
interface Route {
  id: string;
  routeNumber: string;
  startStop?: { name: string } | null;
  endStop?: { name: string } | null;
}
interface RouteBus {
  id: string;
  busNumber: string;
  seatingCapacity: number | null;
}
interface Slot {
  id: string;
  routeId: string;
  runningNumberId: string;
  direction: "UP" | "DOWN" | string;
  runningNumber: string;
  busType: string;
  busId?: string | null;
  busNumber?: string;
  maxBookableSeats?: number;
}
interface TimetableEntry {
  id: string;
  runningSlotId: string;
  deviceId?: string | null;
  isOnline?: boolean;
  runningSlot?: {
    runningDirection: string;
    runningSlotBusStops?: Array<{
      weekdayTime?: string;
      weekendTime?: string;
      busStop?: { name: string };
    }>;
    runningNumber?: { busType?: string };
  };
}
interface SlotStop {
  id: string;
  stopId: string;
  name: string;
  weekdayTime: string;
  weekendTime: string;
}
interface RouteDirectionStop {
  id: string;
  stopId: string;
  name: string;
  displayOrder: number;
}

export default function TimetablesPage() {
  /* ── routes ── */
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [routesLoading, setRoutesLoading] = useState(true);

  const [busTypes, setBusTypes] = useState<string[]>([]);

  /* ── route buses ── */
  const [routeBuses, setRouteBuses] = useState<RouteBus[]>([]);
  const [busesLoading, setBusesLoading] = useState(false);

  /* ── slots ── */
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [activeDirection, setActiveDirection] = useState<"UP" | "DOWN">("UP");
  const [saving, setSaving] = useState(false);
  const [createSlotDialog, setCreateSlotDialog] = useState(false);
  const [createSlotDirection, setCreateSlotDirection] = useState<"UP" | "DOWN">("UP");
  const [createBusType, setCreateBusType] = useState("");
  const [createBusId, setCreateBusId] = useState("none");
  const [createMaxSeats, setCreateMaxSeats] = useState<number>(10);
  const [computedMaxSeats, setComputedMaxSeats] = useState<number>(10);
  const [createTimeDraft, setCreateTimeDraft] = useState<Record<string, { weekdayTime: string; weekendTime: string }>>({});
  const [routeStopsByDirection, setRouteStopsByDirection] = useState<{ UP: RouteDirectionStop[]; DOWN: RouteDirectionStop[] }>({
    UP: [],
    DOWN: [],
  });

  /* ── timetable display data (from public endpoint) ── */
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [dateType, setDateType] = useState<"weekday" | "weekend">("weekday");

  /* ── edit slot dialog ── */
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [editStops, setEditStops] = useState<SlotStop[]>([]);
  const [editTimeDraft, setEditTimeDraft] = useState<Record<string, { weekdayTime: string; weekendTime: string }>>({});
  const [editBusDraft, setEditBusDraft] = useState("none");
  const [editMaxSeats, setEditMaxSeats] = useState<number>(10);
  const [editMaxSeatsSaving, setEditMaxSeatsSaving] = useState(false);
  const [editStopsLoading, setEditStopsLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editBusSaving, setEditBusSaving] = useState(false);

  /* ─── fetch functions ─── */
  const fetchRoutes = useCallback(async () => {
    setRoutesLoading(true);
    try {
      const rows: Route[] = [];
      let currentPage = 1;
      let lastPage = 1;

      do {
        const data = await api(`/routes?page=${currentPage}&perPage=500`);
        if (!data?.success) {
          notify.error(data?.error || "Failed to load routes.");
          setRoutes([]);
          return;
        }
        rows.push(...(data.data || []));
        lastPage = Number(data.meta?.lastPage || 1);
        currentPage += 1;
      } while (currentPage <= lastPage);

      setRoutes(rows);
    } catch {
      notify.error("Failed to load routes.");
      setRoutes([]);
    } finally {
      setRoutesLoading(false);
    }
  }, []);

  const fetchSlots = useCallback(async (routeId: string) => {
    setSlotsLoading(true);
    try {
      const rows: Slot[] = [];
      let currentPage = 1;
      let lastPage = 1;

      do {
        const data = await api(`/timetables/slots?routeId=${routeId}&page=${currentPage}&perPage=500`);
        if (!data?.success) {
          notify.error(data?.error || "Failed to load slots.");
          setSlots([]);
          return;
        }
        rows.push(...(data.data || []));
        lastPage = Number(data.meta?.lastPage || 1);
        currentPage += 1;
      } while (currentPage <= lastPage);

      setSlots(rows);
    } catch {
      notify.error("Failed to load slots.");
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const fetchRouteBuses = useCallback(async (routeId: string) => {
    setBusesLoading(true);
    try {
      const data = await api(`/timetables/route-buses?routeId=${routeId}`);
      setRouteBuses(data?.success ? data.data || [] : []);
      if (!data?.success) notify.error(data?.error || "Failed to load route buses.");
    } catch {
      notify.error("Failed to load route buses.");
      setRouteBuses([]);
    } finally {
      setBusesLoading(false);
    }
  }, []);

  const fetchRouteStops = useCallback(async (routeId: string) => {
    try {
      const data = await api(`/routes/${routeId}/stops`);
      if (!data?.success) {
        notify.error(data?.error || "Failed to load route stops.");
        setRouteStopsByDirection({ UP: [], DOWN: [] });
        return;
      }

      setRouteStopsByDirection({
        UP: data.data?.up || [],
        DOWN: data.data?.down || [],
      });
    } catch {
      notify.error("Failed to load route stops.");
      setRouteStopsByDirection({ UP: [], DOWN: [] });
    }
  }, []);

  const fetchTimetableEntries = useCallback(async (routeId: string) => {
    try {
      const res = await fetch(`${BASE}/api/public/timetable/bus-turn-running-slots/${routeId}`);
      const data = await res.json();
      setTimetableEntries(Array.isArray(data) ? data : []);
    } catch {
      setTimetableEntries([]);
    }
  }, []);

  /* ─── effects ─── */
  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  useEffect(() => {
    void (async () => {
      try {
        const map = await fetchAdminConfigMap();
        setBusTypes((map.bus_types || []).map(String));
      } catch {
        notify.error("Failed to load bus types.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedRoute) return;
    fetchSlots(selectedRoute.id);
    fetchRouteBuses(selectedRoute.id);
    fetchTimetableEntries(selectedRoute.id);
    fetchRouteStops(selectedRoute.id);
    setCreateBusId("none");
  }, [selectedRoute, fetchSlots, fetchRouteBuses, fetchTimetableEntries, fetchRouteStops]);

  /* ─── derived state ─── */
  const filteredRoutes = useMemo(() => {
    const q = routeSearch.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.routeNumber.toLowerCase().includes(q) ||
        (r.startStop?.name || "").toLowerCase().includes(q) ||
        (r.endStop?.name || "").toLowerCase().includes(q)
    );
  }, [routes, routeSearch]);

  const directionSlots = useMemo(
    () => slots.filter((s) => String(s.direction).toUpperCase() === activeDirection),
    [slots, activeDirection]
  );

  /* ─── slot creation helpers ─── */
  function calcMaxBookableSeats(buses: RouteBus[]): number {
    const capacities = buses
      .map((b) => b.seatingCapacity)
      .filter((c): c is number => typeof c === "number" && c > 0);
    if (capacities.length === 0) return 10;
    const lowest = Math.min(...capacities);
    return Math.min(10, Math.floor(lowest / 5));
  }

  function openCreateSlot(direction: "UP" | "DOWN") {
    const stops = routeStopsByDirection[direction] || [];
    const defaultBusType = busTypes.includes("ctb_bus") ? "ctb_bus" : (busTypes[0] || "");
    const draft: Record<string, { weekdayTime: string; weekendTime: string }> = {};

    stops.forEach((stop) => {
      draft[stop.stopId] = { weekdayTime: "", weekendTime: "" };
    });

    const maxAllowed = calcMaxBookableSeats(routeBuses);
    setCreateSlotDirection(direction);
    setCreateBusType(defaultBusType);
    setCreateBusId("none");
    setComputedMaxSeats(maxAllowed);
    setCreateMaxSeats(maxAllowed);
    setCreateTimeDraft(draft);
    setCreateSlotDialog(true);
  }
  /* ─── slot CRUD ─── */
  const createStops = routeStopsByDirection[createSlotDirection] || [];

  async function createSlot() {
    if (!selectedRoute) { notify.warning("Select a route."); return; }
    if (!createBusType) { notify.warning("Select a bus type."); return; }
    if (createStops.length === 0) { notify.warning("No route stops found for this direction."); return; }
    setSaving(true);
    try {
      const res = await api("/timetables/slots/create-with-stops", "POST", {
        routeId: selectedRoute.id,
        direction: createSlotDirection,
        busType: createBusType,
        busId: createBusId !== "none" ? createBusId : null,
        maxBookableSeats: createMaxSeats,
        stops: createStops.map((stop) => ({
          stopId: stop.stopId,
          weekdayTime: createTimeDraft[stop.stopId]?.weekdayTime || "",
          weekendTime: createTimeDraft[stop.stopId]?.weekendTime || "",
        })),
      });
      if (!res?.success) { notify.error(res?.error || "Failed to create slot."); return; }
      notify.success(`${createSlotDirection} slot created.`);
      await fetchSlots(selectedRoute.id);
      await fetchTimetableEntries(selectedRoute.id);
      setCreateSlotDialog(false);
    } catch {
      notify.error("Failed to create slot.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlot(slotId: string) {
    if (!confirm("Delete this slot?") || !selectedRoute) return;
    try {
      const res = await api(`/timetables/slots/${slotId}`, "DELETE");
      if (!res?.success) { notify.error(res?.error || "Failed to delete slot."); return; }
      notify.success("Slot deleted.");
      await fetchSlots(selectedRoute.id);
      await fetchTimetableEntries(selectedRoute.id);
    } catch {
      notify.error("Failed to delete slot.");
    }
  }

  /* ─── edit slot dialog ─── */
  async function openEditTimes(slot: Slot) {
    setEditSlot(slot);
    setEditBusDraft(slot.busId || "none");
    setEditMaxSeats(slot.maxBookableSeats ?? calcMaxBookableSeats(routeBuses));
    setEditStopsLoading(true);
    setEditStops([]);
    setEditTimeDraft({});
    try {
      const data = await api(`/timetables/slots/${slot.id}/stops`);
      const stops = (data.data || []) as SlotStop[];
      setEditStops(stops);
      const draft: Record<string, { weekdayTime: string; weekendTime: string }> = {};
      stops.forEach((s) => { draft[s.id] = { weekdayTime: s.weekdayTime || "", weekendTime: s.weekendTime || "" }; });
      setEditTimeDraft(draft);
    } catch {
      notify.error("Failed to load stop times.");
    } finally {
      setEditStopsLoading(false);
    }
  }

  async function saveStopTimes() {
    if (!editSlot || !selectedRoute) return;
    setEditSaving(true);
    try {
      const stops = editStops.map((s) => ({
        stopId: s.stopId,
        weekdayTime: editTimeDraft[s.id]?.weekdayTime || "",
        weekendTime: editTimeDraft[s.id]?.weekendTime || "",
      }));
      const res = await api(`/timetables/slots/${editSlot.id}/stops`, "PUT", { stops });
      if (!res?.success) { notify.error(res?.error || "Failed to save."); return; }
      notify.success("Stop times saved.");
      setEditSlot(null);
      await fetchTimetableEntries(selectedRoute.id);
    } catch {
      notify.error("Failed to save stop times.");
    } finally {
      setEditSaving(false);
    }
  }

  async function saveEditMaxSeats() {
    if (!editSlot || !selectedRoute) return;
    setEditMaxSeatsSaving(true);
    try {
      const res = await api(`/timetables/slots/${editSlot.id}`, "PUT", { maxBookableSeats: editMaxSeats });
      if (!res?.success) { notify.error(res?.error || "Failed to update seats."); return; }
      notify.success("Bookable seats updated.");
      await fetchSlots(selectedRoute.id);
      setEditSlot((prev) => prev ? { ...prev, maxBookableSeats: editMaxSeats } : prev);
    } catch {
      notify.error("Failed to update bookable seats.");
    } finally {
      setEditMaxSeatsSaving(false);
    }
  }

  async function saveEditBus() {
    if (!editSlot || !selectedRoute) return;
    setEditBusSaving(true);
    try {
      const res = await api(`/timetables/slots/${editSlot.id}`, "PUT", {
        runningNumberId: editSlot.runningNumberId,
        direction: editSlot.direction,
        busId: editBusDraft === "none" ? null : editBusDraft,
      });
      if (!res?.success) { notify.error(res?.error || "Failed to update bus."); return; }
      notify.success("Bus assignment updated.");
      await fetchSlots(selectedRoute.id);
      // Sync local editSlot
      setEditSlot((prev) => prev ? { ...prev, busId: editBusDraft === "none" ? null : editBusDraft, busNumber: routeBuses.find(b => b.id === editBusDraft)?.busNumber } : prev);
    } catch {
      notify.error("Failed to update bus.");
    } finally {
      setEditBusSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <Clock className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Timetables</h1>
          <p className="text-slate-500 text-sm">Select route, manage slots and stop times by direction</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Route List ── */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-50">
              <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Select Route</p>
              <div className="relative mt-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search routes..."
                  value={routeSearch}
                  onChange={(e) => setRouteSearch(e.target.value)}
                  className="pl-8 h-9 text-sm rounded-xl"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[68vh]">
              {routesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-300" />
                </div>
              ) : filteredRoutes.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No routes found</p>
              ) : (
                filteredRoutes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRoute(r)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-0 transition-colors ${
                      selectedRoute?.id === r.id
                        ? "bg-primary/5 border-l-2 border-l-primary"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-bold text-slate-800">{r.routeNumber}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {r.startStop?.name || "—"} → {r.endStop?.name || "—"}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Running Numbers + Timetable ── */}
        <div className="xl:col-span-2 space-y-5">
          {/* Timetable tools */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Timetable Setup</p>
              <p className="text-xs text-slate-400">Slots create their running numbers automatically.</p>
            </div>
          </div>

          {/* Timetable panel */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            {!selectedRoute ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                Select a route to view and manage UP/DOWN timetable slots.
              </div>
            ) : (
              <Tabs
                value={activeDirection}
                onValueChange={(v) => setActiveDirection(v as "UP" | "DOWN")}
                className="w-full"
              >
                {/* Tab header */}
                <div className="p-4 border-b border-slate-50">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest">
                        Route {selectedRoute.routeNumber} Timetable
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {selectedRoute.startStop?.name || "—"} → {selectedRoute.endStop?.name || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Weekday / Weekend toggle */}
                      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                        <button
                          onClick={() => setDateType("weekday")}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
                            dateType === "weekday"
                              ? "bg-white text-primary shadow-sm"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          WD
                        </button>
                        <button
                          onClick={() => setDateType("weekend")}
                          className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors ${
                            dateType === "weekend"
                              ? "bg-white text-primary shadow-sm"
                              : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          WE
                        </button>
                      </div>
                      <TabsList className="rounded-xl">
                        <TabsTrigger value="UP" className="rounded-lg gap-1">
                          <ArrowUp size={12} /> Up
                        </TabsTrigger>
                        <TabsTrigger value="DOWN" className="rounded-lg gap-1">
                          <ArrowDown size={12} /> Down
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </div>
                </div>

                <TabsContent value="UP" className="m-0">
                  <DirectionPanel
                    direction="UP"
                    slots={directionSlots}
                    slotsLoading={slotsLoading}
                    timetableEntries={timetableEntries}
                    dateType={dateType}
                    saving={saving}
                    deleteSlot={deleteSlot}
                    onEditTimes={openEditTimes}
                    onOpenCreateSlot={openCreateSlot}
                    routeBuses={routeBuses}
                  />
                </TabsContent>

                <TabsContent value="DOWN" className="m-0">
                  <DirectionPanel
                    direction="DOWN"
                    slots={directionSlots}
                    slotsLoading={slotsLoading}
                    timetableEntries={timetableEntries}
                    dateType={dateType}
                    saving={saving}
                    deleteSlot={deleteSlot}
                    onEditTimes={openEditTimes}
                    onOpenCreateSlot={openCreateSlot}
                    routeBuses={routeBuses}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>

      <Dialog open={createSlotDialog} onOpenChange={setCreateSlotDialog}>
        <DialogContent className="rounded-2xl max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create {createSlotDirection} Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Slot Type / Bus Type</Label>
                <Select value={createBusType} onValueChange={setCreateBusType}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Select bus type" />
                  </SelectTrigger>
                  <SelectContent>
                    {busTypes.map((busType) => (
                      <SelectItem key={busType} value={busType}>
                        {formatConfigValue(busType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Bus Assignment</Label>
                <Select value={createBusId} onValueChange={setCreateBusId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={busesLoading ? "Loading..." : "Select bus"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No bus assigned</SelectItem>
                    {routeBuses.map((bus) => (
                      <SelectItem key={bus.id} value={bus.id}>{bus.busNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">
                Bookable Seats
              </Label>
              <Input
                type="number"
                min={1}
                max={computedMaxSeats}
                value={createMaxSeats}
                onChange={(e) => setCreateMaxSeats(Math.max(1, Math.min(computedMaxSeats, Number(e.target.value))))}
                className="h-10 rounded-xl"
              />
              {(() => {
                const capacities = routeBuses
                  .map((b) => b.seatingCapacity)
                  .filter((c): c is number => typeof c === "number" && c > 0);
                const lowest = capacities.length > 0 ? Math.min(...capacities) : null;
                return (
                  <p className="text-[10px] text-slate-400 mt-1">
                    {lowest != null
                      ? `Lowest bus capacity on route: ${lowest} seats → max bookable = floor(${lowest} ÷ 5) = ${computedMaxSeats}`
                      : `No bus capacity data — using default max of ${computedMaxSeats}`}
                  </p>
                );
              })()}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-600">Stop Times</p>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <CalendarDays size={11} />
                  <span>WD = Weekday · WE = Weekend</span>
                </div>
              </div>
              {createStops.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                  <p className="text-sm text-slate-400">No route stops are configured for this direction.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-80 rounded-xl border border-slate-100">
                  <div className="divide-y divide-slate-50">
                    <div className="grid grid-cols-[1fr_120px_120px] gap-3 px-4 py-2 bg-slate-50 sticky top-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">WD Time</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">WE Time</span>
                    </div>
                    {createStops.map((stop) => (
                      <div key={stop.stopId} className="grid grid-cols-[1fr_120px_120px] gap-3 items-center px-4 py-2 hover:bg-slate-50/60 transition-colors">
                        <span className="text-sm text-slate-700 truncate">{stop.name || stop.stopId}</span>
                        <Input
                          value={createTimeDraft[stop.stopId]?.weekdayTime || ""}
                          onChange={(e) =>
                            setCreateTimeDraft((draft) => ({
                              ...draft,
                              [stop.stopId]: { ...draft[stop.stopId], weekdayTime: e.target.value },
                            }))
                          }
                          placeholder="HHMM"
                          maxLength={4}
                          className="h-8 text-center font-mono rounded-lg text-sm"
                        />
                        <Input
                          value={createTimeDraft[stop.stopId]?.weekendTime || ""}
                          onChange={(e) =>
                            setCreateTimeDraft((draft) => ({
                              ...draft,
                              [stop.stopId]: { ...draft[stop.stopId], weekendTime: e.target.value },
                            }))
                          }
                          placeholder="HHMM"
                          maxLength={4}
                          className="h-8 text-center font-mono rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSlotDialog(false)} className="rounded-xl">Cancel</Button>
            <Button onClick={createSlot} disabled={saving || createStops.length === 0} className="rounded-xl">
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Save Slot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Slot Times Dialog ── */}
      <Dialog open={!!editSlot} onOpenChange={(open) => { if (!open) setEditSlot(null); }}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock size={16} className="text-primary" />
              Edit Slot — #{editSlot?.runningNumber}
              <span className="text-xs font-normal text-slate-400 ml-1">
                {editSlot?.direction} · {formatBusType(editSlot?.busType)}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Bookable Seats */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-600">Bookable Seats</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={computedMaxSeats}
                  value={editMaxSeats}
                  onChange={(e) => setEditMaxSeats(Math.max(1, Math.min(computedMaxSeats, Number(e.target.value))))}
                  className="h-10 rounded-xl bg-white w-28"
                />
                <Button onClick={saveEditMaxSeats} disabled={editMaxSeatsSaving} className="rounded-xl shrink-0">
                  {editMaxSeatsSaving ? <Loader2 size={14} className="animate-spin" /> : "Update"}
                </Button>
                <span className="text-[10px] text-slate-400">max {computedMaxSeats}</span>
              </div>
            </div>

            {/* Bus Assignment */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-600">Bus Assignment</p>
              <div className="flex items-center gap-3">
                <Select value={editBusDraft} onValueChange={setEditBusDraft}>
                  <SelectTrigger className="rounded-xl bg-white flex-1">
                    <SelectValue placeholder="Select bus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No bus assigned</SelectItem>
                    {routeBuses.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <Bus size={12} /> {b.busNumber}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={saveEditBus} disabled={editBusSaving} className="rounded-xl shrink-0">
                  {editBusSaving ? <Loader2 size={14} className="animate-spin" /> : "Update Bus"}
                </Button>
              </div>
              {editSlot?.busNumber && (
                <p className="text-[11px] text-slate-400">
                  Currently assigned: <span className="font-bold text-slate-600">{editSlot.busNumber}</span>
                </p>
              )}
            </div>

            {/* Stop Times */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest text-slate-600">Stop Times</p>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <CalendarDays size={11} />
                  <span>WD = Weekday · WE = Weekend</span>
                </div>
              </div>

              {editStopsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-slate-300" />
                </div>
              ) : editStops.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                  <p className="text-sm text-slate-400">No stop times configured for this slot.</p>
                  <p className="text-xs text-slate-300 mt-1">Stop times are populated via the sync service.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-72 rounded-xl border border-slate-100">
                  <div className="divide-y divide-slate-50">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_120px_120px] gap-3 px-4 py-2 bg-slate-50 sticky top-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stop</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">WD Time</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">WE Time</span>
                    </div>
                    {editStops.map((stop) => (
                      <div key={stop.id} className="grid grid-cols-[1fr_120px_120px] gap-3 items-center px-4 py-2 hover:bg-slate-50/60 transition-colors">
                        <span className="text-sm text-slate-700 truncate">{stop.name || stop.stopId}</span>
                        <Input
                          value={editTimeDraft[stop.id]?.weekdayTime || ""}
                          onChange={(e) =>
                            setEditTimeDraft((d) => ({
                              ...d,
                              [stop.id]: { ...d[stop.id], weekdayTime: e.target.value },
                            }))
                          }
                          placeholder="HHMM"
                          maxLength={4}
                          className="h-8 text-center font-mono rounded-lg text-sm"
                        />
                        <Input
                          value={editTimeDraft[stop.id]?.weekendTime || ""}
                          onChange={(e) =>
                            setEditTimeDraft((d) => ({
                              ...d,
                              [stop.id]: { ...d[stop.id], weekendTime: e.target.value },
                            }))
                          }
                          placeholder="HHMM"
                          maxLength={4}
                          className="h-8 text-center font-mono rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSlot(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={saveStopTimes}
              disabled={editSaving || editStops.length === 0}
              className="rounded-xl"
            >
              {editSaving ? <Loader2 size={14} className="animate-spin" /> : "Save Stop Times"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── DirectionPanel ─── */
function DirectionPanel({
  direction,
  slots,
  slotsLoading,
  timetableEntries,
  dateType,
  saving,
  deleteSlot,
  onEditTimes,
  onOpenCreateSlot,
  routeBuses,
}: {
  direction: "UP" | "DOWN";
  slots: Slot[];
  slotsLoading: boolean;
  timetableEntries: TimetableEntry[];
  dateType: "weekday" | "weekend";
  saving: boolean;
  deleteSlot: (slotId: string) => Promise<void>;
  onEditTimes: (slot: Slot) => void;
  onOpenCreateSlot: (direction: "UP" | "DOWN") => void;
  routeBuses: RouteBus[];
}) {
  const timeKey = dateType === "weekend" ? "weekendTime" : "weekdayTime";

  return (
    <div className="space-y-0">
      {/* Create slot form */}
      <div className="p-4 border-b border-slate-50 bg-slate-50/60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Add New {direction} Slot
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Create a slot with bus type, optional bus assignment, and full stop times.
            </p>
          </div>
          <Button className="rounded-xl" onClick={() => onOpenCreateSlot(direction)} disabled={saving}>
            <Plus size={14} className="mr-1" />
            Create
          </Button>
        </div>
      </div>

      {/* Slot list */}
      {slotsLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : slots.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">No {direction} slots yet.</p>
      ) : (
        <div className="divide-y divide-slate-50">
          {slots.map((slot) => {
            // Find matching public timetable entry for time display
            const entry = timetableEntries.find((e) => e.runningSlotId === slot.id);
            const stops = entry?.runningSlot?.runningSlotBusStops ?? [];
            const firstStop = stops[0];
            const lastStop = stops.at(-1);
            const depTime = formatTime((firstStop as any)?.[timeKey]);
            const arrTime = formatTime((lastStop as any)?.[timeKey]);
            const isOnline = entry?.isOnline;

            return (
              <div
                key={slot.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/70 transition-colors group"
              >
                {/* Online indicator */}
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline ? "bg-emerald-400" : "bg-slate-200"
                  }`}
                />

                {/* Time + labels */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-slate-900 font-mono tabular-nums">
                      {depTime}
                    </span>
                    <ArrowRight size={12} className="text-slate-300" />
                    <span className="text-sm font-bold text-slate-500 font-mono tabular-nums">
                      {arrTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {slot.busType && (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {formatBusType(slot.busType)}
                      </p>
                    )}
                    {slot.busNumber && (
                      <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 tracking-wider">
                        {slot.busNumber}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-300 font-mono">#{slot.runningNumber}</span>
                    <span className="text-[10px] font-bold bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded-md">
                      {slot.maxBookableSeats ?? 10} seats
                    </span>
                  </div>
                </div>

                {/* Live badge */}
                {isOnline && (
                  <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">
                    Live
                  </span>
                )}

                {/* Action buttons — visible on hover */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-primary"
                    title="Edit stop times & bus"
                    onClick={() => onEditTimes(slot)}
                  >
                    <Clock size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-300 hover:text-red-500"
                    title="Delete slot"
                    onClick={() => deleteSlot(slot.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
