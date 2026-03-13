"use client";

import { motion } from "framer-motion";
import { Bus as BusIcon, Users, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EnrichedDevice } from "@/data/transportBuilder";

interface BusCardProps {
    device: EnrichedDevice;
    onClick: () => void;
}

export function BusCard({ device, onClick }: BusCardProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.01, translateY: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={onClick}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center gap-5"
        >
            <div className={`p-4 rounded-2xl flex-shrink-0 transition-colors ${device.isOnline ? "bg-emerald-50 group-hover:bg-emerald-100" : "bg-slate-50 group-hover:bg-slate-100"}`}>
                <BusIcon className={device.isOnline ? "text-emerald-600" : "text-slate-400"} size={28} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black text-slate-900 truncate uppercase tracking-tight">{device.busNumber}</h3>
                    <Badge variant={device.isOnline ? "default" : "secondary"} className={`text-[9px] px-1.5 py-0 ${device.isOnline ? "bg-emerald-500 hover:bg-emerald-500" : ""}`}>
                        {device.isOnline ? "LIVE" : "OFF"}
                    </Badge>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <span className="text-primary italic">Route</span>
                        <span className="text-slate-600 font-black italic">{device.routeNumber}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <Users size={12} className="text-slate-300" />
                        <span>48 Seats</span>
                    </div>
                </div>
            </div>

            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-50 p-2 rounded-full text-slate-400">
                <ChevronRight size={20} />
            </div>
        </motion.div>
    );
}
