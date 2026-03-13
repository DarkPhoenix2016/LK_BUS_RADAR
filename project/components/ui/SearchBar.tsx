"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Route as RouteIcon, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Route, API_ENDPOINTS } from "@/services/transportApi";
import { cn } from "@/lib/utils";

interface StopSuggestion {
  id: string;
  name: string;
}

interface SearchBarProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
  routes?: Route[];
  onRouteSelect?: (routeId: string) => void;
  onStopSelect?: (stopId: string, stopName: string) => void;
  showDropdown?: boolean;
}

export function SearchBar({ onSearch, placeholder, routes = [], onRouteSelect, onStopSelect, showDropdown = false }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [stopSuggestions, setStopSuggestions] = useState<StopSuggestion[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const routeSuggestions = showDropdown && query.trim().length > 0
    ? routes.filter((r) => {
        const q = query.toLowerCase();
        return (
          r.routeNumber?.toLowerCase().startsWith(q) ||
          r.start?.name?.toLowerCase().startsWith(q) ||
          r.end?.name?.toLowerCase().startsWith(q)
        );
      }).slice(0, 5)
    : [];

  const allSuggestions = [
    ...routeSuggestions.map((r) => ({ type: "route" as const, route: r })),
    ...stopSuggestions.map((s) => ({ type: "stop" as const, stop: s })),
  ];

  const noResults = showDropdown && query.trim().length > 0 && allSuggestions.length === 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);
    setIsOpen(true);
    onSearch?.(val);

    clearTimeout(debounceRef.current);
    if (val.trim().length >= 2 && onStopSelect) {
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(API_ENDPOINTS.BUS_STOPS_SEARCH(val.trim()));
          const data = await res.json();
          if (data.success) setStopSuggestions((data.data || []).slice(0, 4));
        } catch {
          setStopSuggestions([]);
        }
      }, 300);
    } else {
      setStopSuggestions([]);
    }
  }, [onSearch, onStopSelect]);

  const handleSelectRoute = useCallback((route: Route) => {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
    setStopSuggestions([]);
    onSearch?.("");
    onRouteSelect?.(route.id);
  }, [onSearch, onRouteSelect]);

  const handleSelectStop = useCallback((stop: StopSuggestion) => {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
    setStopSuggestions([]);
    onSearch?.("");
    onStopSelect?.(stop.id, stop.name);
  }, [onSearch, onStopSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0 && allSuggestions[activeIndex]) {
      e.preventDefault();
      const item = allSuggestions[activeIndex];
      if (item.type === "route") handleSelectRoute(item.route);
      else handleSelectStop(item.stop);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const clear = () => {
    setQuery("");
    setIsOpen(false);
    setStopSuggestions([]);
    onSearch?.("");
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors z-10">
          <Search size={18} />
        </div>
        <Input
          className="w-full h-12 pl-12 pr-10 bg-white border-slate-200 rounded-2xl shadow-sm focus:ring-primary focus:border-primary transition-all text-sm font-medium placeholder:text-slate-400"
          placeholder={placeholder || "Search routes, stops..."}
          value={query}
          onChange={handleChange}
          onFocus={() => query.trim() && setIsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && isOpen && query.trim().length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden max-h-80 overflow-y-auto">
          {noResults ? (
            <div className="px-5 py-8 text-center">
              <RouteIcon size={24} className="mx-auto text-slate-200 mb-2" />
              <p className="text-sm font-bold text-slate-400">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-slate-300 mt-1">Try searching by route number or stop name</p>
            </div>
          ) : (
            <ul>
              {routeSuggestions.length > 0 && (
                <li className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Routes</span>
                </li>
              )}
              {routeSuggestions.map((route, i) => (
                <li key={`r-${route.id}`}>
                  <button
                    className={cn(
                      "w-full px-5 py-3 flex items-center gap-4 text-left transition-colors",
                      i === activeIndex ? "bg-primary/5" : "hover:bg-slate-50"
                    )}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectRoute(route); }}
                  >
                    <div className="bg-slate-100 rounded-xl px-2 py-1 shrink-0">
                      <span className="text-xs font-black text-slate-700 italic">{route.routeNumber}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {route.start?.name || "—"} → {route.end?.name || "—"}
                      </p>
                      {route.routeDistance && (
                        <p className="text-[10px] text-slate-400 font-medium">{route.routeDistance} km</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}

              {stopSuggestions.length > 0 && (
                <li className={cn("px-4 pb-1", routeSuggestions.length > 0 ? "pt-2 border-t border-slate-50 mt-1" : "pt-3")}>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bus Stops</span>
                </li>
              )}
              {stopSuggestions.map((stop, i) => {
                const idx = routeSuggestions.length + i;
                return (
                  <li key={`s-${stop.id}`}>
                    <button
                      className={cn(
                        "w-full px-5 py-3 flex items-center gap-3 text-left transition-colors",
                        idx === activeIndex ? "bg-emerald-50" : "hover:bg-slate-50"
                      )}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => { e.preventDefault(); handleSelectStop(stop); }}
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                        <MapPin size={14} className="text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{stop.name}</p>
                        <p className="text-[10px] text-emerald-600 font-bold">Show routes via this stop</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
