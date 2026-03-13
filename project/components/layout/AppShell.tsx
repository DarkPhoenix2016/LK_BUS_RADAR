"use client";

import { useState } from "react";
import { MobileNav } from "@/components/ui/MobileNav";
import { Sidebar } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute  = pathname.startsWith("/admin");
  const isJourneyPage = pathname.startsWith("/journey/");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (isAdminRoute || isJourneyPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <main className="flex-1 flex flex-col relative pb-16 md:pb-0">
        {children}
      </main>
      <MobileNav onMenuOpen={() => setMobileSidebarOpen(true)} />
    </div>
  );
}
