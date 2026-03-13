"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  fetchAdminConfigMap,
  formatConfigValue,
  getAdminToken,
  normalizeConfigInput,
  type AdminConfigMap,
  type AdminConfigValue,
} from "@/lib/admin-configs";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const CONFIG_META = [
  { key: "bus_types", title: "Bus Types", placeholder: "Add bus type" },
  { key: "stop_types", title: "Stop Types", placeholder: "Add stop type" },
  { key: "geofence_radius", title: "Geofence Radius", placeholder: "Add radius" },
] as const;

export default function AdminConfigsPage() {
  const [configMap, setConfigMap] = useState<AdminConfigMap>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    void loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    try {
      setConfigMap(await fetchAdminConfigMap());
    } catch {
      notify.error("Failed to load configs.");
    } finally {
      setLoading(false);
    }
  }

  function setDraft(key: string, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function addValue(key: string) {
    const raw = (drafts[key] || "").trim();
    if (!raw) return;

    const nextValue = normalizeConfigInput(key, raw);
    if (nextValue === null) {
      notify.warning(key === "geofence_radius" ? "Geofence radius must be a number." : "Enter a valid value.");
      return;
    }

    setConfigMap((prev) => {
      const current = prev[key] || [];
      if (current.some((value) => String(value) === String(nextValue))) return prev;
      return { ...prev, [key]: [...current, nextValue] };
    });
    setDraft(key, "");
  }

  function removeValue(key: string, value: AdminConfigValue) {
    setConfigMap((prev) => ({
      ...prev,
      [key]: (prev[key] || []).filter((item) => String(item) !== String(value)),
    }));
  }

  async function saveConfig(key: string) {
    setSavingKey(key);
    try {
      const token = await getAdminToken();
      const values = configMap[key] || [];
      const res = await fetch(`${BASE}/admin/fleet/configs/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!data?.success) {
        notify.error(data?.error || "Failed to save config.");
        return;
      }

      setConfigMap((prev) => ({ ...prev, [key]: data.data?.values || values }));
      notify.success("Config updated.");
    } catch {
      notify.error("Failed to save config.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="bg-primary p-3 rounded-2xl shadow-lg shadow-primary/20">
          <Settings2 className="text-white" size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900">Configs</h1>
          <p className="text-slate-500 text-sm">Manage dropdown values used across the admin portal.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {CONFIG_META.map(({ key, title, placeholder }) => (
            <div key={key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <div>
                <p className="text-sm font-black text-slate-800 uppercase tracking-widest">{title}</p>
                <p className="text-xs text-slate-400 mt-1">{(configMap[key] || []).length} values</p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={drafts[key] || ""}
                  onChange={(e) => setDraft(key, e.target.value)}
                  placeholder={placeholder}
                  className="rounded-xl"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addValue(key);
                    }
                  }}
                />
                <Button type="button" variant="outline" className="rounded-xl shrink-0" onClick={() => addValue(key)}>
                  <Plus size={14} />
                </Button>
              </div>

              <div className="min-h-32 rounded-2xl border border-slate-100 bg-slate-50 p-3 flex flex-wrap gap-2 content-start">
                {(configMap[key] || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No values configured.</p>
                ) : (
                  (configMap[key] || []).map((value) => (
                    <div
                      key={`${key}-${value}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
                    >
                      <span>{formatConfigValue(value)}</span>
                      <button
                        type="button"
                        className="text-slate-300 hover:text-red-500"
                        onClick={() => removeValue(key, value)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <Button className="w-full rounded-xl" onClick={() => saveConfig(key)} disabled={savingKey === key}>
                {savingKey === key ? <Loader2 size={14} className="animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
