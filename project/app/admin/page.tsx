"use client";

import { useEffect, useState } from "react";
import {
  Bus, Route, Clock, Wifi, Shield, LayoutDashboard,
  Navigation, DollarSign, ReceiptText, Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

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
  bookings: { draft: number; confirmed: number; cancelled: number; completed: number };
  journeys: { active: number; completed: number; cancelled: number };
  totalRevenue: number;
}

interface JourneyStats {
  totalToday: number;
  activeJourneys: number;
  revenueToday: number;
  avgStopsPerJourney: number;
  topRoutes: { routeId: string; routeNumber: string; count: number }[];
}

const EMPTY_STATS: Stats = {
  totalBuses: 0, totalRoutes: 0, runningSlots: 0, onlineDevices: 0, totalAdmins: 0,
  bookings: { draft: 0, confirmed: 0, cancelled: 0, completed: 0 },
  journeys: { active: 0, completed: 0, cancelled: 0 },
  totalRevenue: 0,
};

function normalizeStats(payload: any): Stats {
  const src = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    totalBuses: Number(src?.totalBuses ?? 0),
    totalRoutes: Number(src?.totalRoutes ?? 0),
    runningSlots: Number(src?.runningSlots ?? 0),
    onlineDevices: Number(src?.onlineDevices ?? 0),
    totalAdmins: Number(src?.totalAdmins ?? 0),
    bookings: {
      draft: Number(src?.bookings?.draft ?? 0),
      confirmed: Number(src?.bookings?.confirmed ?? 0),
      cancelled: Number(src?.bookings?.cancelled ?? 0),
      completed: Number(src?.bookings?.completed ?? 0),
    },
    journeys: {
      active: Number(src?.journeys?.active ?? 0),
      completed: Number(src?.journeys?.completed ?? 0),
      cancelled: Number(src?.journeys?.cancelled ?? 0),
    },
    totalRevenue: Number(src?.totalRevenue ?? 0),
  };
}

const FLEET_STAT_CONFIG = [
  { key: "totalBuses" as keyof Stats, label: "Total Buses", Icon: Bus, color: "bg-blue-100 text-blue-600" },
  { key: "totalRoutes" as keyof Stats, label: "Total Routes", Icon: Route, color: "bg-indigo-100 text-indigo-600" },
  { key: "runningSlots" as keyof Stats, label: "Running Slots", Icon: Clock, color: "bg-teal-100 text-teal-600" },
  { key: "onlineDevices" as keyof Stats, label: "Online Devices", Icon: Wifi, color: "bg-green-100 text-green-600" },
  { key: "totalAdmins" as keyof Stats, label: "Total Admins", Icon: Shield, color: "bg-purple-100 text-purple-600" },
];

const QUICK_ACTIONS = [
  { href: "/admin/buses", label: "Manage Buses", icon: Bus },
  { href: "/admin/routes", label: "Manage Routes", icon: Route },
  { href: "/admin/timetables", label: "Manage Timetables", icon: Clock },
  { href: "/admin/journeys", label: "Journeys", icon: Navigation },
  { href: "/admin/bookings", label: "Bookings", icon: ReceiptText },
  { href: "/admin/users", label: "Users", icon: Users },
];

const BOOKING_COLORS: Record<string, string> = {
  draft: "#f59e0b",
  confirmed: "#10b981",
  cancelled: "#ef4444",
  completed: "#3b82f6",
};

