"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Phone, Search, ChevronDown, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken() {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

interface Contact {
  _id: string;
  location: string;
  district: string;
  phoneNumber: string;
}

type FormMode = "create" | "edit";
type SortKey = "location" | "district" | "phoneNumber";
type SortDir = "asc" | "desc";

const PER_PAGE = 20;

const EMPTY_FORM = { location: "", district: "", phoneNumber: "", customDistrict: "" };

export default function AdminBusStandsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDistrict, setFilterDistrict] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("district");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [useCustomDistrict, setUseCustomDistrict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { setPage(1); }, [filterDistrict, filterSearch]);

  async function loadAll() {
    setLoading(true);
    const token = await getToken();
    const [cRes, dRes] = await Promise.all([
      fetch(`${API_BASE}/admin/fleet/bus-stands`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/admin/fleet/bus-stands/districts`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const [cJson, dJson] = await Promise.all([cRes.json(), dRes.json()]);
    if (cJson.success) setContacts(cJson.data || []);
    if (dJson.success) setDistricts(dJson.data || []);
    setLoading(false);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setUseCustomDistrict(false);
    setFormMode("create");
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(c: Contact) {
    setForm({ location: c.location, district: c.district, phoneNumber: c.phoneNumber, customDistrict: "" });
    setUseCustomDistrict(false);
    setFormMode("edit");
    setEditId(c._id);
    setDialogOpen(true);
  }

  async function handleSave() {
    const district = useCustomDistrict
      ? form.customDistrict.trim().toUpperCase()
      : form.district.trim().toUpperCase();

    if (!form.location.trim() || !district || !form.phoneNumber.trim()) {
      notify.warning("All fields are required.");
      return;
    }

    setSaving(true);
    const token = await getToken();
    const url = formMode === "create"
      ? `${API_BASE}/admin/fleet/bus-stands`
      : `${API_BASE}/admin/fleet/bus-stands/${editId}`;
    const method = formMode === "create" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ location: form.location.trim(), district, phoneNumber: form.phoneNumber.trim() }),
    });
    const json = await res.json();

    if (json.success) {
      notify.success(formMode === "create" ? "Contact created." : "Contact updated.");
      setDialogOpen(false);
      loadAll();
    } else {
      notify.error(json.error || "Save failed.");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    const token = await getToken();
    const res = await fetch(`${API_BASE}/admin/fleet/bus-stands/${deleteConfirm._id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) {
      notify.success("Contact deleted.");
      setDeleteConfirm(null);
      loadAll();
    } else {
      notify.error(json.error || "Delete failed.");
    }
    setDeleting(false);
  }

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
    setPage(1);
  }

  const filtered = contacts
    .filter((c) => {
      if (filterDistrict && c.district !== filterDistrict) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        if (!c.location.toLowerCase().includes(q) && !c.district.toLowerCase().includes(q) && !c.phoneNumber.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey].toLowerCase();
      const bv = b[sortKey].toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th className="text-left px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-500">
        <button onClick={() => handleSort(col)} className="flex items-center gap-1 hover:text-primary transition-colors group">
          {label}
          {active ? sortDir === "asc" ? <ArrowUp size={11} className="text-primary" /> : <ArrowDown size={11} className="text-primary" />
            : <ArrowUpDown size={11} className="text-slate-300 group-hover:text-slate-400" />}
        </button>
      </th>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Bus Stand Contacts</h1>
          <p className="text-slate-500 text-sm mt-1">{contacts.length} contacts · {districts.length} districts</p>
        </div>
        <Button className="rounded-xl font-bold" onClick={openCreate}>
          <Plus size={15} className="mr-2" /> Add Contact
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setDistrictDropdownOpen((v) => !v)}
            className="flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 min-w-[180px] justify-between"
          >
            <span className="truncate">{filterDistrict || "All Districts"}</span>
            <ChevronDown size={13} className={cn("transition-transform", districtDropdownOpen && "rotate-180")} />
          </button>
          {districtDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl min-w-[200px] max-h-60 overflow-y-auto">
              <button onClick={() => { setFilterDistrict(""); setDistrictDropdownOpen(false); }} className={cn("w-full text-left px-3 py-2 text-sm hover:bg-slate-50 font-semibold", !filterDistrict && "text-primary")}>All Districts</button>
              {districts.map((d) => (
                <button key={d} onClick={() => { setFilterDistrict(d); setDistrictDropdownOpen(false); }} className={cn("w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-t border-slate-50 font-semibold", filterDistrict === d && "text-primary font-bold")}>{d}</button>
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search by location..." className="pl-9 h-10 rounded-xl text-sm" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary opacity-30" size={32} /></div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center"><Phone size={32} className="mx-auto text-slate-200 mb-3" /><p className="text-slate-400 text-sm">No contacts found</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <SortTh label="Location" col="location" />
                <SortTh label="District" col="district" />
                <SortTh label="Phone" col="phoneNumber" />
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((c) => (
                <tr key={c._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-900">{c.location}</td>
                  <td className="px-5 py-3 text-slate-500 font-mono text-xs">{c.district}</td>
                  <td className="px-5 py-3 font-mono text-slate-700">{c.phoneNumber}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0" onClick={() => openEdit(c)}>
                        <Pencil size={13} />
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg h-8 w-8 p-0 border-red-100 text-red-500 hover:bg-red-50" onClick={() => setDeleteConfirm(c)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            Page {safePage} of {totalPages} · {filtered.length} contacts
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">{formMode === "create" ? "Add Bus Stand Contact" : "Edit Contact"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Location Name</Label>
              <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Ambalangoda" className="h-11 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">District</Label>
              {!useCustomDistrict ? (
                <div className="space-y-2">
                  <select
                    value={form.district}
                    onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Select district...</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button onClick={() => setUseCustomDistrict(true)} className="text-xs font-bold text-primary underline">
                    + Add new district
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={form.customDistrict}
                    onChange={(e) => setForm((p) => ({ ...p, customDistrict: e.target.value.toUpperCase() }))}
                    placeholder="e.g. GALLE DISTRICT"
                    className="h-11 rounded-xl font-mono uppercase"
                  />
                  <p className="text-[10px] text-slate-400">Will be saved in full caps automatically.</p>
                  {districts.length > 0 && (
                    <button onClick={() => setUseCustomDistrict(false)} className="text-xs font-bold text-slate-500 underline">
                      Choose existing district
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Phone Number</Label>
              <Input value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} placeholder="e.g. 0912256700" className="h-11 rounded-xl font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button className="rounded-xl font-bold" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin mr-2" /> : null}
              {formMode === "create" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Delete Contact</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <span className="font-bold text-slate-900">{deleteConfirm?.location}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button className="rounded-xl font-bold bg-red-500 hover:bg-red-600" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 size={15} className="animate-spin mr-2" /> : <Trash2 size={14} className="mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
