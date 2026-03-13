"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/ui/AuthModal";
import { API_ENDPOINTS, Journey, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Loader2, Navigation, MapPin, Bus, ChevronLeft, ChevronRight,
  ArrowRight, Coins, History, QrCode, CheckCircle2, XCircle, Radio,
} from "lucide-react";

const PER_PAGE = 10;

type StatusFilter = "all" | "active" | "completed" | "cancelled";

const FILTER_TABS: { key: StatusFilter; label: string; icon: React.ElementType }[] = [
  { key: "all",       label: "All",       icon: History      },
  { key: "active",    label: "Active",    icon: Radio        },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "cancelled", label: "Cancelled", icon: XCircle      },
];

const STATUS_STYLES: Record<string, string> = {
  active:    "bg-emerald-50 border-emerald-200 text-emerald-700",
  completed: "bg-blue-50 border-blue-200 text-blue-700",
  cancelled: "bg-slate-100 border-slate-200 text-slate-500",
};

export default function JourneysPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [showAuth,    setShowAuth]    = useState(false);
  const [journeys,    setJourneys]    = useState<Journey[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [meta,        setMeta]        = useState({ total: 0, lastPage: 1 });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const token = await user.getIdToken();
    const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
    if (statusFilter !== "all") params.set("status", statusFilter);

    const { data, error } = await safeFetch(
      `${API_ENDPOINTS.JOURNEY_HISTORY}?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (error) {
      notify.error("Failed to load journeys.");
    } else {
      setJourneys(data?.data || []);
      setMeta({ total: data?.meta?.total || 0, lastPage: data?.meta?.lastPage || 1 });
    }
    setLoading(false);
  }, [user, page, statusFilter]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Reset to page 1 when filter changes
  const handleFilterChange = (f: StatusFilter) => {
    setStatusFilter(f);
    setPage(1);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Navigation size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">My Journeys</h1>
          <p className="text-slate-500 text-sm max-w-xs">Sign in to view your bus journey history and fares.</p>
          <Button className="rounded-xl px-6" onClick={() => setShowAuth(true)}>Sign In</Button>
        </div>
        {showAuth && <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      </>
    );
  }

  const activeJourney = journeys.find(j => j.status === "active");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-10 pb-0 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between pb-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">My Journeys</h1>
              <p className="text-slate-400 text-xs mt-0.5">{meta.total} journey{meta.total !== 1 ? "s" : ""}</p>
            </div>
            <Button className="rounded-xl h-9 gap-2 text-sm" onClick={() => router.push("/scan")}>
              <QrCode size={14} />
              Scan QR
            </Button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 -mb-px">
            {FILTER_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap",
                  statusFilter === key
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200"
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-5 space-y-4">

        {/* Active journey banner */}
        {activeJourney && (statusFilter === "all" || statusFilter === "active") && (
          <button
            onClick={() => router.push(`/journey/${activeJourney._id}`)}
            className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-4 flex items-center gap-4 text-left shadow-lg shadow-emerald-500/25"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bus size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-sm leading-none">Active Journey</p>
              <p className="text-emerald-100 text-xs mt-1 truncate">From {activeJourney.boardingStopName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <ArrowRight size={16} className="text-white" />
            </div>
          </button>
        )}

        {/* Journey list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-primary opacity-30" size={32} />
          </div>
        ) : journeys.filter(j => j.status !== "active").length === 0 && !activeJourney ? (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <History size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="font-bold text-slate-600">
                {statusFilter === "all" ? "No journeys yet" : `No ${statusFilter} journeys`}
              </p>
              <p className="text-slate-400 text-sm mt-1">Board a bus by scanning the QR code inside.</p>
            </div>
            <Button variant="outline" className="rounded-xl" onClick={() => router.push("/scan")}>
              <QrCode size={14} className="mr-2" /> Scan to Board
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {journeys
              .filter(j => j.status !== "active")
              .map(j => <JourneyCard key={j._id} journey={j} onOpen={(id) => router.push(`/journey/${id}`)} />)}
          </div>
        )}

        {/* Pagination */}
        {meta.lastPage > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">Page {page} of {meta.lastPage} · {meta.total} total</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={14} />
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPage(p => Math.min(meta.lastPage, p + 1))} disabled={page >= meta.lastPage}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function JourneyCard({ journey, onOpen }: { journey: Journey; onOpen: (id: string) => void }) {
  const isCompleted = journey.status === "completed";

  return (
    <button
      onClick={() => isCompleted && onOpen(journey._id)}
      className={cn(
        "w-full bg-white rounded-2xl border border-slate-100 p-4 text-left shadow-sm transition-all",
        isCompleted ? "hover:shadow-md hover:border-slate-200 cursor-pointer" : "cursor-default"
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 font-medium">
          {journey.startedAt ? format(new Date(journey.startedAt), "MMM d, yyyy · h:mm a") : "—"}
        </p>
        <Badge
          variant="outline"
          className={cn("text-[10px] font-black", STATUS_STYLES[journey.status] || "")}
        >
          {journey.status.toUpperCase()}
        </Badge>
      </div>

      {/* Route */}
      <div className="flex items-stretch gap-3">
        <div className="flex flex-col items-center gap-0 shrink-0 pt-0.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <div className="w-px flex-1 bg-slate-200 my-1" style={{ minHeight: 24 }} />
          <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Boarded</p>
            <p className="font-bold text-slate-800 text-sm truncate">{journey.boardingStopName || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Alighted</p>
            <p className="font-bold text-slate-800 text-sm truncate">
              {journey.alightingStopName || (isCompleted ? "—" : "Still on bus")}
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      {isCompleted && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin size={12} className="text-slate-400" />
            <span className="font-semibold">{journey.stopsTravelled} stop{journey.stopsTravelled !== 1 ? "s" : ""}</span>
          </div>
          <div className="w-px h-3 bg-slate-200" />
          <div className="flex items-center gap-1.5 text-xs">
            <Coins size={12} className="text-primary" />
            <span className="font-black text-primary">{journey.fareCharged} pts</span>
          </div>
          {journey.endedAt && (
            <>
              <div className="w-px h-3 bg-slate-200 ml-auto" />
              <p className="text-xs text-slate-400">Ended {format(new Date(journey.endedAt), "h:mm a")}</p>
            </>
          )}
        </div>
      )}
    </button>
  );
}
