"use client";

import { motion } from "framer-motion";
import { Route as RouteIcon, MapPin, ChevronRight, Activity } from "lucide-react";
import { Route } from "@/services/transportApi";

interface RouteCardProps {
    route: Route;
    activeBusesCount?: number;
    onClick: () => void;
}

export function RouteCard({ route, activeBusesCount = 0, onClick }: RouteCardProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.01, translateY: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={onClick}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-50 p-3 rounded-2xl transition-colors group-hover:bg-blue-100">
                        <RouteIcon className="text-blue-600" size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900 tracking-tight italic">Route {route.routeNumber}</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">
                            {route.routeDistance || "—"} KM Journey
                        </p>
                    </div>
                </div>

                {activeBusesCount > 0 && (
                    <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 font-bold text-[10px] px-3 py-1.5 rounded-full border border-emerald-100 animate-pulse">
                        <Activity size={10} />
                        {activeBusesCount} BUSES LIVE
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4 mb-2">
                <div className="flex-1">
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-0.5 ml-1">From</p>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm font-bold text-slate-700 truncate">
                        {route.start?.name || "Starting Point"}
                    </div>
                </div>
                <div className="pt-4 text-slate-200">
                    <ArrowRightTail />
                </div>
                <div className="flex-1 text-right">
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-0.5 mr-1">To</p>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm font-bold text-slate-700 truncate">
                        {route.end?.name || "Terminal Stop"}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function ArrowRightTail() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
