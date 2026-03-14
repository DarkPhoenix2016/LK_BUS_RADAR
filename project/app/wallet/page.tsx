"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "@/components/ui/AuthModal";
import { API_ENDPOINTS, PointTransaction, safeFetch } from "@/services/transportApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArrowDownLeft, ArrowUpRight, Coins, Loader2, Search, TrendingUp, UserCircle, Wallet,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const TX_PER_PAGE = 20;

type TxFilter = "all" | "credit" | "debit";

export default function WalletPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [showAuth, setShowAuth] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [pointBalance, setPointBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [topupAmount, setTopupAmount] = useState("");

  const [txFilter, setTxFilter] = useState<TxFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [txPage, setTxPage] = useState(1);

  useEffect(() => {
    if (user) loadWallet();
  }, [user]);

  const loadWallet = async () => {
    if (!user) return;
    setWalletLoading(true);
    const token = await user.getIdToken();
    const { data } = await safeFetch(API_ENDPOINTS.USER_POINTS, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.success) {
      setPointBalance(data.data.balance ?? 0);
      setTransactions(data.data.transactions || []);
    } else {
      notify.error("Failed to load wallet details.");
    }
    setWalletLoading(false);
  };

  const handleProceedToTopup = () => {
    const amount = parseInt(topupAmount, 10);
    if (!amount || amount <= 0 || amount > 10000 || !Number.isInteger(amount)) {
      notify.warning("Enter a whole number between 1 and 10,000.");
      return;
    }
    router.push(`/payment/topup?amount=${amount}`);
  };

  const allFiltered = useMemo(() => {
    const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

    return transactions.filter((tx) => {
      if (txFilter === "credit" && tx.amount <= 0) return false;
      if (txFilter === "debit" && tx.amount >= 0) return false;
      if (searchTerm.trim() && !tx.description.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;

      const createdTs = new Date(tx.createdAt).getTime();
      if (fromTs && createdTs < fromTs) return false;
      if (toTs && createdTs > toTs) return false;

      return true;
    });
  }, [transactions, txFilter, searchTerm, fromDate, toDate]);

  const txTotalPages = Math.max(1, Math.ceil(allFiltered.length / TX_PER_PAGE));
  const txSafePage = Math.min(txPage, txTotalPages);
  const filteredTransactions = allFiltered.slice((txSafePage - 1) * TX_PER_PAGE, txSafePage * TX_PER_PAGE);

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
          <UserCircle className="text-slate-300" size={48} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Wallet</h1>
          <p className="text-slate-500">Sign in to view wallet details and transactions.</p>
        </div>
        <Button className="h-12 px-8 rounded-xl font-bold" onClick={() => setShowAuth(true)}>
          Sign In / Create Account
        </Button>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-4">
        <div className="bg-amber-500 p-3 rounded-2xl shadow-lg shadow-amber-500/20">
          <Wallet className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Wallet</h1>
          <p className="text-slate-500 font-medium text-sm">Track balance and transactions</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-80 flex items-center gap-1.5">
                <Coins size={13} /> Points Wallet
              </p>
              <p className="text-4xl font-black mt-1">
                {walletLoading ? "—" : pointBalance.toLocaleString()}
              </p>
              <p className="text-xs opacity-70 mt-0.5">1 point = LKR 1.00</p>
            </div>
            <TrendingUp size={40} className="opacity-20" />
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Top-Up via Payment Gateway</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">LKR</span>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="h-10 pl-12 rounded-xl flex-1"
                  onKeyDown={(e) => e.key === "Enter" && handleProceedToTopup()}
                />
              </div>
              <Button
                className="h-10 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-600 shrink-0"
                onClick={handleProceedToTopup}
                disabled={!topupAmount}
              >
                Proceed to Payment
              </Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopupAmount(String(amt))}
                  className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-xs font-bold text-slate-600 transition-colors"
                >
                  + {amt.toLocaleString()}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Max LKR 10,000 per transaction · 1 LKR = 1 point</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Search</Label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setTxPage(1); }}
                placeholder="Search by description"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Type</Label>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden h-10">
              <button
                className={cn("px-3 text-xs font-bold", txFilter === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600")}
                onClick={() => { setTxFilter("all"); setTxPage(1); }}
              >
                All
              </button>
              <button
                className={cn("px-3 text-xs font-bold border-l border-slate-200", txFilter === "credit" ? "bg-emerald-600 text-white" : "bg-white text-slate-600")}
                onClick={() => { setTxFilter("credit"); setTxPage(1); }}
              >
                Credit
              </button>
              <button
                className={cn("px-3 text-xs font-bold border-l border-slate-200", txFilter === "debit" ? "bg-red-500 text-white" : "bg-white text-slate-600")}
                onClick={() => { setTxFilter("debit"); setTxPage(1); }}
              >
                Debit
              </button>
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">From</Label>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setTxPage(1); }} className="h-10 rounded-xl" />
          </div>

          <div>
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">To</Label>
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setTxPage(1); }} className="h-10 rounded-xl" />
          </div>
        </div>

        {walletLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-primary opacity-30" size={24} />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
            <p className="text-sm text-slate-400 font-bold">No transactions match your filters</p>
            <Button variant="outline" className="mt-3 rounded-xl" onClick={() => {
              setTxFilter("all");
              setSearchTerm("");
              setFromDate("");
              setToDate("");
              setTxPage(1);
            }}>
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Transaction History</p>
              <Badge variant="outline" className="text-[10px] font-black border-slate-200 text-slate-600 bg-slate-50">
                {allFiltered.length} item(s)
              </Badge>
            </div>
            {filteredTransactions.map((tx) => (
              <div key={tx._id} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", tx.amount > 0 ? "bg-emerald-100" : "bg-red-100")}>
                  {tx.amount > 0 ? (
                    <ArrowUpRight size={16} className="text-emerald-600" />
                  ) : (
                    <ArrowDownLeft size={16} className="text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{tx.description}</p>
                  <p className="text-[11px] text-slate-400">
                    {format(new Date(tx.createdAt), "MMM d, yyyy · h:mm a")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-sm font-black", tx.amount > 0 ? "text-emerald-600" : "text-red-500")}>
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">{tx.balanceAfter.toLocaleString()} pts</p>
                </div>
              </div>
            ))}
            {txTotalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-400">Page {txSafePage} of {txTotalPages} · {allFiltered.length} transactions</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" disabled={txSafePage <= 1} onClick={() => setTxPage(p => p - 1)}>
                    <ChevronLeft size={14} /> Prev
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl" disabled={txSafePage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
                    Next <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" className="rounded-xl" onClick={() => router.push("/user")}>
          Back to Profile
        </Button>
      </div>
    </div>
  );
}
