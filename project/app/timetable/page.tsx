"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTransportData } from "@/hooks/useTransportData";
import { Loader2, Clock, ArrowRightLeft, MapPin, CalendarDays, ChevronLeft, ChevronRight, Map } from "lucide-react";
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RouteTimetableContent } from "@/components/panels/RouteTimetableContent";
import { format, isWeekend } from "date-fns";

const PER_PAGE = 10;

export default function TimetablePage() {
  return (
    <Suspense>
      <TimetablePageInner />
    </Suspense>
  );
}

function TimetablePageInner() {
  const { routes, loading: routesLoading } = useTransportData();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const routeParam = searchParams.get("route");
    if (routeParam) setExpandedRoute(routeParam);
  }, [searchParams]);

  const dateType = isWeekend(selectedDate) ? "weekend" : "weekday";

  const filteredRoutes = routes.filter((r) => {
    const from = fromQuery.trim().toLowerCase();
    const to = toQuery.trim().toLowerCase();
    const startName = r.start?.name?.toLowerCase() || "";
    const endName = r.end?.name?.toLowerCase() || "";
    const routeNum = r.routeNumber?.toLowerCase() || "";
    const matchFrom = !from || startName.includes(from) || routeNum.includes(from);
    const matchTo = !to || endName.includes(to) || routeNum.includes(to);
    return matchFrom && matchTo;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredRoutes.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleFromChange = (v: string) => { setFromQuery(v); setPage(1); };
  const handleToChange = (v: string) => { setToQuery(v); setPage(1); };
  const swap = () => { setFromQuery(toQuery); setToQuery(fromQuery); setPage(1); };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto w-full">
      <header className="mb-10">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
            <Clock className="text-white" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Transit Timetable</h1>
            <p className="text-slate-500 font-medium">Scheduled service times for all active routes</p>
          </div>
        </div>

        {/* Search + Date */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
              <Input
                placeholder="From..."
                value={fromQuery}
                onChange={(e) => handleFromChange(e.target.value)}
                className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
              />
            </div>
            <Button variant="outline" size="icon" onClick={swap} className="rounded-2xl h-12 w-12 shrink-0">
              <ArrowRightLeft size={15} className="text-slate-500" />
            </Button>
            <div className="relative flex-1">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" />
              <Input
                placeholder="To..."
                value={toQuery}
                onChange={(e) => handleToChange(e.target.value)}
                className="pl-9 h-12 rounded-2xl border-slate-200 text-sm font-medium"
              />
            </div>
          </div>

          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-12 rounded-2xl border-slate-200 font-bold text-sm gap-2 whitespace-nowrap">
                <CalendarDays size={16} className="text-slate-400" />
                {format(selectedDate, "EEE, MMM d")}
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${dateType === "weekend" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  {dateType === "weekend" ? "WEEKEND" : "WEEKDAY"}
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
        </div>
      </header>

      {routesLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary opacity-20" size={48} />
          <p className="text-sm font-bold text-slate-300 uppercase tracking-widest italic">Loading Network Schedules...</p>
        </div>
      ) : (
        <>
          <Accordion
            type="single"
            collapsible
            className="space-y-4"
            value={expandedRoute ?? undefined}
            onValueChange={setExpandedRoute}
          >
            {pageItems.map((route) => (
              <AccordionItem
                key={route.id}
                value={route.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all px-0"
              >
                {/* Outer flex row: trigger expands, map button sits alongside — NOT nested inside trigger */}
                <div className="flex items-center gap-3 pr-4">
                  <AccordionTrigger className="flex-1 hover:no-underline px-6 py-5 group [&>svg]:ml-2">
                    <div className="flex items-center gap-5 text-left w-full">
                      <div className="bg-slate-50 p-3 rounded-xl group-hover:bg-slate-100 transition-colors">
                        <p className="text-lg font-black text-slate-900 italic leading-none">{route.routeNumber}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-700 leading-tight">
                          {route.start?.name} <span className="text-slate-300 mx-1">→</span> {route.end?.name}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {dateType === "weekend" ? "Weekend Schedule" : "Weekday Schedule"}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  {/* Sibling button — valid HTML, not nested inside the trigger button */}
                  <button
                    onClick={() => router.push(`/?routeId=${route.id}`)}
                    className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-xl px-3 py-1.5 transition-colors"
                  >
                    <Map size={12} /> Map
                  </button>
                </div>
                <AccordionContent className="px-0 pb-0 border-t border-slate-50">
                  <RouteTimetableContent routeId={route.id} dateType={dateType} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {filteredRoutes.length === 0 ? (
            <div className="bg-slate-50 p-16 rounded-[2rem] border border-dashed border-slate-200 text-center">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm italic">No routes match your search</p>
            </div>
          ) : (
            <div className="mt-6">
              <Pagination page={safePage} total={totalPages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button variant="outline" size="icon" onClick={() => onChange(page - 1)} disabled={page === 1} className="rounded-xl h-9 w-9">
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-bold text-slate-600">
        Page <span className="text-primary">{page}</span> of {total}
      </span>
      <Button variant="outline" size="icon" onClick={() => onChange(page + 1)} disabled={page === total} className="rounded-xl h-9 w-9">
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
