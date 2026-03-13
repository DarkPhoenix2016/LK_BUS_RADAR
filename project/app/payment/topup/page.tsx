"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { API_ENDPOINTS, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, Wallet, Coins, AlertTriangle,
} from "lucide-react";
import { notify } from "@/lib/notify";

export default function TopupPaymentPage() {
  return (
    <Suspense>
      <TopupPaymentInner />
    </Suspense>
  );
}

function TopupPaymentInner() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const amount = parseInt(searchParams.get("amount") || "0", 10);
  const [paying, setPaying] = useState<"pass" | "fail" | null>(null);
  const [result, setResult] = useState<"pass" | "fail" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/user");
  }, [authLoading, user]);

  if (!amount || amount <= 0 || amount > 10000) {
    return (
      <div className="p-6 max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-black text-slate-800">Invalid Amount</h2>
        <p className="text-slate-500 text-sm">Amount must be between 1 and 10,000.</p>
        <Button onClick={() => router.push("/wallet")} className="rounded-xl">Back to Wallet</Button>
      </div>
    );
  }

  const handlePayment = async (payResult: "pass" | "fail") => {
    if (!user) return;
    setPaying(payResult);
    setErrorMsg("");

    if (payResult === "fail") {
      setResult("fail");
      setPaying(null);
      notify.warning("Payment was not completed.", { description: "No points were added." });
      return;
    }

    const token = await user.getIdToken();
    const { data, error } = await safeFetch(API_ENDPOINTS.USER_POINTS_TOPUP, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });

    if (error || !data?.success) {
      const msg = error || "Top-up failed";
      setErrorMsg(msg);
      notify.error("Top-up failed.", { description: msg });
      setPaying(null);
      return;
    }

    setResult("pass");
    notify.success(`${amount.toLocaleString()} points added to your wallet.`);
    setPaying(null);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-primary opacity-30" size={40} />
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
          <h1 className="text-3xl font-black text-slate-900 mb-2">Top-Up Successful!</h1>
          <p className="text-slate-500">Your wallet has been credited.</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-6 w-full text-white text-center">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Points Added</p>
          <p className="text-4xl font-black">+{amount.toLocaleString()}</p>
          <p className="text-xs opacity-70 mt-1">≈ LKR {amount.toLocaleString()}</p>
        </div>
        <Button className="w-full h-12 rounded-xl font-bold" onClick={() => router.push("/wallet")}>
          <Wallet size={15} className="mr-2" /> View Wallet
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
          <p className="text-slate-500">No points were added to your wallet.</p>
        </div>
        <div className="flex gap-3 w-full">
          <Button variant="outline" className="flex-1 h-12 rounded-xl font-bold" onClick={() => router.push("/wallet")}>
            Back to Wallet
          </Button>
          <Button className="flex-1 h-12 rounded-xl font-bold" onClick={() => setResult(null)}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-amber-500 p-3 rounded-2xl shadow-lg shadow-amber-500/20">
          <Coins className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Wallet Top-Up</h1>
          <p className="text-slate-500 font-medium text-sm">Add points to your wallet</p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Type</span>
          <span className="font-bold text-slate-800">Wallet Top-Up</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Points to Add</span>
          <span className="font-black text-amber-600 text-lg">+{amount.toLocaleString()} pts</span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount Due</span>
          <span className="font-black text-lg text-slate-900">LKR {amount.toLocaleString()}.00</span>
        </div>
      </div>

      {/* Simulation notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <ShieldCheck size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-800">Payment Simulation</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This is a demo environment. Use the buttons below to simulate a payment outcome.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-red-600 font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Payment buttons */}
      <div className="grid grid-cols-2 gap-4">
        <Button
          size="lg"
          className="h-14 rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
          onClick={() => handlePayment("pass")}
          disabled={!!paying}
        >
          {paying === "pass" ? (
            <Loader2 size={18} className="animate-spin mr-2" />
          ) : (
            <CheckCircle2 size={18} className="mr-2" />
          )}
          Payment Success
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50"
          onClick={() => handlePayment("fail")}
          disabled={!!paying}
        >
          {paying === "fail" ? (
            <Loader2 size={18} className="animate-spin mr-2" />
          ) : (
            <XCircle size={18} className="mr-2" />
          )}
          Payment Failed
        </Button>
      </div>
    </div>
  );
}
