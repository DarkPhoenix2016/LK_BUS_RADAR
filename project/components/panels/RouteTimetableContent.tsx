"use client";

import { useRef, useEffect } from "react";
import useSWR from "swr";
import { API_ENDPOINTS, fetcher, TimetableEntry, Device } from "@/services/transportApi";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, ArrowRight } from "lucide-react";

interface RouteTimetableContentProps {
  routeId: string;
  dateType?: "weekday" | "weekend";
}

function formatTime(raw: string | undefined): string {
  if (!raw || raw.length < 4) return "—";
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function timeToMinutes(raw: string | undefined): number {
  if (!raw || raw.length < 4) return Infinity;
  return parseInt(raw.slice(0, 2)) * 60 + parseInt(raw.slice(2, 4));
}

function getDirectionLabel(slots: TimetableEntry[]): { from: string; to: string } {
  const first = slots[0]?.runningSlot?.runningSlotBusStops?.[0]?.busStop?.name ?? "Start";
  const last = slots[0]?.runningSlot?.runningSlotBusStops?.at(-1)?.busStop?.name ?? "End";
  return { from: first, to: last };
}

function formatBusType(busType: string | undefined | null): string {
  if (!busType) return "";
  return busType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SlotList({
  slots,
  timeKey,
  deviceMap,
}: {
  slots: TimetableEntry[];
  timeKey: string;
  deviceMap: Map<string, string>;
}) {
  const nearestRef = useRef<HTMLDivElement | null>(null);

  // Deduplicate
  const unique = slots.filter(
    (e, i, arr) => arr.findIndex((x) => x.runningSlotId === e.runningSlotId) === i
  );

  // Find nearest slot to current time
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  let nearestIdx = 0;
  let minDiff = Infinity;
  unique.forEach((entry, i) => {
    const firstStop = entry.runningSlot?.runningSlotBusStops?.[0];
    const raw = (firstStop as any)?.[timeKey];
    const mins = timeToMinutes(raw);
    const diff = Math.abs(mins - nowMinutes);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  });

  // Auto-scroll to nearest slot
  useEffect(() => {
    if (nearestRef.current) {
      setTimeout(() => {
        nearestRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [slots.length, timeKey]);

  if (unique.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400 py-10">
        No schedule data for this direction.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-50">
      {unique.map((entry, i) => {
        const stops = entry.runningSlot?.runningSlotBusStops ?? [];
        const firstStop = stops[0];
        const lastStop = stops.at(-1);
        const depTime = formatTime((firstStop as any)?.[timeKey]);
        const arrTime = formatTime((lastStop as any)?.[timeKey]);
        const busType = entry.runningSlot?.runningNumber?.busType;
        const busPlate = entry.deviceId ? deviceMap.get(entry.deviceId) : null;
        const isNearest = i === nearestIdx;

        return (
          <div
            key={entry.id}
            ref={isNearest ? nearestRef : null}
            className={`flex items-center gap-4 px-6 py-3 transition-colors ${
              isNearest
                ? "bg-primary/5 border-l-4 border-primary"
                : "hover:bg-slate-50/70"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                entry.isOnline ? "bg-emerald-400" : "bg-slate-200"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-slate-900 font-mono tabular-nums">
                  {depTime}
                </span>
                <ArrowRight size={12} className="text-slate-300" />
                <span className="text-sm font-bold text-slate-500 font-mono tabular-nums">
                  {arrTime}
                </span>
                {isNearest && (
                  <span className="text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary rounded-full px-2 py-0.5">
                    Nearest
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {busType && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    {formatBusType(busType)}
                  </p>
                )}
                {busPlate && (
                  <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 tracking-wider">
                    {busPlate}
                  </span>
                )}
              </div>
            </div>
            {entry.isOnline && (
              <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">
                Live
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RouteTimetableContent({
  routeId,
  dateType = "weekday",
}: RouteTimetableContentProps) {
  const { data: entries, isLoading, error } = useSWR<TimetableEntry[]>(
    API_ENDPOINTS.TIMETABLE(routeId),
    fetcher
  );

  // Fetch devices globally (SWR deduplicates — same cache key)
  const { data: devicesData } = useSWR<Device[]>(API_ENDPOINTS.DEVICES, fetcher);

  const deviceMap = new Map<string, string>();
  (devicesData || []).forEach((d: any) => {
    const busNum = d.busNumber || d.routePermitBus?.busNumber;
    if (d.id && busNum) deviceMap.set(d.id, busNum);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-3">
        <Loader2 className="animate-spin text-primary opacity-30" size={24} />
        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">
          Loading timetable...
        </span>
      </div>
    );
  }

  if (error || !entries) {
    return (
      <div className="px-6 py-8 text-center">
        <p className="text-sm font-bold text-slate-400">Failed to load timetable.</p>
      </div>
    );
  }

  const timeKey = dateType === "weekend" ? "weekendTime" : "weekdayTime";

  const upSlots = entries.filter((e) => e.runningSlot.runningDirection === "up");
  const downSlots = entries.filter((e) => e.runningSlot.runningDirection === "down");

  const upLabel = getDirectionLabel(upSlots);
  const downLabel = getDirectionLabel(downSlots);

  return (
    <div className="py-2">
      <Tabs defaultValue="up">
        <div className="px-4 pt-2 pb-0">
          <TabsList className="w-full rounded-xl bg-slate-100 p-1 h-auto">
            <TabsTrigger
              value="up"
              className="flex-1 rounded-lg text-xs font-bold flex flex-col py-2 gap-0.5 h-auto"
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-current opacity-70">
                Upward
              </span>
              <span className="text-[10px] font-medium text-current opacity-60 truncate max-w-full">
                {upLabel.from} → {upLabel.to}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="down"
              className="flex-1 rounded-lg text-xs font-bold flex flex-col py-2 gap-0.5 h-auto"
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-current opacity-70">
                Downward
              </span>
              <span className="text-[10px] font-medium text-current opacity-60 truncate max-w-full">
                {downLabel.from} → {downLabel.to}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="up" className="mt-2">
          <SlotList slots={upSlots} timeKey={timeKey} deviceMap={deviceMap} />
        </TabsContent>
        <TabsContent value="down" className="mt-2">
          <SlotList slots={downSlots} timeKey={timeKey} deviceMap={deviceMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
