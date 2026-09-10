import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface PanelSupabaseConfig {
  url: string;
  anonKey: string;
}

const URL_KEY = "tuorden_panel_supabase_url";
const ANON_KEY = "tuorden_panel_supabase_anon";
const EMAIL_KEY = "tuorden_panel_email";
const INTERVAL_KEY = "tuorden_panel_interval_min";
const INCLUDE_COSTS_KEY = "tuorden_panel_include_costs";
const LAST_PUSH_KEY = "tuorden_panel_last_push";

let client: SupabaseClient | null = null;
let clientKey = "";

export function getPanelConfig(): PanelSupabaseConfig {
  try {
    return {
      url: localStorage.getItem(URL_KEY) ?? "",
      anonKey: localStorage.getItem(ANON_KEY) ?? "",
    };
  } catch {
    return { url: "", anonKey: "" };
  }
}

export function savePanelConfig(cfg: PanelSupabaseConfig) {
  try {
    localStorage.setItem(URL_KEY, cfg.url.trim());
    localStorage.setItem(ANON_KEY, cfg.anonKey.trim());
  } catch {}
  client = null;
}

export function getPanelClient(): SupabaseClient | null {
  const { url, anonKey } = getPanelConfig();
  if (!url || !anonKey) return null;
  const key = `${url}|${anonKey.slice(0, 12)}`;
  if (!client || clientKey !== key) {
    try {
      client = createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: "tuorden-panel-auth" },
      });
      clientKey = key;
    } catch {
      return null;
    }
  }
  return client;
}

export function getPanelEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPanelEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email.trim());
  } catch {}
}

export function getPanelIntervalMin(): number {
  try {
    const v = Number(localStorage.getItem(INTERVAL_KEY) ?? "5");
    if ([0, 1, 5, 15, 30, 60].includes(v)) return v;
    return 5;
  } catch {
    return 5;
  }
}

export function setPanelIntervalMin(v: number) {
  try {
    localStorage.setItem(INTERVAL_KEY, String(v));
  } catch {}
}

export function getPanelIncludeCosts(): boolean {
  try {
    return (localStorage.getItem(INCLUDE_COSTS_KEY) ?? "1") === "1";
  } catch {
    return true;
  }
}

export function setPanelIncludeCosts(v: boolean) {
  try {
    localStorage.setItem(INCLUDE_COSTS_KEY, v ? "1" : "0");
  } catch {}
}

export function getLastPush(): string | null {
  try {
    return localStorage.getItem(LAST_PUSH_KEY);
  } catch {
    return null;
  }
}

export function setLastPush(iso: string) {
  try {
    localStorage.setItem(LAST_PUSH_KEY, iso);
  } catch {}
}
