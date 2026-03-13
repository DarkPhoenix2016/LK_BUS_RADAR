"use client";

import L from "leaflet";
import { Bus } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

export const createBusIcon = (isOnline: boolean, routeNumber: string, isSelected = false) => {
    const color = isOnline ? "var(--bus-online)" : "var(--bus-offline)";
    const glowColor = isOnline ? "#22c55e" : "#94a3b8";

    const html = renderToStaticMarkup(
        <div className="relative flex flex-col items-center">
            {isSelected && (
                <div style={{
                    position: "absolute",
                    top: "-8px", left: "-8px",
                    width: "56px", height: "56px",
                    borderRadius: "18px",
                    background: `${glowColor}33`,
                    animation: "lk-bus-pulse 1.4s ease-out infinite",
                    zIndex: -1,
                }} />
            )}
            <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-2 border-white transition-all transform hover:scale-110 active:scale-95 custom-bus-marker"
                style={{
                    backgroundColor: color,
                    boxShadow: isSelected ? `0 0 0 3px white, 0 0 0 5px ${glowColor}` : undefined,
                }}
            >
                <Bus className="text-white w-6 h-6" />
            </div>
            <div className="mt-1 bg-white px-2 py-0.5 rounded-full shadow-sm border border-slate-100">
                <span className="text-[10px] font-black text-slate-800 tracking-tighter leading-none">{routeNumber}</span>
            </div>
            <style>{`
                @keyframes lk-bus-pulse {
                    0% { transform: scale(0.85); opacity: 0.7; }
                    70% { transform: scale(1.6); opacity: 0; }
                    100% { transform: scale(1.6); opacity: 0; }
                }
            `}</style>
        </div>
    );

    return L.divIcon({
        html,
        className: "custom-div-icon",
        iconSize: [40, 52],
        iconAnchor: [20, 52],
    });
};
