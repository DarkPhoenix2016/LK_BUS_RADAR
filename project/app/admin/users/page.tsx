"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Users, Shield, Search, ArrowUpDown, ArrowUp, ArrowDown,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

interface User {
  _id?: string;
  email: string;
  displayName?: string;
  role: "admin" | "user";
}

interface Counts { admin: number; user: number; total: number; }

type RoleTab = "all" | "admin" | "user";
type SortKey = "email" | "displayName" | "role";
type SortDir = "asc" | "desc";

const PER_PAGE = 20;

function SortHead({ label, col, sortKey, sortDir, onSort }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (col: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider">
      <button onClick={() => onSort(col)} className="flex items-center gap-1 hover:text-primary transition-colors group">
        {label}
        {active
          ? sortDir === "asc" ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
          : <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400" />}
      </button>
    </TableHead>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [counts, setCounts] = useState<Counts>({ admin: 0, user: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("email");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (roleTab !== "all") params.set("role", roleTab);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`${API_BASE}/admin/fleet/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const json = await res.json();
      const data: User[] = (json.data || []).map((u: any) => ({
        _id: u._id ? String(u._id) : undefined,
        email: String(u.email ?? ""),
        displayName: u.displayName || undefined,
        role: u.role === "admin" ? "admin" : "user",
      }));
      setUsers(data);
      setTotal(json.meta?.total ?? data.length);
      setLastPage(json.meta?.lastPage ?? 1);
      if (json.counts) setCounts(json.counts);
    } catch (err) {
      notify.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [page, roleTab, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Reset page when tab or search changes
  useEffect(() => { setPage(1); }, [roleTab]);

  function handleSort(col: SortKey) {
    if (sortKey === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir("asc"); }
  }

  const sortedUsers = [...users].sort((a, b) => {
    const av = (sortKey === "role" ? a.role : sortKey === "displayName" ? (a.displayName || "") : a.email).toLowerCase();
    const bv = (sortKey === "role" ? b.role : sortKey === "displayName" ? (b.displayName || "") : b.email).toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  async function handleRoleChange(userId: string, role: string) {
    try {
      setUpdatingId(userId);
      const token = await getToken();
      const res = await fetch(`${API_BASE}/admin/fleet/users/${userId}/role`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed");
      setUsers((prev) => prev.map((u) => u._id === userId ? { ...u, role: role as "admin" | "user" } : u));
      setCounts((prev) => {
        const wasAdmin = prev.admin > 0 && users.find(u => u._id === userId)?.role === "admin";
        const delta = role === "admin" ? 1 : -1;
        return { ...prev, admin: prev.admin + (wasAdmin ? -1 : role === "admin" ? 1 : 0), user: prev.user + (wasAdmin ? 1 : role === "user" ? 1 : 0) };
      });
      notify.success("Role updated.");
    } catch {
      notify.error("Failed to update role.");
    } finally {
      setUpdatingId(null);
    }
  }

  const TABS: { key: RoleTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "admin", label: "Admins", count: counts.admin },
    { key: "user", label: "Users", count: counts.user },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <Users size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Users</h1>
          <p className="text-sm text-slate-400">Manage user accounts and roles</p>
        </div>
      </div>

      {/* Tabs + Search row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        {/* Role tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setRoleTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                roleTab === tab.key
                  ? "bg-white text-primary shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.key === "admin" && <Shield size={13} />}
              {tab.key === "user" && <Users size={13} />}
              {tab.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                roleTab === tab.key ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-400"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9 rounded-xl h-10"
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <SortHead label="Email" col="email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Display Name" col="displayName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortHead label="Role" col="role" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <TableHead className="font-black text-slate-600 text-xs uppercase tracking-wider text-right">
                  Change Role
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-400 py-12 text-sm">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                sortedUsers.map((user, i) => (
                  <TableRow key={user._id || `${user.email}-${i}`} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium text-slate-800 text-sm">{user.email}</TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {user.displayName || <span className="italic text-slate-300">—</span>}
                    </TableCell>
                    <TableCell>
                      {user.role === "admin" ? (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1 border">
                          <Shield size={10} /> Admin
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-slate-500">User</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {updatingId === user._id ? (
                        <Loader2 size={16} className="animate-spin text-slate-400 ml-auto" />
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(val) => user._id && handleRoleChange(user._id, val)}
                        >
                          <SelectTrigger size="sm" className="w-28 rounded-xl ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {!loading && lastPage > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {page} of {lastPage} · {total} total
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1" disabled={page <= 1} onClick={() => setPage(1)}>
              <ChevronLeft size={14} /><ChevronLeft size={14} className="-ml-2" />
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1" disabled={page >= lastPage} onClick={() => setPage(lastPage)}>
              <ChevronRight size={14} /><ChevronRight size={14} className="-ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
