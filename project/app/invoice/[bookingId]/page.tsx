"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { API_ENDPOINTS, Booking, TimetableEntry, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import jsPDF from "jspdf";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SlotStop = { name: string; time: string };

type SlotInfo = {
  slotId: string;
  busType: string;
  direction: string;
  departureTime: string;
  stops: SlotStop[];
  avgTravelTime: string;
};

type InvoiceData = {
  booking: Booking;
  routeNumber: string;
  routeName: string;
  startStop: string;
  endStop: string;
  distance: string;
  fare: string;
  routeId: string;
  slot: SlotInfo | null;
  totals: { directionSlots: number; nextSlot: string | null; lastSlot: string };
  generatedAt: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  confirmed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  draft: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  cancelled: { bg: "bg-red-50", text: "text-red-600", border: "border-red-200" },
  completed: { bg: "bg-slate-50", text: "text-slate-500", border: "border-slate-200" },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(raw?: string | null): string {
  const val = String(raw || "").padStart(4, "0");
  if (val.length < 4) return "N/A";
  return `${val.slice(0, 2)}:${val.slice(2, 4)}`;
}

function minutesBetween(start?: string, end?: string): number | null {
  if (!start || !end || start.length < 4 || end.length < 4) return null;
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(2, 4));
  const e = Number(end.slice(0, 2)) * 60 + Number(end.slice(2, 4));
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.max(0, e - s);
}

// ─── PDF Generator ─────────────────────────────────────────────────────────────