const JOURNEY_COLORS: Record<string, string> = {
  active: "#10b981",
  completed: "#3b82f6",
  cancelled: "#ef4444",
};

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill || p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [journeyStats, setJourneyStats] = useState<JourneyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        setError(null);
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [statsRes, journeyRes] = await Promise.all([
          fetch(`${API_BASE}/admin/fleet/stats`, { headers }),
          fetch(`${API_BASE}/admin/fleet/journeys/stats`, { headers }),
        ]);
        const [statsData, journeyData] = await Promise.all([statsRes.json(), journeyRes.json()]);
        setStats(normalizeStats(statsData));
        if (journeyData.success) setJourneyStats(journeyData.stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const s = stats ?? EMPTY_STATS;

  const bookingChartData = [
    { name: "Draft", value: s.bookings.draft, fill: BOOKING_COLORS.draft },
    { name: "Confirmed", value: s.bookings.confirmed, fill: BOOKING_COLORS.confirmed },
    { name: "Cancelled", value: s.bookings.cancelled, fill: BOOKING_COLORS.cancelled },
    { name: "Completed", value: s.bookings.completed, fill: BOOKING_COLORS.completed },
  ].filter(d => d.value > 0);

  const journeyChartData = [
    { name: "Active", value: s.journeys.active, fill: JOURNEY_COLORS.active },
    { name: "Completed", value: s.journeys.completed, fill: JOURNEY_COLORS.completed },
    { name: "Cancelled", value: s.journeys.cancelled, fill: JOURNEY_COLORS.cancelled },
  ].filter(d => d.value > 0);

  const topRoutesData = (journeyStats?.topRoutes || []).map(r => ({
    name: r.routeNumber || "—",
    Trips: r.count,
  }));

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 p-2.5 rounded-xl">
          <LayoutDashboard size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400">System overview and analytics</p>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-3 text-xs text-red-500 underline">Retry</button>
        </div>
      ) : (
        <>
          {/* Fleet stat cards */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Fleet Overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {FLEET_STAT_CONFIG.map(({ key, label, Icon, color }) => (
                <div key={key} className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3">
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
                          {(s[key] as number).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{label}</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Today's journey stats */}
          {(journeyStats || loading) && (
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Today&apos;s Activity</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Journeys Today", value: journeyStats?.totalToday ?? "—", Icon: Navigation, color: "bg-primary/10 text-primary" },
                  { label: "Active Now", value: journeyStats?.activeJourneys ?? "—", Icon: Wifi, color: "bg-emerald-100 text-emerald-600" },
                  { label: "Revenue Today", value: journeyStats ? `${journeyStats.revenueToday.toLocaleString()} pts` : "—", Icon: DollarSign, color: "bg-violet-100 text-violet-600" },
                  { label: "Avg Stops / Journey", value: journeyStats?.avgStopsPerJourney ?? "—", Icon: Route, color: "bg-amber-100 text-amber-600" },
                ].map(({ label, value, Icon, color }) => (
                  <div key={label} className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
                    {loading ? (
                      <>
                        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-6 w-16 rounded" />
                          <Skeleton className="h-3 w-24 rounded" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <p className="text-xl font-black text-slate-900">{value}</p>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">{label}</p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revenue + total journeys summary */}
          {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <DollarSign size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">{s.totalRevenue.toLocaleString()} pts</p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Total Revenue (All Time)</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Navigation size={20} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">
                    {(s.journeys.active + s.journeys.completed + s.journeys.cancelled).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Total Journeys (All Time)</p>
                </div>
              </div>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Booking status donut */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Bookings by Status</h3>
              {loading ? (
                <Skeleton className="h-48 rounded-xl" />
              ) : bookingChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No bookings yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={bookingChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {bookingChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {!loading && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {(["draft", "confirmed", "cancelled", "completed"] as const).map(k => (
                    <div key={k} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: BOOKING_COLORS[k] }} />
                      <span className="text-[10px] font-bold text-slate-500 capitalize">{k}</span>
                      <span className="text-[10px] font-black text-slate-800 ml-auto">{s.bookings[k]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Journey status donut */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Journeys by Status</h3>
              {loading ? (
                <Skeleton className="h-48 rounded-xl" />
              ) : journeyChartData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No journeys yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={journeyChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {journeyChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {!loading && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {(["active", "completed", "cancelled"] as const).map(k => (
                    <div key={k} className="flex flex-col items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: JOURNEY_COLORS[k] }} />
                      <span className="text-[10px] font-bold text-slate-500 capitalize">{k}</span>
                      <span className="text-[10px] font-black text-slate-800">{s.journeys[k]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top routes bar chart */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Top Routes by Trips</h3>
              {loading ? (
                <Skeleton className="h-48 rounded-xl" />
              ) : topRoutesData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No trip data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topRoutesData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} width={48} axisLine={false} tickLine={false} />
                    <Tooltip content={<CUSTOM_TOOLTIP />} />
                    <Bar dataKey="Trips" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Quick Actions</h2>
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
        </>
      )}
    </div>
  );
}
