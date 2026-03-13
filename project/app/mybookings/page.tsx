"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/ui/AuthModal";
import { API_ENDPOINTS, Booking, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, ReceiptText, AlertCircle, Clock,
  CheckCircle2, History, ChevronLeft, ChevronRight,
} from "lucide-react";
import { BookingCard } from "@/components/ui/BookingCard";
import { notify } from "@/lib/notify";

const BOOKINGS_PER_PAGE = 8;

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (user) {
      loadBookings();
      loadProfile();
    }
  }, [user]);

  const loadBookings = async () => {
    if (!user) return;
    setBookingsLoading(true);
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.BOOKING_MY, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) setBookings(data.data || []);
    else notify.error("Failed to load bookings.");
    setBookingsLoading(false);
  };

  const loadProfile = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.USER_PROFILE, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) setIsProfileComplete(!!(data.data?.nic && data.data?.phone));
  };

  const handleCancel = async (bookingId: string) => {
    if (!user) return;
    setCancelling(bookingId);
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.BOOKING_CANCEL(bookingId), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: "Cancelled by passenger" }),
    });
    if (data?.success) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b))
      );
      notify.success("Booking cancelled.");
    } else {
      notify.error("Failed to cancel booking.");
    }
    setCancelling(null);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary opacity-30" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 md:p-10 max-w-xl mx-auto w-full flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
          <ReceiptText className="text-slate-300" size={40} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">My Bookings</h1>
          <p className="text-slate-500">Sign in to view your bookings.</p>
        </div>
        <Button className="h-12 px-8 rounded-xl font-bold" onClick={() => setShowAuth(true)}>
          Sign In / Create Account
        </Button>
        <AuthModal
          open={showAuth}
          onClose={() => setShowAuth(false)}
          onSuccess={() => setShowAuth(false)}
        />
      </div>
    );
  }

  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const pendingBookings = bookings.filter((b) => b.status === "draft");
  const upcomingBookings = bookings.filter(
    (b) => b.status === "confirmed" && new Date(b.travelDate) >= today
  );
  const historyBookings = bookings.filter(
    (b) =>
      b.status === "cancelled" ||
      b.status === "completed" ||
      (b.status === "confirmed" && new Date(b.travelDate) < today)
  );

  const upcomingTotal = Math.max(1, Math.ceil(upcomingBookings.length / BOOKINGS_PER_PAGE));
  const upcomingPage_ = Math.min(upcomingPage, upcomingTotal);
  const upcomingVisible = upcomingBookings.slice(
    (upcomingPage_ - 1) * BOOKINGS_PER_PAGE,
    upcomingPage_ * BOOKINGS_PER_PAGE
  );

  const historyTotal = Math.max(1, Math.ceil(historyBookings.length / BOOKINGS_PER_PAGE));
  const historyPage_ = Math.min(historyPage, historyTotal);
  const historyVisible = historyBookings.slice(
    (historyPage_ - 1) * BOOKINGS_PER_PAGE,
    historyPage_ * BOOKINGS_PER_PAGE
  );

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <ReceiptText className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Bookings</h1>
          <p className="text-slate-500 font-medium text-sm">View and manage your seat reservations</p>
        </div>
      </div>

      <Tabs defaultValue={pendingBookings.length > 0 ? "pending" : "upcoming"}>
        <TabsList className="w-full rounded-2xl bg-slate-100 p-1 mb-6">
          <TabsTrigger value="pending" className="flex-1 rounded-xl text-xs font-bold relative">
            Pending
            {pendingBookings.length > 0 && (
              <span className="ml-1 bg-amber-500 text-white rounded-full px-1.5 text-[9px] font-black">
                {pendingBookings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex-1 rounded-xl text-xs font-bold">
            Upcoming ({upcomingBookings.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 rounded-xl text-xs font-bold">
            History ({historyBookings.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Pending ── */}
        <TabsContent value="pending">
          {bookingsLoading ? (
            <LoadingSpinner />
          ) : pendingBookings.length === 0 ? (
            <EmptyState
              icon={Clock}
              message="No pending bookings"
              action={{ label: "Book a Seat", onClick: () => router.push("/booking") }}
            />
          ) : (
            <div className="space-y-4">
              {!isProfileComplete && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">
                    Complete your NIC and phone in{" "}
                    <button
                      onClick={() => router.push("/user")}
                      className="font-black underline"
                    >
                      your profile
                    </button>{" "}
                    before proceeding to pay.
                  </p>
                </div>
              )}
              {pendingBookings.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  onCancel={handleCancel}
                  cancelling={cancelling === b.id}
                  canPay={isProfileComplete}
                  onPay={() => router.push(`/payment/${b.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Upcoming ── */}
        <TabsContent value="upcoming">
          {bookingsLoading ? (
            <LoadingSpinner />
          ) : upcomingBookings.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              message="No upcoming bookings"
              action={{ label: "Book a Seat", onClick: () => router.push("/booking") }}
            />
          ) : (
            <>
              <div className="space-y-4">
                {upcomingVisible.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onCancel={handleCancel}
                    cancelling={cancelling === b.id}
                  />
                ))}
              </div>
              <PaginationBar page={upcomingPage_} total={upcomingTotal} onChange={setUpcomingPage} />
            </>
          )}
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history">
          {bookingsLoading ? (
            <LoadingSpinner />
          ) : historyBookings.length === 0 ? (
            <EmptyState icon={History} message="No booking history yet" />
          ) : (
            <>
              <div className="space-y-4">
                {historyVisible.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onCancel={handleCancel}
                    cancelling={cancelling === b.id}
                  />
                ))}
              </div>
              <PaginationBar page={historyPage_} total={historyTotal} onChange={setHistoryPage} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="animate-spin text-primary opacity-30" size={32} />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: any;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-16 space-y-3">
      <Icon size={40} className="mx-auto text-slate-200" />
      <p className="font-bold text-slate-400">{message}</p>
      {action && (
        <Button variant="outline" className="rounded-xl" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function PaginationBar({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-5">
      <Button
        variant="outline"
        size="icon"
        className="rounded-xl h-9 w-9"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
      >
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-bold text-slate-600">
        <span className="text-primary">{page}</span> / {total}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="rounded-xl h-9 w-9"
        onClick={() => onChange(page + 1)}
        disabled={page === total}
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
