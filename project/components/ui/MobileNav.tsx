"use client";

import { Map as MapIcon, ReceiptText, UserCircle, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: ReceiptText, label: "Bookings", href: "/mybookings" },
  { icon: MapIcon, label: "Map", href: "/" },
  { icon: UserCircle, label: "Profile", href: "/user" },
];

interface MobileNavProps {
  onMenuOpen: () => void;
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-50 pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {/* Hamburger — far left */}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-wider">Menu</span>
        </button>

        {/* 3 nav items */}
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-colors",
                isActive ? "text-primary" : "text-slate-400"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