function generateInvoicePDF(invoice: InvoiceData): void {
  const { booking, slot } = invoice;
  const dirLabel = slot?.direction?.toLowerCase() === "down" ? "Downward" : "Upward";

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();   // 595.28 pt
  const PH = doc.internal.pageSize.getHeight();  // 841.89 pt
  const M = 36;
  const CW = PW - M * 2;

  let y = 0;

  const newPage = () => { doc.addPage(); y = 44; };
  const ensureSpace = (need: number) => { if (y + need > PH - 44) newPage(); };

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 0, PW, 168, "F");

  // Title + reference
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Booking Invoice", M, 38);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`LK Bus Radar  ·  ${booking.bookingReference}`, M, 54);

  // Status pill
  const statusBg: Record<string, [number, number, number]> = {
    confirmed: [236, 253, 243], draft: [255, 251, 235],
    cancelled: [254, 242, 242], completed: [248, 250, 252],
  };
  const statusFg: Record<string, [number, number, number]> = {
    confirmed: [21, 128, 61], draft: [133, 77, 14],
    cancelled: [185, 28, 28], completed: [71, 85, 105],
  };
  const sbg = statusBg[booking.status] || statusBg.confirmed;
  const sfg = statusFg[booking.status] || statusFg.confirmed;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const stLabel = booking.status.toUpperCase();
  const stW = doc.getTextWidth(stLabel) + 20;
  const stX = PW - M - stW;
  doc.setFillColor(sbg[0], sbg[1], sbg[2]);
  doc.roundedRect(stX, 28, stW, 18, 9, 9, "F");
  doc.setTextColor(sfg[0], sfg[1], sfg[2]);
  doc.text(stLabel, stX + 10, 40);

  // Route card in header
  doc.setFillColor(22, 100, 212);
  doc.roundedRect(M, 68, CW, 82, 8, 8, "F");

  const halfW = (CW - 60) / 2;

  // Start stop
  doc.setTextColor(190, 220, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("START", M + 10, 82);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  const startLine = doc.splitTextToSize(invoice.startStop, halfW)[0] || invoice.startStop;
  doc.text(startLine, M + 10, 96);

  // End stop
  doc.setTextColor(190, 220, 255);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("END", PW - M - 10, 82, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  const endLine = doc.splitTextToSize(invoice.endStop, halfW)[0] || invoice.endStop;
  doc.text(endLine, PW - M - 10, 96, { align: "right" });

  // Route number pill (left) + direction label plain text (right, no background)
  const pillY = 122;
  const rLabel = `Route ${invoice.routeNumber}`;
  doc.setFillColor(14, 80, 190);
  const rLabelW = doc.getTextWidth(rLabel) + 16;
  doc.roundedRect(M + 10, pillY, rLabelW, 16, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(rLabel, M + 18, pillY + 10.5);

  // Direction — plain white text, no background pill
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(dirLabel, PW - M - 10, pillY + 10.5, { align: "right" });

  y = 184;

  // ── Route number + travel date ───────────────────────────────────────────────
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("ROUTE", M, y);
  doc.text("TRAVEL DATE", PW - M, y, { align: "right" });
  y += 14;

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.routeNumber, M, y);

  doc.setFontSize(11);
  const travelDateStr = format(new Date(booking.travelDate), "EEEE, MMMM d yyyy");
  doc.text(travelDateStr, PW - M, y, { align: "right" });
  y += 10;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(M, y, PW - M, y);
  y += 16;

  // ── Card grid ───────────────────────────────────────────────────────────────
  const CARD_H = 38;
  const CARD_GAP = 5;
  const ROW_H = CARD_H + CARD_GAP;

  type CardItem = { label: string; value: string; highlight?: boolean };

  const drawCards = (items: CardItem[], cols: number) => {
    const colW = (CW - CARD_GAP * (cols - 1)) / cols;
    for (let i = 0; i < items.length; i++) {
      const col = i % cols;
      if (col === 0) ensureSpace(CARD_H + 4);
      const x = M + col * (colW + CARD_GAP);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, colW, CARD_H, 4, 4, "FD");

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.text(items[i].label.toUpperCase(), x + 9, y + 12);

      if (items[i].highlight) doc.setTextColor(21, 128, 61);
      else doc.setTextColor(15, 23, 42);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      const val = doc.splitTextToSize(String(items[i].value), colW - 18);
      doc.text(val[0] || "", x + 9, y + 27);

      if (col === cols - 1 || i === items.length - 1) y += ROW_H;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(22);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title, M, y);
    y += 10;
  };

  // ── Booking Details ──────────────────────────────────────────────────────────
  sectionTitle("BOOKING DETAILS");
  drawCards([
    { label: "Reference", value: booking.bookingReference },
    { label: "Direction", value: dirLabel },
    { label: "Passenger", value: booking.passengerName },
    { label: "Email", value: booking.passengerEmail },
    { label: "Status", value: booking.status.toUpperCase() },
  ], 2);
  y += 10;

  // ── Route Info ──────────────────────────────────────────────────────────────
  sectionTitle("ROUTE INFO");
  drawCards([
    { label: "Route Number", value: invoice.routeNumber },
    { label: "Route Name", value: `${invoice.startStop} - ${invoice.endStop}` },
    { label: "Start Stop", value: invoice.startStop },
    { label: "End Stop", value: invoice.endStop },
    { label: "Distance", value: invoice.distance !== "N/A" ? `${invoice.distance} km` : "N/A" },
    { label: "Full Journey Fare", value: invoice.fare, highlight: true },
  ], 2);
  y += 10;

  // ── Timetable (cards only — stops go to page 2) ─────────────────────────────
  if (slot) {
    sectionTitle("TIMETABLE");
    drawCards([
      { label: "Bus Type", value: slot.busType.replace(/_/g, " ").toUpperCase() },
      { label: "Direction", value: dirLabel },
      { label: "Departure", value: slot.departureTime },
      { label: "Travel Time", value: slot.avgTravelTime },
    ], 2);
    y += 10;
  }

  // ── Operational Data (always page 1) ─────────────────────────────────────────
  sectionTitle(`OPERATIONAL DATA  ·  ${dirLabel.toUpperCase()}`);
  drawCards([
    { label: "Slots This Direction", value: String(invoice.totals.directionSlots) },
    { label: "Next Slot", value: invoice.totals.nextSlot ?? "—" },
    { label: "Last Slot", value: invoice.totals.lastSlot },
  ], 3);
  y += 12;

  // ── Footer (page 1) ──────────────────────────────────────────────────────────
  ensureSpace(28);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(M, y, PW - M, y);
  y += 11;

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${invoice.generatedAt}`, M, y);
  doc.text("For support, contact LK Bus Radar with your reference ID.", PW - M, y, { align: "right" });

  // ── Page 2: Stops list ───────────────────────────────────────────────────────
  if (slot && slot.stops.length > 0) {
    doc.addPage();
    y = 44;

    // Page 2 mini-header bar
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, PW, 44, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Route Stops", M, 27);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${invoice.routeNumber}  ·  ${invoice.startStop} - ${invoice.endStop}  ·  ${dirLabel}`,
      PW - M, 27, { align: "right" }
    );

    y = 62;

    // Section label
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(`STOPS  ·  ${slot.stops.length}`, M, y);
    y += 8;

    // Table header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.rect(M, y, CW, 18, "FD");
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("#", M + 8, y + 12);
    doc.text("STOP NAME", M + 26, y + 12);
    doc.text("TIME", PW - M - 8, y + 12, { align: "right" });
    y += 18;

    const STOP_ROW = 17;
    for (let i = 0; i < slot.stops.length; i++) {
      // Page break within stops if needed
      if (y + STOP_ROW > PH - 44) {
        doc.addPage();
        y = 44;
        // Repeat table header on overflow page
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.rect(M, y, CW, 18, "FD");
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text("#", M + 8, y + 12);
        doc.text("STOP NAME", M + 26, y + 12);
        doc.text("TIME", PW - M - 8, y + 12, { align: "right" });
        y += 18;
      }

      const rowBg: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
      doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.3);
      doc.rect(M, y, CW, STOP_ROW, "FD");

      doc.setTextColor(148, 163, 184);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text(String(i + 1).padStart(2, "0"), M + 8, y + 11.5);

      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      const stopNameLine = doc.splitTextToSize(slot.stops[i].name, CW - 72)[0] || slot.stops[i].name;
      doc.text(stopNameLine, M + 26, y + 11.5);

      doc.setFont("helvetica", "bold");
      doc.text(slot.stops[i].time, PW - M - 8, y + 11.5, { align: "right" });
      y += STOP_ROW;
    }
  }

  doc.save(`invoice-${booking.bookingReference}.pdf`);
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function InvoicePage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/user"); return; }
    buildInvoice();
  }, [user, authLoading]);

  const buildInvoice = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const bookingRes = await safeFetch(API_ENDPOINTS.BOOKING_GET(bookingId), { headers });
      const booking: Booking = bookingRes.data?.data ?? bookingRes.data;
      if (!booking) throw new Error("Booking not found");

      const d = new Date(booking.travelDate);
      const dayType = d.getDay() === 0 || d.getDay() === 6 ? "weekend" : "weekday";

      const [metaRes, timetableRes] = await Promise.all([
        safeFetch(API_ENDPOINTS.ROUTE_META(booking.routeId), { headers }),
        safeFetch(API_ENDPOINTS.TIMETABLE(booking.routeId), { headers }),
      ]);

      const meta = metaRes.data?.data || {};
      const timetable: TimetableEntry[] = Array.isArray(timetableRes.data) ? timetableRes.data : [];
      const slotEntry = timetable.find((t) => String(t.runningSlotId) === String(booking.slotId));

      const routeNumber = meta.routeNumber || booking.route?.routeNumber || booking.routeId || "N/A";
      const startName = meta.startingBusStop?.name || booking.route?.start?.name || "N/A";
      const endName = meta.endingBusStop?.name || booking.route?.end?.name || "N/A";
      const distance = meta.meta?.averageDistanceKm || meta.routeDistance || meta.distanceKm || "N/A";
      const fareValue = meta.priceFullJourney ?? booking.route?.priceFullJourney;
      const fare = fareValue != null ? `LKR ${fareValue}` : "N/A";

      let slot: SlotInfo | null = null;
      if (slotEntry?.runningSlot) {
        const stops: any[] = Array.isArray(slotEntry.runningSlot.runningSlotBusStops)
          ? slotEntry.runningSlot.runningSlotBusStops : [];
        const orderedStops: SlotStop[] = stops.map((s) => ({
          name: s.busStop?.name || "N/A",
          time: formatTime(dayType === "weekend" ? s.weekendTime : s.weekdayTime),
        }));
        const depRaw = stops[0] ? (dayType === "weekend" ? stops[0].weekendTime : stops[0].weekdayTime) : null;
        const lastRaw = stops[stops.length - 1]
          ? dayType === "weekend" ? stops[stops.length - 1].weekendTime : stops[stops.length - 1].weekdayTime
          : null;
        const avgMinutes = minutesBetween(depRaw || undefined, lastRaw || undefined);
        slot = {
          slotId: String(slotEntry.runningSlotId),
          busType: slotEntry.runningSlot.runningNumber?.busType || "N/A",
          direction: slotEntry.runningSlot.runningDirection || "N/A",
          departureTime: formatTime(depRaw),
          stops: orderedStops,
          avgTravelTime: avgMinutes !== null ? `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m` : "N/A",
        };
      }

      const bookingDir = booking.direction;
      const dirSlots = timetable.filter(
        (t) => (t.runningSlot?.runningDirection || "").toLowerCase() === bookingDir
      );
      const dirDepartures = dirSlots
        .map((t) => {
          const ss: any[] = t.runningSlot?.runningSlotBusStops || [];
          const dep = dayType === "weekend" ? ss[0]?.weekendTime : ss[0]?.weekdayTime;
          return dep ? { slotId: String(t.runningSlotId), time: String(dep).padStart(4, "0") } : null;
        })
        .filter(Boolean) as { slotId: string; time: string }[];
      const sortedDirDeps = [...dirDepartures].sort((a, b) => a.time.localeCompare(b.time));
      const selectedDepTime = dirDepartures.find((d) => d.slotId === String(booking.slotId))?.time;
      let nextSlot: string | null = null;
      if (selectedDepTime) {
        const after = sortedDirDeps.filter((d) => d.time > selectedDepTime);
        nextSlot = after[0] ? formatTime(after[0].time) : null;
      }
      const lastSlotTime = sortedDirDeps[sortedDirDeps.length - 1]?.time;

      setInvoice({
        booking, routeNumber,
        routeName: `${startName} → ${endName}`,
        startStop: startName, endStop: endName,
        distance: distance ? String(distance) : "N/A",
        fare, routeId: meta._id || booking.routeId, slot,
        totals: {
          directionSlots: dirSlots.length,
          nextSlot,
          lastSlot: lastSlotTime ? formatTime(lastSlotTime) : "N/A",
        },
        generatedAt: new Date().toLocaleString(),
      });
    } catch {
      notify.error("Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      generateInvoicePDF(invoice);
    } catch {
      notify.error("Failed to generate PDF.");
    } finally {
      setDownloading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary opacity-30" size={40} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-slate-500 font-medium">Invoice not found.</p>
        <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  const { booking, slot } = invoice;
  const sc = STATUS_COLORS[booking.status] || STATUS_COLORS.confirmed;
  const dirLabel = slot?.direction?.toLowerCase() === "down" ? "Downward" : "Upward";

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      {/* Action bar */}
      <div className="max-w-2xl mx-auto mb-6 flex items-center justify-between">
        <Button variant="outline" className="rounded-xl font-bold" onClick={() => router.back()}>
          <ArrowLeft size={16} className="mr-2" /> Back
        </Button>
        <Button className="rounded-xl font-bold" onClick={handleDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 size={15} className="animate-spin mr-2" />
          ) : (
            <Download size={15} className="mr-2" />
          )}
          Download PDF
        </Button>
      </div>

      {/* Invoice preview */}
      <div className="max-w-2xl mx-auto bg-white rounded-2xl overflow-hidden shadow-xl border border-slate-200">
        {/* ── Hero header ── */}
        <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white p-7">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h1 className="text-2xl font-black tracking-tight">Booking Invoice</h1>
              <p className="text-sm opacity-80 mt-1 font-medium">
                LK Bus Radar · {booking.bookingReference}
              </p>
            </div>
            <span
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border",
                sc.bg, sc.text, sc.border
              )}
            >
              {booking.status}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Start</p>
                <p className="font-black text-sm leading-tight">{invoice.startStop}</p>
              </div>
              <div className="flex justify-center">
                <svg viewBox="0 0 60 32" className="w-full" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="6" cy="16" r="5" fill="white" />
                  <path d="M11 16 H24" stroke="white" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
                  <rect x="24" y="9" width="16" height="12" rx="2" fill="rgba(255,255,255,0.25)" stroke="white" strokeWidth="1.5" />
                  <circle cx="29" cy="23" r="3" fill="white" />
                  <circle cx="35" cy="23" r="3" fill="white" />
                  <path d="M40 16 H54" stroke="white" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
                  <circle cx="54" cy="16" r="5" fill="white" />
                </svg>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">End</p>
                <p className="font-black text-sm leading-tight">{invoice.endStop}</p>
              </div>
            </div>
            <div className="flex justify-between mt-3">
              <span className="bg-white/20 rounded-lg px-2.5 py-1 text-xs font-bold">
                Route {invoice.routeNumber}
              </span>
              <span className="bg-white/20 rounded-lg px-2.5 py-1 text-xs font-bold">
                {dirLabel}
              </span>
            </div>
          </div>
        </div>

        {/* ── Invoice body ── */}
        <div className="p-7 space-y-6">
          <div className="flex justify-between items-start pb-5 border-b border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Route</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{invoice.routeNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Travel Date</p>
              <p className="text-base font-black text-slate-900 mt-1">
                {format(new Date(booking.travelDate), "EEEE, MMMM d yyyy")}
              </p>
            </div>
          </div>

          <Section title="Booking Details">
            <Grid>
              <InfoCard label="Reference" value={booking.bookingReference} mono />
              <InfoCard label="Direction" value={dirLabel} />
              <InfoCard label="Passenger" value={booking.passengerName} />
              <InfoCard label="Email" value={booking.passengerEmail} />
              <InfoCard label="Status" value={booking.status.toUpperCase()} />
            </Grid>
          </Section>

          <Section title="Route Info">
            <Grid>
              <InfoCard label="Route Number" value={invoice.routeNumber} />
              <InfoCard label="Route Name" value={invoice.routeName} />
              <InfoCard label="Start Stop" value={invoice.startStop} />
              <InfoCard label="End Stop" value={invoice.endStop} />
              <InfoCard
                label="Distance"
                value={invoice.distance !== "N/A" ? `${invoice.distance} km` : "N/A"}
              />
              <InfoCard label="Full Journey Fare" value={invoice.fare} highlight />
            </Grid>
          </Section>

          {slot && (
            <Section title="Timetable">
              <Grid>
                <InfoCard label="Bus Type" value={slot.busType.replace(/_/g, " ").toUpperCase()} />
                <InfoCard label="Direction" value={dirLabel} />
                <InfoCard label="Departure" value={slot.departureTime} />
                <InfoCard label="Travel Time" value={slot.avgTravelTime} />
              </Grid>

              {slot.stops.length > 0 && (
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Stops · {slot.stops.length}
                    </p>
                  </div>
                  {slot.stops.map((s, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex justify-between items-center px-4 py-2.5 text-sm font-bold",
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                        i < slot.stops.length - 1 && "border-b border-slate-100"
                      )}
                    >
                      <span className="text-slate-700">
                        <span className="text-slate-400 font-mono text-xs mr-2">{String(i + 1).padStart(2, "0")}</span>
                        {s.name}
                      </span>
                      <span className="text-slate-500 font-mono tabular-nums text-xs">{s.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          <Section title={`Operational Data · ${dirLabel}`}>
            <Grid cols={3}>
              <InfoCard label="Slots This Direction" value={String(invoice.totals.directionSlots)} />
              <InfoCard label="Next Slot" value={invoice.totals.nextSlot ?? "—"} />
              <InfoCard label="Last Slot" value={invoice.totals.lastSlot} />
            </Grid>
          </Section>

          <div className="pt-5 border-t border-slate-100 flex justify-between items-end">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Generated</p>
              <p className="text-xs text-slate-500 mt-1">{invoice.generatedAt}</p>
            </div>
            <p className="text-[10px] text-slate-400 text-right max-w-[200px]">
              For support, contact LK Bus Radar with your reference ID.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</p>
      {children}
    </div>
  );
}

function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div className={cn("grid gap-3", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {children}
    </div>
  );
}

function InfoCard({
  label, value, mono, highlight,
}: {
  label: string; value: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{label}</p>
      <p className={cn(
        "text-sm font-bold mt-1 text-slate-900 break-words",
        mono && "font-mono",
        highlight && "text-emerald-700"
      )}>
        {value}
      </p>
    </div>
  );
}
