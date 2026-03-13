"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string;
  nic: string;
  createdAt?: string;
}

interface Meta {
  total: number;
  page: number;
  perPage: number;
  lastPage: number;
}

type SortKey = "name" | "email" | "phone" | "nic";
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

const emptyForm = { name: "", email: "", phone: "", nic: "" };

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, perPage: 20, lastPage: 1 });
  const [totalOwnersGlobal, setTotalOwnersGlobal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [globalSearch, setGlobalSearch] = useState("");
  const [page, setPage] = useState(1);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchOwners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: "20",
        search: globalSearch,
      });
      const data = await api(`/owners?${params.toString()}`);
      if (data?.success === false) {
        notify.error(data?.error || "Failed to load owners.");
        return;
      }
      const raw: Owner[] = data.owners ?? data.data ?? [];
      const sorted = [...raw].sort((a, b) => {
        const av = (a[sortKey] ?? "").toLowerCase();
        const bv = (b[sortKey] ?? "").toLowerCase();
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
      setOwners(sorted);
      setMeta(
        data.meta ?? {
          total: raw.length,
          page,
          perPage: 20,
          lastPage: Math.ceil(raw.length / 20) || 1,
        }
      );
    } catch {
      notify.error("Failed to load owners.");
    } finally {
      setLoading(false);
    }
  }, [page, globalSearch, sortKey, sortDir]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api("/owners?page=1&perPage=1");
        setTotalOwnersGlobal(Number(data?.meta?.total || 0));
      } catch {
        setTotalOwnersGlobal(0);
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

  function openCreate() {
    setEditingOwner(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(owner: Owner) {
    setEditingOwner(owner);
    setForm({ name: owner.name, email: owner.email, phone: owner.phone, nic: owner.nic });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.nic.trim()) {
      notify.warning("All fields are mandatory (Name, Email, Phone, NIC).");
      return;
    }
    setSaving(true);
    try {
      if (editingOwner) {
        const res = await api(`/owners/${editingOwner.id}`, "PUT", form);
        if (!res?.success) {
          notify.error(res?.error || "Failed to save owner.");
          return;
        }
        notify.success("Owner updated successfully.");
      } else {
        const res = await api("/owners", "POST", form);
        if (!res?.success) {
          notify.error(res?.error || "Failed to save owner.");
          return;
        }
        notify.success("Owner created successfully.");
      }
      setDialogOpen(false);
      fetchOwners();
    } catch {
      notify.error("Failed to save owner.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(owner: Owner) {
    if (!window.confirm(`Delete owner "${owner.name}"? This cannot be undone.`)) return;
    try {
      const res = await api(`/owners/${owner.id}`, "DELETE");
      if (!res?.success) {
        notify.error(res?.error || "Failed to delete owner.");
        return;
      }
      notify.success("Owner deleted.");
      fetchOwners();
    } catch {
      notify.error("Failed to delete owner.");
    }
  }

  function formatDate(str?: string) {
    if (!str) return "—";
    try {
      return new Date(str).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return str;
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <Users className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Bus Owners</h1>
            <p className="text-slate-500 font-medium text-sm">
              {meta.total} owner{meta.total !== 1 ? "s" : ""} registered
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="rounded-xl gap-2 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" />
          Add Owner
        </Button>
      </div>

      {/* Insight counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Owners", value: totalOwnersGlobal, color: "text-blue-600" },
          { label: "Search Results", value: meta.total, color: "text-violet-600" },
          { label: "With Email", value: owners.filter((o) => Boolean(o.email)).length, color: "text-emerald-600" },
          { label: "With Phone", value: owners.filter((o) => Boolean(o.phone)).length, color: "text-amber-600" },
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
          placeholder="Search owners..."
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
        ) : owners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <Users className="w-10 h-10 opacity-30" />
            <p className="text-sm font-bold uppercase tracking-widest italic">No owners found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="pl-6 text-xs font-black uppercase tracking-wider text-slate-400">
                  ID
                </TableHead>
                {(
                  [
                    { key: "name" as SortKey, label: "Name" },
                    { key: "email" as SortKey, label: "Email" },
                    { key: "phone" as SortKey, label: "Phone" },
                    { key: "nic" as SortKey, label: "NIC" },
                  ] as { key: SortKey; label: string }[]
                ).map(({ key, label }) => (
                  <TableHead
                    key={key}
                    className="text-xs font-black uppercase tracking-wider text-slate-400"
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
                <TableHead className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Created At
                </TableHead>
                <TableHead className="text-xs font-black uppercase tracking-wider text-slate-400 pr-6 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.id} className="hover:bg-slate-50/60">
                  <TableCell className="pl-6">
                    <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                      {owner.id.slice(0, 8)}...
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-900">{owner.name}</span>
                  </TableCell>
                  <TableCell className="text-slate-600">{owner.email || "—"}</TableCell>
                  <TableCell className="text-slate-600">{owner.phone || "—"}</TableCell>
                  <TableCell className="text-slate-600 font-mono text-xs">{owner.nic || "—"}</TableCell>
                  <TableCell className="text-slate-500 text-xs">{formatDate(owner.createdAt)}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-slate-200 hover:border-primary/40 hover:text-primary"
                        onClick={() => openEdit(owner)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg border-slate-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50"
                        onClick={() => handleDelete(owner)}
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
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900">
              {editingOwner ? "Edit Owner" : "Add Owner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Email <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Phone <span className="text-red-500">*</span>
              </label>
              <Input
                type="tel"
                placeholder="Phone number"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                NIC <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="National ID number"
                value={form.nic}
                onChange={(e) => setForm((f) => ({ ...f, nic: e.target.value }))}
                className="rounded-xl"
              />
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
              {editingOwner ? "Save Changes" : "Create Owner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
