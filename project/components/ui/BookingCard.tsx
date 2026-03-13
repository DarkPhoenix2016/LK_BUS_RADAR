"use client";

import { useRouter } from "next/navigation";
import { Booking } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-amber-200 text-amber-700 bg-amber-50",
  confirmed: "border-emerald-200 text-emerald-700 bg-emerald-50",
  cancelled: "border-red-200 text-red-600 bg-red-50",
  completed: "border-slate-200 text-slate-500 bg-slate-50",
};

export function BookingCard({
  booking,
  onCancel,
  cancelling,
  canPay,
  onPay,
}: {
  booking: Booking;
  onCancel: (id: string) => void;
  cancelling: boolean;
  canPay?: boolean;
  onPay?: () => void;
}) {
  const router = useRouter();
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const isPast = new Date(booking.travelDate) < today;
  const canCancel = (booking.status === "confirmed" || booking.status === "draft") && !isPast;
  const isDraft = booking.status === "draft";

  return (
    <div
      className={cn(
        "bg-white border rounded-2xl p-5 space-y-4",
        booking.status === "cancelled" ? "border-slate-100 opacity-60" : "border-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-lg font-black text-primary font-mono">{booking.bookingReference}</span>
            <Badge
              variant="outline"
              className={cn("text-[10px] font-black", STATUS_STYLES[booking.status] || "")}
            >
              {booking.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm font-bold text-slate-800 flex flex-col gap-0.5">
            <span>Route {booking.route?.routeNumber || "—"}</span>
            {(booking.route?.start?.name || booking.route?.end?.name) && (
              <span className="text-xs text-slate-500 font-semibold">
                {booking.route?.start?.name || "N/A"} → {booking.route?.end?.name || "N/A"}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-black text-slate-900">
            {format(new Date(booking.travelDate), "MMM d, yyyy")}
          </p>
          <p className="text-xs text-slate-400 capitalize">{booking.direction}ward</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {isDraft && onPay && (
          <Button
            size="sm"
            className={cn(
              "rounded-xl text-xs font-bold",
              canPay
                ? "bg-emerald-500 hover:bg-emerald-600 shadow-sm"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            )}
            onClick={canPay ? onPay : undefined}
            disabled={!canPay}
            title={!canPay ? "Complete your profile (NIC + phone) first" : ""}
          >
            <CreditCard size={13} className="mr-1.5" /> Proceed to Pay
          </Button>
        )}
        {!isDraft && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-slate-200 text-xs font-bold"
            onClick={() => router.push(`/invoice/${booking.id}`)}
          >
            <FileText size={13} className="mr-1.5" /> View Invoice
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-red-100 text-red-500 hover:bg-red-50 text-xs font-bold"
            onClick={() => onCancel(booking.id)}
            disabled={cancelling}
          >
            {cancelling && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
