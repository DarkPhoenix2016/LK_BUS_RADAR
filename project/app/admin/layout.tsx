"use client";

import { useAdminAuth } from "@/hooks/useAdminAuth";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Bus, Route, Clock, LayoutDashboard, LogOut, Users, Shield, ChevronLeft, UserCircle, FileText, GitMerge, Settings2, MapPin, QrCode, PhoneCall, BookOpen, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/buses", label: "Buses", icon: Bus },
  { href: "/admin/busStops", label: "Bus Stops", icon: MapPin },
  { href: "/admin/owners", label: "Bus Owners", icon: Users },
  { href: "/admin/permits", label: "Route Permits", icon: FileText },
  { href: "/admin/routes", label: "Routes", icon: Route },
  { href: "/admin/timetables", label: "Timetables", icon: Clock },
  { href: "/admin/busStands", label: "Bus Stands", icon: PhoneCall },
  { href: "/admin/qrcodes", label: "QR Codes", icon: QrCode },
  { href: "/admin/bookings", label: "Bookings", icon: BookOpen },
  { href: "/admin/journeys", label: "Journeys", icon: Navigation },
  { href: "/admin/configs", label: "Configs", icon: Settings2 },
  { href: "/admin/sync-review", label: "Sync Review", icon: GitMerge },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/profile", label: "My Profile", icon: UserCircle },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { state, login, logout } = useAdminAuth();
  const pathname = usePathname();

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return <AdminLoginPage login={login} />;
  }

  if (state.status === "unauthorized") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center space-y-4">
          <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <Shield size={28} className="text-red-500" />
          </div>
          <h1 className="text-xl font-black text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-500">Your account does not have admin privileges. Contact your system administrator.</p>
          <Button variant="outline" onClick={logout} className="w-full rounded-xl">Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-100 flex flex-col h-screen sticky top-0">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-xl">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 leading-none">LK Bus Radar</p>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href) && href !== "/admin";
            const isExactDash = exact && pathname === "/admin";
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                  (active || isExactDash)
                    ? "bg-primary/10 text-primary"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-bold text-slate-700 truncate">{state.user.email}</p>
            <p className="text-[10px] text-slate-400">Administrator</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-slate-500 hover:text-red-600 rounded-xl"
            onClick={logout}
          >
            <LogOut size={14} className="mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 h-screen overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function AdminLoginPage({ login }: { login: (e: string, p: string) => Promise<string | null> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const err = await login(email, password);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="bg-primary w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Admin Login</h1>
          <p className="text-sm text-slate-400 mt-1">Authorized administrators only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@lkbusradar.lk"
              required
              className="rounded-xl h-11"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="rounded-xl h-11"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium bg-red-50 px-3 py-2 rounded-xl">{error}</p>
          )}

          <Button type="submit" className="w-full rounded-xl h-11 font-bold" disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign In"}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/" className="text-xs text-slate-400 hover:text-primary flex items-center justify-center gap-1">
            <ChevronLeft size={12} /> Back to main site
          </Link>
        </div>
      </div>
    </div>
  );
}
