"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RouteTimetableContent } from "@/components/panels/RouteTimetableContent";
import { format, isWeekend } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface TimetableInnerPanelProps {
  routeId: string | null;
  routeNumber?: string | null;
  onClose: () => void;
}

export function TimetableInnerPanel({ routeId, routeNumber, onClose }: TimetableInnerPanelProps) {
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calOpen, setCalOpen] = useState(false);

  const dateType = isWeekend(selectedDate) ? "weekend" : "weekday";

  return (
    <AnimatePresence>
      {routeId && (
        <motion.div
          initial={isMobile ? { y: "100%", x: 0 } : { x: "100%", y: 0 }}
          animate={{ x: 0, y: 0 }}
          exit={isMobile ? { y: "100%", x: 0 } : { x: "100%", y: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className={cn(
            "absolute inset-0 z-20 bg-white flex flex-col overflow-hidden",
            isMobile && "rounded-t-[2.5rem]"
          )}
        >
          {/* Mobile handle indicator */}
          {isMobile && (
            <div className="w-full flex justify-center pt-3 pb-1 shrink-0 bg-slate-50/50">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>
          )}

          {/* Header */}
          <div className={cn("p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50", isMobile ? "pt-2" : "")}>
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl">
                <Clock className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Timetable</p>
                {routeNumber && (
                  <p className="text-base font-black text-slate-900 leading-tight">Route {routeNumber}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-xs font-bold gap-1.5 h-9">
                    <CalendarDays size={13} className="text-slate-400" />
                    {format(selectedDate, "MMM d")}
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${dateType === "weekend" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {dateType === "weekend" ? "WE" : "WD"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) { setSelectedDate(d); setCalOpen(false); } }}
                    disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100 h-9 w-9">
                <X size={18} className="text-slate-400" />
              </Button>
            </div>
          </div>

          {/* Scrollable timetable */}
          <ScrollArea className="flex-1 min-h-0">
            <RouteTimetableContent routeId={routeId} dateType={dateType} />
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
