"use client";

import { useEffect, useState } from "react";
import { Bus, Route, Clock, Wifi, Shield, LayoutDashboard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function getToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase");
  return (await auth.currentUser?.getIdToken()) || "";
}

interface Stats {
  totalBuses: number;
  totalRoutes: number;
  runningSlots: number;
  onlineDevices: number;
  totalAdmins: number;
}

const EMPTY_STATS: Stats = {
  totalBuses: 0,
  totalRoutes: 0,
  runningSlots: 0,
  onlineDevices: 0,
  totalAdmins: 0,
};

function normalizeStats(payload: any): Stats {
  const src = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    totalBuses: Number(src?.totalBuses ?? 0),
    totalRoutes: Number(src?.totalRoutes ?? 0),
    runningSlots: Number(src?.runningSlots ?? 0),
    onlineDevices: Number(src?.onlineDevices ?? 0),
    totalAdmins: Number(src?.totalAdmins ?? 0),
  };
}

const STAT_CONFIG = [
  {
    key: "totalBuses" as keyof Stats,
    label: "Total Buses",
    Icon: Bus,
    color: "bg-blue-100 text-blue-600",
    ring: "ring-blue-100",
  },
  {
    key: "totalRoutes" as keyof Stats,
    label: "Total Routes",
    Icon: Route,
    color: "bg-indigo-100 text-indigo-600",
    ring: "ring-indigo-100",
  },
  {
    key: "runningSlots" as keyof Stats,
    label: "Running Slots",
    Icon: Clock,
    color: "bg-teal-100 text-teal-600",
    ring: "ring-teal-100",
  },
  {
    key: "onlineDevices" as keyof Stats,
    label: "Online Devices",
    Icon: Wifi,
    color: "bg-green-100 text-green-600",
    ring: "ring-green-100",
  },
  {
    key: "totalAdmins" as keyof Stats,
    label: "Total Admins",
    Icon: Shield,
    color: "bg-purple-100 text-purple-600",
    ring: "ring-purple-100",
  },
];

const QUICK_ACTIONS = [
  { href: "/admin/buses", label: "Manage Buses", icon: Bus },
  { href: "/admin/routes", label: "Manage Routes", icon: Route },
  { href: "/admin/timetables", label: "Manage Timetables", icon: Clock },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        const res = await fetch(`${API_BASE}/admin/fleet/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = await res.json();
        setStats(normalizeStats(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <LayoutDashboard size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400">System overview and quick actions</p>
        </div>
      </div>

      {/* Stats grid */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
          System Stats
        </h2>
        {error ? (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 text-xs text-red-500 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {STAT_CONFIG.map(({ key, label, Icon, color }) => (
              <div
                key={key}
                className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3"
              >
                {loading ? (
                  <>
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-7 w-14 rounded-lg" />
                      <Skeleton className="h-3.5 w-20 rounded" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${color}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-slate-900">
                        {(stats?.[key] ?? EMPTY_STATS[key]).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{label}</p>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="outline" className="rounded-xl h-11 px-5 font-semibold gap-2">
              <Link href={href}>
                <Icon size={15} />
                {label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
