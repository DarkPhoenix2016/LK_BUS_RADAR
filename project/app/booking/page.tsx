"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useTransportData } from "@/hooks/useTransportData";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/ui/AuthModal";
import { fetcher, safeFetch, API_ENDPOINTS, TimetableEntry, Route, UserProfile } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, Ticket, ChevronRight, ChevronLeft, MapPin, CalendarDays, AlertCircle, CheckCircle2, ArrowRightLeft, ChevronsLeft, ChevronsRight, Info } from "lucide-react";
import { format, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/notify";

type Step = 1 | 2 | 3 | 4;

export default function BookingPage() {
  return (
    <Suspense>
      <BookingPageInner />
    </Suspense>
  );
}

function BookingPageInner() {
  const searchParams = useSearchParams();
  const { routes, loading: routesLoading } = useTransportData();
  const { user } = useAuth();

  const preRouteId = searchParams.get("routeId") || "";
  const preRoute = searchParams.get("route") || "";
  const preBus = searchParams.get("bus") || "";

  const [step, setStep] = useState<Step>(preRouteId ? 2 : 1);
  const [selectedRouteId, setSelectedRouteId] = useState(preRouteId);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [routeSearch, setRouteSearch] = useState("");
  const [routePage, setRoutePage] = useState(1);
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState("");
  const [passengerName, setPassengerName] = useState(user?.displayName || "");
  const [passengerEmail, setPassengerEmail] = useState(user?.email || "");
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user) {
      setPassengerName(user.displayName || "");
      setPassengerEmail(user.email || "");
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) setProfile(data.data);
    else notify.warning("Profile details are incomplete.", { description: "NIC and phone are required before final payment." });
  };

  const isProfileComplete = !!(profile?.nic && profile?.phone);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId);
  const dateType = isWeekend(selectedDate) ? "weekend" : "weekday";

  const { data: routeMetaData } = useSWR(
    selectedRouteId ? API_ENDPOINTS.ROUTE_META(selectedRouteId) : null,
    fetcher
  );
  const routeMeta = routeMetaData?.data || null;
  const routeFullFare: number | null = routeMeta?.priceFullJourney ?? null;
  const routeDistanceKm: string | null =
    routeMeta?.meta?.averageDistanceKm || routeMeta?.routeDistance || selectedRoute?.routeDistance || null;

  const { data: timetableEntries, isLoading: timetableLoading } = useSWR<TimetableEntry[]>(
    selectedRouteId && step >= 3 ? API_ENDPOINTS.TIMETABLE(selectedRouteId) : null,
    fetcher
  );

  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const filteredSlots = (timetableEntries || [])
    .filter((e) => e.runningSlot.runningDirection === direction)
    .filter((e, i, arr) => arr.findIndex((x) => x.runningSlotId === e.runningSlotId) === i);

  const selectedSlot = filteredSlots.find((e) => e.runningSlotId === selectedSlotId);
  const departureTime = selectedSlot?.runningSlot?.runningSlotBusStops?.[0];
  const timeKey = dateType === "weekend" ? "weekendTime" : "weekdayTime";
  const departureDisplay = departureTime
    ? `${(departureTime as any)[timeKey]?.slice(0, 2)}:${(departureTime as any)[timeKey]?.slice(2)}`
    : "—";

  const ROUTE_PER_PAGE = 12;
  const filteredRoutes = routes.filter((r) => {
    const q = routeSearch.toLowerCase();
    return !q || r.routeNumber?.toLowerCase().includes(q) || r.start?.name?.toLowerCase().includes(q) || r.end?.name?.toLowerCase().includes(q);
  });
  const routeTotalPages = Math.max(1, Math.ceil(filteredRoutes.length / ROUTE_PER_PAGE));
  const safeRoutePage = Math.min(routePage, routeTotalPages);
  const pageRoutes = filteredRoutes.slice((safeRoutePage - 1) * ROUTE_PER_PAGE, safeRoutePage * ROUTE_PER_PAGE);

  const handleConfirmBooking = async () => {
    if (!user) {
      notify.warning("Please sign in to continue booking.");
      setShowAuth(true);
      return;
    }
    if (!selectedRouteId || !selectedSlotId) return;

    setIsBooking(true);
    setBookingError("");

    const token = await user.getIdToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.BOOKING_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        routeId: selectedRouteId,
        slotId: selectedSlotId,
        travelDate: selectedDate.toISOString(),
        direction,
        passengerName,
        passengerEmail,
      }),
    });

    setIsBooking(false);

    if (error) {
      setBookingError(error);
      notify.error("Booking failed.", { description: error });
      return;
    }

    setBookingRef(data.data.bookingReference);
    setBookingId(data.data.id || data.data._id);
    setStep(4);
    notify.success("Booking scheduled successfully.", { description: "Proceed to payment to confirm your seat." });
  };

  // Completed state (booking created as draft)
  if (bookingRef) {
    return (
      <div className="p-6 md:p-10 max-w-xl mx-auto w-full flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
          <CheckCircle2 className="text-amber-500" size={40} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Booking Scheduled!</h1>
          <p className="text-slate-500">Your seat is reserved but pending payment.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 w-full text-left space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reference</span>
            <span className="text-lg font-black text-primary font-mono">{bookingRef}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Route</span>
            <span className="font-bold text-slate-800">{selectedRoute?.routeNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</span>
            <span className="font-bold text-slate-800">{format(selectedDate, "EEE, MMMM d yyyy")}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Departure</span>
            <span className="font-bold text-slate-800">{departureDisplay} ({direction === "up" ? "Upward" : "Downward"})</span>
          </div>
          {routeFullFare != null && (
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount to Pay</span>
              <span className="text-base font-black text-emerald-700">LKR {routeFullFare}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-slate-100 pt-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status</span>
            <span className="text-xs font-black text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">PENDING PAYMENT</span>
          </div>
        </div>
        <div className="flex gap-3 w-full">
          <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => router.push("/mybookings")}>
            View My Bookings
          </Button>
          {bookingId && (
            <Button className="flex-1 h-12 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600" onClick={() => router.push(`/payment/${bookingId}`)}>
              Proceed to Pay
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <Ticket className="text-white" size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Book a Seat</h1>
          <p className="text-slate-500 font-medium">Choose a route, date, and time slot</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10">
        {([1, 2, 3] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all",
              step > s ? "bg-primary text-white" : step === s ? "bg-primary text-white ring-4 ring-primary/20" : "bg-slate-100 text-slate-400"
            )}>
              {step > s ? "✓" : s}
            </div>
            <span className={cn("text-xs font-bold hidden sm:block", step === s ? "text-slate-900" : "text-slate-400")}>
              {s === 1 ? "Route" : s === 2 ? "Date" : "Time Slot"}
            </span>
            {i < 2 && <div className="flex-1 h-0.5 bg-slate-100 w-8 mx-1" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Route selection */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search routes, stops..."
              value={routeSearch}
              onChange={(e) => { setRouteSearch(e.target.value); setRoutePage(1); }}
              className="pl-9 h-12 rounded-2xl"
            />
          </div>
          {routesLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary opacity-30" size={32} /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pageRoutes.map((route) => (
                  <button key={route.id} onClick={() => { setSelectedRouteId(route.id); setStep(2); }}
                    className="text-left group">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-primary hover:shadow-md transition-all group-hover:shadow-primary/10">
                      <p className="text-xl font-black text-slate-900 italic mb-1">{route.routeNumber}</p>
                      <p className="text-sm text-slate-600 font-medium">{route.start?.name} → {route.end?.name}</p>
                      {route.routeDistance && <p className="text-xs text-slate-400 mt-1">{route.routeDistance} km</p>}
                    </div>
                  </button>
                ))}
              </div>
              <BookingPagination page={safeRoutePage} total={routeTotalPages} onChange={setRoutePage} />
            </>
          )}
        </div>
      )}

      {/* STEP 2: Date */}
      {step === 2 && (
        <div className="space-y-6">
          <button onClick={() => setStep(1)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700">
            <ChevronLeft size={16} /> Change Route
          </button>
          {selectedRoute && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-2xl font-black text-primary italic">{selectedRoute.routeNumber}</span>
                <span className="text-sm font-bold text-slate-700">{selectedRoute.start?.name} → {selectedRoute.end?.name}</span>
              </div>
              {(routeDistanceKm != null || routeFullFare != null) && (
                <div className="flex gap-3 flex-wrap pt-1 border-t border-slate-200">
                  {routeDistanceKm != null && (
                    <span className="text-xs font-bold text-slate-500">
                      Distance: <span className="text-slate-800">{routeDistanceKm} km</span>
                    </span>
                  )}
                  {routeFullFare != null && (
                    <span className="text-xs font-bold text-emerald-700">
                      Full Journey Fare: <span className="font-black">LKR {routeFullFare}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 block">Select Travel Date</Label>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm"
              />
            </div>
            <p className="text-center mt-3 text-sm font-bold text-slate-600">
              {format(selectedDate, "EEEE, MMMM d yyyy")} —{" "}
              <span className={`font-black ${dateType === "weekend" ? "text-amber-600" : "text-primary"}`}>
                {dateType === "weekend" ? "Weekend Schedule" : "Weekday Schedule"}
              </span>
            </p>
          </div>
          <Button className="w-full h-12 rounded-xl font-bold" onClick={() => setStep(3)}>
            Next: Select Time Slot <ChevronRight size={16} className="ml-2" />
          </Button>
        </div>
      )}

      {/* STEP 3: Time slot */}
      {step === 3 && (
        <div className="space-y-6">
          <button onClick={() => setStep(2)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700">
            <ChevronLeft size={16} /> Change Date
          </button>

          {selectedRoute && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xl font-black text-primary italic">{selectedRoute.routeNumber}</span>
                <span className="text-sm font-bold text-slate-700">{selectedRoute.start?.name} → {selectedRoute.end?.name}</span>
                <Badge variant="outline" className={dateType === "weekend" ? "border-amber-200 text-amber-700 bg-amber-50" : "border-primary/20 text-primary bg-primary/5"}>
                  {format(selectedDate, "MMM d")} · {dateType}
                </Badge>
              </div>
              {(routeDistanceKm != null || routeFullFare != null) && (
                <div className="flex gap-4 flex-wrap pt-1 border-t border-slate-200">
                  {routeDistanceKm != null && (
                    <span className="text-xs font-bold text-slate-500">
                      Distance: <span className="text-slate-800">{routeDistanceKm} km</span>
                    </span>
                  )}
                  {routeFullFare != null && (
                    <span className="text-xs font-bold text-emerald-700">
                      Full Journey Fare: <span className="font-black">LKR {routeFullFare}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Boarding notice */}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 font-medium">
              <span className="font-black">Starting station boarding only.</span> Seats can be booked from the first stop of the selected direction. Mid-route boarding is not available.
            </p>
          </div>

          {/* Direction toggle */}
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            <button onClick={() => setDirection("up")} className={cn("flex-1 flex flex-col items-center py-2.5 text-xs font-black uppercase rounded-xl transition-all", direction === "up" ? "bg-white text-primary shadow-sm" : "text-slate-400")}>
              <span>Upward</span>
              {selectedRoute?.start?.name && <span className="text-[9px] font-medium normal-case opacity-70">from {selectedRoute.start.name}</span>}
            </button>
            <button onClick={() => setDirection("down")} className={cn("flex-1 flex flex-col items-center py-2.5 text-xs font-black uppercase rounded-xl transition-all", direction === "down" ? "bg-white text-primary shadow-sm" : "text-slate-400")}>
              <span>Downward</span>
              {selectedRoute?.end?.name && <span className="text-[9px] font-medium normal-case opacity-70">from {selectedRoute.end.name}</span>}
            </button>
          </div>

          {timetableLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary opacity-30" size={32} /></div>
          ) : filteredSlots.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-bold">No time slots for this direction.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
              {filteredSlots.map((entry) => {
                const firstStop = entry.runningSlot?.runningSlotBusStops?.[0];
                const time = firstStop ? (firstStop as any)[timeKey] : null;
                const displayTime = time ? `${time.slice(0, 2)}:${time.slice(2)}` : "—";
                const isSelected = selectedSlotId === entry.runningSlotId;
                const slotMinutes = time ? parseInt(time.slice(0, 2)) * 60 + parseInt(time.slice(2)) : null;
                const isPast = isToday && slotMinutes !== null && slotMinutes < nowMinutes;

                return (
                  <button
                    key={entry.id}
                    onClick={() => !isPast && setSelectedSlotId(entry.runningSlotId)}
                    disabled={isPast}
                    className={cn(
                      "border rounded-2xl p-4 text-left transition-all",
                      isPast
                        ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                        : isSelected
                        ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                    )}
                  >
                    <p className={cn("text-2xl font-black font-mono", isPast ? "text-slate-400 line-through" : isSelected ? "text-primary" : "text-slate-900")}>{displayTime}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                      {entry.runningSlot?.runningNumber?.runningNumber || "Run"}
                    </p>
                    {isPast && <p className="text-[9px] text-slate-400 font-bold mt-1">DEPARTED</p>}
                    {!isPast && entry.isOnline && <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2" />}
                  </button>
                );
              })}
            </div>
          )}

          {selectedSlotId && (
            <div className="space-y-4">
              {!user && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 font-medium">
                  You need to sign in to complete your booking.
                </p>
              )}

              {user && !isProfileComplete && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">
                    Your NIC and phone number are required before payment. You can schedule now and complete your profile later.
                    <button onClick={() => router.push("/user")} className="ml-1 font-black underline">Update Profile</button>
                  </p>
                </div>
              )}

              {user && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Passenger Name</Label>
                    <Input value={passengerName} onChange={(e) => setPassengerName(e.target.value)} className="h-12 rounded-xl" />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Email</Label>
                    <Input type="email" value={passengerEmail} onChange={(e) => setPassengerEmail(e.target.value)} className="h-12 rounded-xl" />
                  </div>
                </div>
              )}

              {bookingError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 font-medium">{bookingError}</p>
              )}

              <Button
                className="w-full h-12 rounded-xl font-bold"
                onClick={handleConfirmBooking}
                disabled={isBooking}
              >
                {isBooking ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                {user ? "Schedule Booking" : "Sign In to Book"}
                <ChevronRight size={16} className="ml-2" />
              </Button>
            </div>
          )}
        </div>
      )}

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
    </div>
  );
}

function BookingPagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button onClick={() => onChange(1)} disabled={page === 1} className="p-1 rounded-lg text-slate-400 disabled:opacity-30 hover:text-slate-700">
        <ChevronsLeft size={16} />
      </button>
      <button onClick={() => onChange(page - 1)} disabled={page === 1} className="p-1 rounded-lg text-slate-400 disabled:opacity-30 hover:text-slate-700">
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm font-bold text-slate-600">
        <span className="text-primary">{page}</span> / {total}
      </span>
      <button onClick={() => onChange(page + 1)} disabled={page === total} className="p-1 rounded-lg text-slate-400 disabled:opacity-30 hover:text-slate-700">
        <ChevronRight size={16} />
      </button>
      <button onClick={() => onChange(total)} disabled={page === total} className="p-1 rounded-lg text-slate-400 disabled:opacity-30 hover:text-slate-700">
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}
