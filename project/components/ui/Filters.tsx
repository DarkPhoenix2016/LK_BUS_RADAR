"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type FilterOption = "all" | "online" | "offline";

interface MapFiltersProps {
    selected: FilterOption;
    onChange: (option: FilterOption) => void;
}

const options: { id: FilterOption; label: string }[] = [
    { id: "all", label: "Show All" },
    { id: "online", label: "Online Only" },
    { id: "offline", label: "Offline Only" },
];

export function MapFilters({ selected, onChange }: MapFiltersProps) {
    return (
        <div className="flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/20 gap-1 overflow-hidden">
            {options.map((option) => (
                <button
                    key={option.id}
                    onClick={() => onChange(option.id)}
                    className={cn(
                        "relative px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap",
                        selected === option.id
                            ? "text-white"
                            : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    {selected === option.id && (
                        <motion.div
                            layoutId="mapFilterBg"
                            className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-md shadow-primary/20"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                        />
                    )}
                    {option.label}
                </button>
            ))}
        </div>
    );
}
