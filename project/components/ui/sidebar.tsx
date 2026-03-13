"use client";

import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bus as BusIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  LayoutDashboard,
  Map as MapIcon,
  Route as RouteIcon,
  Ticket,
  ReceiptText,
  UserCircle,
  Wallet,
  Phone,
  Navigation,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { name: "Live Map",     href: "/",           icon: MapIcon },
  { name: "Buses",        href: "/buses",       icon: BusIcon },
  { name: "Routes",       href: "/routes",      icon: RouteIcon },
  { name: "Timetable",   href: "/timetable",   icon: Clock },
  { name: "Book a Seat", href: "/booking",     icon: Ticket },
  { name: "My Bookings", href: "/mybookings",  icon: ReceiptText },
  { name: "My Journeys", href: "/journeys",    icon: Navigation },
  { name: "Bus Stands",  href: "/busStands",   icon: Phone },
  { name: "My Account",  href: "/user",        icon: UserCircle },
  { name: "Wallet",      href: "/wallet",      icon: Wallet },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function NavContent({
  onLinkClick,
  collapsed,
}: {
  onLinkClick?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex-1 overflow-y-auto space-y-0.5", collapsed ? "p-2" : "p-4")}>
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onLinkClick}
            title={collapsed ? item.name : undefined}
            className={cn(
              "flex items-center gap-3 py-3 rounded-xl text-sm font-semibold transition-all group",
              collapsed ? "justify-center px-2" : "px-4",
              isActive
                ? "bg-primary text-white shadow-md shadow-primary/20"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <item.icon
              className={cn(
                "w-5 h-5 shrink-0",
                isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"
              )}
            />
            {!collapsed && (
              <>
                <span>{item.name}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-white"
                  />
                )}
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const desktopBrandBar = collapsed ? (
    <div className="p-3 border-b border-slate-100 flex flex-col items-center gap-2">
      <div className="bg-primary p-2 rounded-xl">
        <BusIcon className="text-white w-5 h-5" />
      </div>
      <button
        onClick={toggleCollapsed}
        title="Expand sidebar"
        className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
      >
        <ChevronRight size={13} className="text-slate-600" />
      </button>
    </div>
  ) : (
    <div className="p-5 border-b border-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl">
            <BusIcon className="text-white w-6 h-6" />
          </div>
          <h1 className="font-extrabold text-xl tracking-tight text-slate-900 leading-none">
            LKBUS<span className="text-primary">RADAR</span>
          </h1>
        </div>
        <button
          onClick={toggleCollapsed}
          title="Collapse sidebar"
          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          <ChevronLeft size={13} className="text-slate-600" />
        </button>
      </div>
    </div>
  );

  const desktopFooter = !collapsed ? (
    <div className="p-4 border-t border-slate-100">
      <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3 border border-slate-100">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">V 2.0.0</p>
          <p className="text-xs text-slate-500 truncate">Pro Dashboard</p>
        </div>
      </div>
    </div>
  ) : null;

  const mobileFooter = (
    <div className="p-4 border-t border-slate-100">
      <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3 border border-slate-100">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center">
          <LayoutDashboard className="w-5 h-5 text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">V 2.0.0</p>
          <p className="text-xs text-slate-500 truncate">Pro Dashboard</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — collapsible */}
      <aside
        className={cn(
          "bg-white border-r border-slate-200 flex-col h-screen sticky top-0 hidden md:flex shrink-0 transition-all duration-300 overflow-hidden",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {desktopBrandBar}
        <NavContent collapsed={collapsed} />
        {desktopFooter}
      </aside>

      {/* Mobile sidebar — slide-in overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 left-0 z-50 w-72 bg-white flex flex-col shadow-2xl md:hidden"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="bg-primary p-2 rounded-xl">
                    <BusIcon className="text-white w-5 h-5" />
                  </div>
                  <h1 className="font-extrabold text-lg tracking-tight text-slate-900 leading-none">
                    LKBUS<span className="text-primary">RADAR</span>
                  </h1>
                </div>
                <button
                  onClick={onMobileClose}
                  className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200"
                >
                  <X size={16} className="text-slate-600" />
                </button>
              </div>
              <NavContent onLinkClick={onMobileClose} />
              {mobileFooter}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
