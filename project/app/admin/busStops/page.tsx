"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAdminConfigMap, formatConfigValue, type AdminConfigMap } from "@/lib/admin-configs";
import { notify } from "@/lib/notify";
import dynamic from "next/dynamic";

const BusStopLocationPicker = dynamic(() => import("./BusStopLocationPicker"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full min-h-72 bg-slate-50 rounded-xl border border-slate-200">
      <Loader2 className="animate-spin text-primary" size={24} />
    </div>
  ),
});

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

interface BusStopRecord {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  type?: string;
  geoFenceRadius?: number | null;
}

interface BusStopForm {
  name: string;
  latitude: string;
  longitude: string;
  type: string;
  geoFenceRadius: string;
}

const EMPTY_FORM: BusStopForm = {
  name: "",
  latitude: "",
  longitude: "",
  type: "",
  geoFenceRadius: "",
};

export default function AdminBusStopsPage() {
  const [allStops, setAllStops] = useState<BusStopRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStop, setEditingStop] = useState<BusStopRecord | null>(null);
  const [form, setForm] = useState<BusStopForm>(EMPTY_FORM);
  const [configMap, setConfigMap] = useState<AdminConfigMap>({});

  const stopTypes = (configMap.stop_types || []).map(String);
  const geofenceRadii = (configMap.geofence_radius || []).map((value) => String(value));

  const fetchStops = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch("/bus-stops?limit=5000");
      setAllStops(json?.success ? json.data || [] : []);
      if (!json?.success) notify.error(json?.error || "Failed to load bus stops.");
    } catch {
      notify.error("Failed to load bus stops.");
      setAllStops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  useEffect(() => {
    void (async () => {
      try {
        const map = await fetchAdminConfigMap();
        setConfigMap(map);
      } catch {
        notify.error("Failed to load config values.");
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const filteredStops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStops;
    return allStops.filter((stop) =>
      stop.name.toLowerCase().includes(q) ||
      String(stop.type || "").toLowerCase().includes(q) ||
      String(stop.geoFenceRadius ?? "").includes(q) ||
      String(stop.latitude ?? "").includes(q) ||
      String(stop.longitude ?? "").includes(q)
    );
  }, [allStops, search]);

  const PER_PAGE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredStops.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredStops.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function openCreate() {
    setEditingStop(null);
    setForm({
      ...EMPTY_FORM,
      type: stopTypes[0] || "",
      geoFenceRadius: geofenceRadii[0] || "",
    });
    setDialogOpen(true);
  }

  function openEdit(stop: BusStopRecord) {
    setEditingStop(stop);
    setForm({
      name: stop.name,
      latitude: stop.latitude != null ? String(stop.latitude) : "",
      longitude: stop.longitude != null ? String(stop.longitude) : "",
      type: stop.type || stopTypes[0] || "",
      geoFenceRadius: stop.geoFenceRadius != null ? String(stop.geoFenceRadius) : geofenceRadii[0] || "",
    });
    setDialogOpen(true);
  }

  const selectedPoint =
    form.latitude && form.longitude
      ? { lat: Number(form.latitude), lng: Number(form.longitude) }
      : null;

  const selectedRadius = Number(form.geoFenceRadius || 0);

  function handleMapPick(lat: number, lng: number) {
    setForm((current) => ({
      ...current,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      notify.warning("Stop name is required.");
      return;
    }
    if (!form.type) {
      notify.warning("Stop type is required.");
      return;
    }
    if (!form.geoFenceRadius) {
      notify.warning("Geofence radius is required.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        type: form.type,
        geoFenceRadius: Number(form.geoFenceRadius),
      };

      const json = editingStop
        ? await apiFetch(`/bus-stops/${editingStop.id}`, "PUT", body)
        : await apiFetch("/bus-stops", "POST", body);

      if (!json?.success) {
        notify.error(json?.error || "Failed to save bus stop.");
        return;
      }

      setDialogOpen(false);
      await fetchStops();
      notify.success(editingStop ? "Bus stop updated." : "Bus stop created.");
    } catch {
      notify.error("Failed to save bus stop.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(stop: BusStopRecord) {
    if (!confirm(`Delete bus stop "${stop.name}"?`)) return;
    try {
      const json = await apiFetch(`/bus-stops/${stop.id}`, "DELETE");
      if (!json?.success) {
        notify.error(json?.error || "Failed to delete bus stop.");
        return;
      }
      await fetchStops();
      notify.success("Bus stop deleted.");
    } catch {
      notify.error("Failed to delete bus stop.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2.5 rounded-xl shadow-lg shadow-primary/20">
            <MapPin className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Bus Stops</h1>
            <p className="text-sm text-slate-500">Create, update, and manage bus stop records</p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2 font-bold">
          <Plus size={16} /> Add Bus Stop
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Stops</p>
          <p className="text-2xl font-black mt-1 text-blue-600">{loading ? "—" : allStops.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visible Results</p>
          <p className="text-2xl font-black mt-1 text-emerald-600">{loading ? "—" : filteredStops.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stop Types</p>
          <p className="text-2xl font-black mt-1 text-violet-600">{stopTypes.length}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Radius Options</p>
          <p className="text-2xl font-black mt-1 text-amber-600">{geofenceRadii.length}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bus stops..."
          className="pl-9 rounded-xl h-10"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary opacity-20" />
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <MapPin size={32} className="text-slate-200" />
            <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No bus stops found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Name</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Type</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Geofence</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Latitude</TableHead>
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">Longitude</TableHead>
                <TableHead className="text-right pr-4 font-black text-slate-600 text-xs uppercase tracking-wider">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((stop) => (
                <TableRow key={stop.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-bold text-slate-800">{stop.name}</TableCell>
                  <TableCell className="text-slate-600">
                    {stop.type ? formatConfigValue(stop.type) : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {stop.geoFenceRadius != null ? `${stop.geoFenceRadius} m` : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">
                    {stop.latitude != null ? stop.latitude.toFixed(6) : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">
                    {stop.longitude != null ? stop.longitude.toFixed(6) : <span className="text-slate-300">—</span>}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:text-primary hover:bg-primary/10"
                        onClick={() => openEdit(stop)}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(stop)}
                      >
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

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft size={15} />
          </Button>
          <span className="text-sm font-bold text-slate-600">
            Page <span className="text-primary">{safePage}</span> of {totalPages}
            <span className="text-slate-400 font-normal ml-2">({filteredStops.length} stops)</span>
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-slate-900">
              {editingStop ? "Edit Bus Stop" : "Add New Bus Stop"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5 py-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Stop Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                  placeholder="e.g. Central Bus Stand"
                  className="rounded-xl h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Stop Type *</Label>
                  <Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value }))}>
                    <SelectTrigger className="rounded-xl h-10">
                      <SelectValue placeholder="Select stop type" />
                    </SelectTrigger>
                    <SelectContent>
                      {stopTypes.map((type) => (
                        <SelectItem key={type} value={type}>{formatConfigValue(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Geofence Radius *</Label>
                  <Select
                    value={form.geoFenceRadius}
                    onValueChange={(value) => setForm((current) => ({ ...current, geoFenceRadius: value }))}
                  >
                    <SelectTrigger className="rounded-xl h-10">
                      <SelectValue placeholder="Select radius" />
                    </SelectTrigger>
                    <SelectContent>
                      {geofenceRadii.map((radius) => (
                        <SelectItem key={radius} value={radius}>{formatConfigValue(radius)} m</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Latitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={form.latitude}
                    onChange={(e) => setForm((current) => ({ ...current, latitude: e.target.value }))}
                    placeholder="e.g. 6.927079"
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Longitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={form.longitude}
                    onChange={(e) => setForm((current) => ({ ...current, longitude: e.target.value }))}
                    placeholder="e.g. 79.861244"
                    className="rounded-xl h-10"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-500 space-y-1">
                <p className="font-bold text-slate-700">Map Picker</p>
                <p>Click on the map to set the stop coordinates.</p>
                <p>The selected geofence radius is drawn live around the marker.</p>
              </div>
            </div>

            <div className="min-h-72 h-[420px]">
              <BusStopLocationPicker
                selectedPoint={selectedPoint}
                radius={Number.isFinite(selectedRadius) ? selectedRadius : 0}
                onMapClick={handleMapPick}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="rounded-xl font-bold" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : editingStop ? "Save Changes" : "Create Bus Stop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
