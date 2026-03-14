"use client";

import { useState } from "react";
import useSWR from "swr";
import { API_ENDPOINTS, BusStandContact, fetcher } from "@/services/transportApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Search, MapPin, ChevronDown, PhoneCall, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";

const PER_PAGE = 15;

export default function BusStandsPage() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [search, setSearch] = useState("");
  const [districtOpen, setDistrictOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: districtsData } = useSWR(API_ENDPOINTS.BUS_STANDS_DISTRICTS, fetcher);
  const districts: string[] = districtsData?.data || [];

  const params = new URLSearchParams();
  if (selectedDistrict) params.set("district", selectedDistrict);
  if (search.trim()) params.set("search", search.trim());
  const queryUrl = `${API_ENDPOINTS.BUS_STANDS}?${params.toString()}`;

  const { data: contactsData, isLoading } = useSWR(queryUrl, fetcher);
  const contacts: BusStandContact[] = contactsData?.data || [];

  const totalPages = Math.max(1, Math.ceil(contacts.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageContacts = contacts.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleCopy = (phone: string) => {
    navigator.clipboard.writeText(phone);
    notify.success("Phone number copied.");
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <Phone className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bus Stand Contacts</h1>
          <p className="text-slate-500 text-sm">Find contact numbers for bus stands by district</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* District dropdown */}
        <div className="relative">
          <button
            onClick={() => setDistrictOpen((v) => !v)}
            className="flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors min-w-[180px] justify-between"
          >
            <MapPin size={14} className="text-primary shrink-0" />
            <span className="truncate flex-1 text-left">{selectedDistrict || "All Districts"}</span>
            <ChevronDown size={14} className={cn("transition-transform shrink-0", districtOpen && "rotate-180")} />
          </button>
          {districtOpen && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden min-w-[220px] max-h-72 overflow-y-auto">
              <button
                onClick={() => { setSelectedDistrict(""); setDistrictOpen(false); setPage(1); }}
                className={cn("w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50", !selectedDistrict && "bg-primary/5 text-primary font-bold")}
              >
                All Districts
              </button>
              {districts.map((d) => (
                <button
                  key={d}
                  onClick={() => { setSelectedDistrict(d); setDistrictOpen(false); setPage(1); }}
                  className={cn("w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 border-t border-slate-50", selectedDistrict === d && "bg-primary/5 text-primary font-bold")}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search bus stand name..."
            className="pl-9 h-11 rounded-xl"
          />
        </div>
      </div>

      {/* Active district badge */}
      {selectedDistrict && (
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 font-bold px-3 py-1 text-xs">
            {selectedDistrict}
          </Badge>
          <button
            onClick={() => setSelectedDistrict("")}
            className="text-xs text-slate-400 hover:text-slate-700 font-bold underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-20 text-center">
          <Phone size={36} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 font-bold">No bus stand contacts found</p>
          {(search || selectedDistrict) && (
            <Button variant="outline" className="mt-3 rounded-xl" onClick={() => { setSearch(""); setSelectedDistrict(""); setPage(1); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              {contacts.length} result{contacts.length !== 1 ? "s" : ""}
              {totalPages > 1 && ` · page ${safePage} of ${totalPages}`}
            </p>
          </div>
          {pageContacts.map((c) => (
            <div key={c._id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900 text-base truncate">{c.location}</p>
                <p className="text-xs font-bold text-slate-400 mt-0.5">{c.district}</p>
                <p className="text-sm font-bold text-slate-700 mt-1 font-mono">{c.phoneNumber}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a href={`tel:${c.phoneNumber}`}>
                  <Button size="sm" className="rounded-xl h-9 font-bold bg-emerald-500 hover:bg-emerald-600 w-full">
                    <PhoneCall size={13} className="mr-1.5" /> Call
                  </Button>
                </a>
                <Button size="sm" variant="outline" className="rounded-xl h-9 font-bold" onClick={() => handleCopy(c.phoneNumber)}>
                  <Copy size={12} className="mr-1.5" /> Copy
                </Button>
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-400">Page {safePage} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
