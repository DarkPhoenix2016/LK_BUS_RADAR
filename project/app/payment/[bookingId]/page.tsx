"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { API_ENDPOINTS, Booking, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CreditCard, CheckCircle2, XCircle, ShieldCheck,
  AlertTriangle, Coins, ArrowUpRight
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

type PayTab = "card" | "points";

export default function PaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [bookingLoading, setBookingLoading] = useState(true);
  const [pointBalance, setPointBalance] = useState<number | null>(null);
  const [paying, setPaying] = useState<"pass" | "fail" | "points" | null>(null);
  const [result, setResult] = useState<"pass" | "fail" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeTab, setActiveTab] = useState<PayTab>("card");

  useEffect(() => {
    if (!authLoading && user && bookingId) {
      loadBooking();
      loadPoints();
    } else if (!authLoading && !user) {
      router.replace("/user");
    }
  }, [authLoading, user, bookingId]);

  const loadBooking = async () => {
    if (!user) return;
    setBookingLoading(true);
    const token = await user.getIdToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.BOOKING_GET(bookingId), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data?.success) {
      setErrorMsg(error || "Booking not found");
      notify.error("Failed to load booking.", { description: error || "" });
    } else {
      setBooking(data.data);
    }
    setBookingLoading(false);
  };

  const loadPoints = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.USER_POINTS, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) setPointBalance(data.data.balance ?? 0);
  };

  const handleCardPayment = async (payResult: "pass" | "fail") => {
    if (!user || !booking) return;
    setPaying(payResult);
    setErrorMsg("");
    const token = await user.getIdToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.BOOKING_PAY(booking.id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ result: payResult, method: "card" }),
    });

    if (payResult === "pass") {
      if (error || !data?.success) {
        setErrorMsg(error || "Payment processing failed");
        notify.error("Payment failed.", { description: error || "" });
        setPaying(null);
        return;
      }
      setResult("pass");
      setBooking(data.data);
      notify.success("Payment successful. Booking confirmed.");
    } else {
      setResult("fail");
      notify.warning("Payment was not completed.", { description: "Booking is still saved as draft." });
    }
    setPaying(null);
  };

  const handlePointsPayment = async () => {
    if (!user || !booking) return;
    setPaying("points");
    setErrorMsg("");
    const token = await user.getIdToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.BOOKING_PAY(booking.id), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ method: "points" }),
    });

    if (error || !data?.success) {
      setErrorMsg(error || "Points payment failed");
      notify.error("Payment failed.", { description: error || "" });
      setPaying(null);
      return;
    }
    setResult("pass");
    setBooking(data.data);
    notify.success("Points payment successful. Booking confirmed.");
    setPaying(null);
  };

  if (authLoading || bookingLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary opacity-30" size={40} />
      </div>
    );
  }

  if (errorMsg && !booking) {
    return (
      <div className="p-6 max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-black text-slate-800">Booking Not Found</h2>
        <p className="text-slate-500 text-sm">{errorMsg}</p>
        <Button onClick={() => router.push("/user")} className="rounded-xl">Back to Profile</Button>
      </div>
    );
  }

  if (result === "pass") {
    return (
      <div className="p-6 md:p-10 max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-500" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Payment Successful!</h1>
          <p className="text-slate-500">Your booking is now confirmed.</p>
          {booking?.paidWithPoints && (
            <p className="text-xs text-amber-600 font-bold mt-2 flex items-center justify-center gap-1">
              <Coins size={12} /> Paid with points
            </p>
          )}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 w-full text-left space-y-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Booking Reference</p>
          <p className="text-2xl font-black text-primary font-mono">{booking?.bookingReference}</p>
        </div>
        <Button className="w-full h-12 rounded-xl font-bold" onClick={() => router.push("/mybookings")}>
          View My Bookings
        </Button>
      </div>
    );
  }

  if (result === "fail") {
    return (
      <div className="p-6 md:p-10 max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
          <XCircle size={40} className="text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Payment Failed</h1>
          <p className="text-slate-500">Your booking is kept as a draft. You can try again.</p>
        </div>
        <div className="flex gap-3 w-full">
          <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => router.push("/mybookings")}>
            My Bookings
          </Button>
          <Button className="flex-1 h-12 rounded-xl font-bold" onClick={() => setResult(null)}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const fare = booking?.fareAmount ?? null;
  const canPayWithPoints = fare !== null && fare > 0 && pointBalance !== null && pointBalance >= fare;
  const insufficientPoints = fare !== null && fare > 0 && pointBalance !== null && pointBalance < fare;

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <CreditCard className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Complete Payment</h1>
          <p className="text-slate-500 font-medium text-sm">Review and pay for your booking</p>
        </div>
      </div>

      {/* Booking summary */}
      {booking && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Reference</span>
            <span className="font-black text-primary font-mono">{booking.bookingReference}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Route</span>
            <span className="font-bold text-slate-800">
              {booking.route?.routeNumber || booking.routeId}
              {booking.route?.start?.name && (
                <span className="text-slate-400 font-normal ml-2 text-sm">
                  {booking.route.start.name} → {booking.route.end?.name}
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</span>
            <span className="font-bold text-slate-800">{format(new Date(booking.travelDate), "EEE, MMM d yyyy")}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Direction</span>
            <span className="font-bold text-slate-800 capitalize">{booking.direction}ward</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Passenger</span>
            <span className="font-bold text-slate-800">{booking.passengerName}</span>
          </div>
          {fare && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount Due</span>
              <span className="font-black text-lg text-slate-900">LKR {fare.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status</span>
            <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 font-black text-[10px]">
              PENDING PAYMENT
            </Badge>
          </div>
        </div>
      )}

      {/* Payment method tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("card")}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors",
            activeTab === "card" ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          <CreditCard size={14} className="inline mr-2" />Card
        </button>
        <button
          onClick={() => setActiveTab("points")}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors",
            activeTab === "points" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          <Coins size={14} className="inline mr-2" />Points
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Card tab */}
      {activeTab === "card" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <ShieldCheck size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">Payment Simulation</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This is a demo environment. Use the buttons below to simulate a payment outcome.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button
              size="lg"
              className="h-14 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
              onClick={() => handleCardPayment("pass")}
              disabled={!!paying}
            >
              {paying === "pass" ? <Loader2 size={18} className="animate-spin mr-2" /> : <CheckCircle2 size={18} className="mr-2" />}
              Payment Success
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => handleCardPayment("fail")}
              disabled={!!paying}
            >
              {paying === "fail" ? <Loader2 size={18} className="animate-spin mr-2" /> : <XCircle size={18} className="mr-2" />}
              Payment Failed
            </Button>
          </div>
        </div>
      )}

      {/* Points tab */}
      {activeTab === "points" && (
        <div className="space-y-4">
          {/* Balance card */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Your Points Balance</p>
            <p className="text-4xl font-black">
              {pointBalance === null ? "—" : pointBalance.toLocaleString()}
            </p>
            <p className="text-xs opacity-70 mt-1">1 point = LKR 1.00</p>
          </div>

          {fare === null || fare <= 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
              <p className="text-sm text-slate-500 font-medium">This booking does not have a set fare — points payment is unavailable.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">Points required</span>
                <span className="font-black text-lg text-slate-900">{fare.toLocaleString()} pts</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-600">Your balance</span>
                <span className={cn("font-black text-lg", insufficientPoints ? "text-red-500" : "text-emerald-600")}>
                  {pointBalance?.toLocaleString() ?? "—"} pts
                </span>
              </div>
              {insufficientPoints && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                  <XCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-700">Insufficient points</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      You need {(fare - (pointBalance ?? 0)).toLocaleString()} more points.
                    </p>
                    <button
                      onClick={() => router.push("/wallet")}
                      className="text-xs font-bold text-red-700 underline mt-1 flex items-center gap-1"
                    >
                      Top up wallet <ArrowUpRight size={10} />
                    </button>
                  </div>
                </div>
              )}
              {canPayWithPoints && (
                <Button
                  size="lg"
                  className="w-full h-14 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20"
                  onClick={handlePointsPayment}
                  disabled={!!paying}
                >
                  {paying === "points" ? (
                    <Loader2 size={18} className="animate-spin mr-2" />
                  ) : (
                    <Coins size={18} className="mr-2" />
                  )}
                  Pay {fare.toLocaleString()} Points
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
