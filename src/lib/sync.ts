import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { api } from "./api";

// Reusa URL/anon ya configuradas del panel para no pedirlas de nuevo.
const URL_KEY = "tuorden_panel_supabase_url";
const ANON_KEY = "tuorden_panel_supabase_anon";
const INTERVAL_KEY = "tuorden_sync_interval_min";
const LAST_SYNC_KEY = "tuorden_sync_last";

let client: SupabaseClient | null = null;
let clientKey = "";

function readLS(k: string): string {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}

function writeLS(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

export function getRelayConfig(): { url: string; anonKey: string } {
  return { url: readLS(URL_KEY).trim(), anonKey: readLS(ANON_KEY).trim() };
}

export function saveRelayConfig(url: string, anonKey: string) {
  writeLS(URL_KEY, url.trim());
  writeLS(ANON_KEY, anonKey.trim());
  client = null;
}

export function getRelayClient(): SupabaseClient | null {
  const { url, anonKey } = getRelayConfig();
  if (!url || !anonKey) return null;
  const key = `${url}|${anonKey.slice(0, 12)}`;
  if (!client || clientKey !== key) {
    try {
      client = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      clientKey = key;
    } catch {
      return null;
    }
  }
  return client;
}

export function getSyncIntervalMin(): number {
  try {
    const v = Number(readLS(INTERVAL_KEY) ?? "5");
    if ([0, 1, 5, 15, 30].includes(v)) return v;
    return 5;
  } catch {
    return 5;
  }
}

export function setSyncIntervalMin(v: number) {
  writeLS(INTERVAL_KEY, String(v));
  window.dispatchEvent(new Event("tuorden:sync-config"));
}

export function getLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function setLastSync(iso: string) {
  writeLS(LAST_SYNC_KEY, iso);
}

function randCode(len = 6): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (x) => abc[x % abc.length]).join("");
}

function randToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

/** Gerente: crea negocio (si no existe) + link de 6 digitos. Devuelve codigo para QR. */
export async function generateLink(label = "caja-gerente"): Promise<{ code: string; businessId: string }> {
  const sb = getRelayClient();
  if (!sb) throw new Error("Configura Supabase URL y anon key primero (Sincronización)");
  if (!isOnline()) throw new Error("Sin conexión a internet");
  const dev = await api.syncGetDevice();
  let businessId = dev.businessId;
  if (!businessId) {
    const { data, error } = await sb.from("businesses").insert({ name: "Mi negocio", gerente_device_id: dev.deviceId }).select("id").single();
    if (error) throw new Error(error.message);
    businessId = data.id as string;
    await api.syncSetBusiness({ businessId, role: "gerente", label });
  } else {
    await api.syncSetBusiness({ businessId, role: "gerente", label });
  }
  const code = randCode(6);
  const token = randToken();
  const tokenHash = await sha256hex(token);
  const { error } = await sb.from("links").insert({
    code,
    business_id: businessId,
    token_hash: tokenHash,
    max_uses: 5,
  });
  if (error) throw new Error(error.message);
  // Registrar/actualizar dispositivo gerente
  await sb.from("devices").upsert({
    device_id: (await api.syncGetDevice()).deviceId,
    business_id: businessId,
    role: "gerente",
    label,
  });
  return { code, businessId };
}

/** Dependiente: canjea codigo y queda emparejado. */
export async function redeemLink(code: string, label = "caja-dependiente"): Promise<{ businessId: string }> {
  const sb = getRelayClient();
  if (!sb) throw new Error("Configura Supabase URL y anon key primero");
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 4) throw new Error("Código inválido");
  if (!isOnline()) throw new Error("Sin conexión a internet");
  const { data, error } = await sb.rpc("redeem_link", { p_code: clean });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const businessId = (row?.business_id ?? row?.businessId) as string;
  if (!businessId) throw new Error("Código no válido");
  const dev = await api.syncGetDevice();
  await sb.from("devices").upsert({ device_id: dev.deviceId, business_id: businessId, role: "dependiente", label });
  await api.syncSetBusiness({ businessId, role: "dependiente", label });
  return { businessId };
}

/** Gerente manual: publica catalogo (materiales+productos+stock). Version = max+1. */
export async function pushCatalog(): Promise<{ version: number; count: string }> {
  const sb = getRelayClient();
  if (!sb) throw new Error("Configura Supabase primero");
  if (!isOnline()) throw new Error("Sin conexión a internet");
  const dev = await api.syncGetDevice();
  if (!dev.businessId) throw new Error("Primero genera un código de negocio");
  const catalog = await api.syncExportCatalog();
  const { data: latest } = await sb
    .from("catalog_snapshots")
    .select("version")
    .eq("business_id", dev.businessId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((latest?.version as number | undefined) ?? dev.catalogVersion ?? 0) + 1;
  const { error } = await sb.from("catalog_snapshots").upsert({
    business_id: dev.businessId,
    version,
    payload: { ...catalog, version },
  });
  if (error) throw new Error(error.message);
  await api.syncSetCatalogVersion(version);
  setLastSync(new Date().toISOString());
  return { version, count: `${catalog.materials.length} mat · ${catalog.products.length} prod` };
}

/** Dependiente (y gerente al abrir): baja ultimo catalogo si es mas nuevo. Push-before-pull. */
export async function pullCatalog(): Promise<{ applied: boolean; version: number }> {
  const sb = getRelayClient();
  if (!sb) throw new Error("Configura Supabase primero");
  if (!isOnline()) throw new Error("Sin conexión a internet");
  const dev = await api.syncGetDevice();
  if (!dev.businessId) throw new Error("Únete con un código primero");
  // Push-before-pull: no perder deducciones pendientes.
  await pushSales(true);
  const { data, error } = await sb
    .from("catalog_snapshots")
    .select("version, payload")
    .eq("business_id", dev.businessId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { applied: false, version: dev.catalogVersion };
  const remoteVersion = data.version as number;
  if (remoteVersion <= dev.catalogVersion) return { applied: false, version: dev.catalogVersion };
  const payload = (data.payload ?? {}) as { materials?: []; products?: [] };
  const msg = await api.syncImportCatalog({
    version: remoteVersion,
    materials: (payload.materials ?? []) as never[],
    products: (payload.products ?? []) as never[],
  });
  void msg;
  setLastSync(new Date().toISOString());
  window.dispatchEvent(new Event("tuorden:catalog-updated"));
  return { applied: true, version: remoteVersion };
}

/** Sube ventas pendientes (contado + credito). Silencioso si no hay nada. */
export async function pushSales(quiet = false): Promise<{ uploaded: number }> {
  const sb = getRelayClient();
  if (!sb) {
    if (quiet) return { uploaded: 0 };
    throw new Error("Configura Supabase primero");
  }
  if (!isOnline()) {
    if (quiet) return { uploaded: 0 };
    throw new Error("Sin conexión a internet");
  }
  const dev = await api.syncGetDevice();
  if (!dev.businessId) {
    if (quiet) return { uploaded: 0 };
    throw new Error("Únete con un código primero");
  }
  const pending = await api.syncExportPending(100);
  if (pending.length === 0) return { uploaded: 0 };
  let uploaded = 0;
  for (const sale of pending) {
    const { data, error } = await sb
      .from("sales_batches")
      .upsert(
        {
          business_id: dev.businessId,
          device_id: dev.deviceId,
          kind: sale.kind,
          local_id: sale.localId,
          payload: {
            ...sale,
            origin_credit_local_id: sale.originCreditLocalId ?? null,
          },
          created_at_device: sale.createdAt,
        },
        { onConflict: "business_id,device_id,kind,local_id" },
      )
      .select("id")
      .single();
    if (error) {
      if (quiet) continue;
      throw new Error(error.message);
    }
    await api.syncMarkPushed(sale.localId, sale.kind, (data?.id as string | undefined) ?? null);
    uploaded += 1;
  }
  if (uploaded > 0) setLastSync(new Date().toISOString());
  return { uploaded };
}

/** Gerente: baja ventas del relay y las importa (idempotente, acepta ambas). */
export async function pullSales(): Promise<{ imported: number; conflicts: number }> {
  const sb = getRelayClient();
  if (!sb) throw new Error("Configura Supabase primero");
  if (!isOnline()) throw new Error("Sin conexión a internet");
  const dev = await api.syncGetDevice();
  if (!dev.businessId) throw new Error("Primero genera un código de negocio");
  const { data, error } = await sb
    .from("sales_batches")
    .select("device_id, kind, local_id, payload")
    .eq("business_id", dev.businessId)
    .neq("device_id", dev.deviceId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  let imported = 0;
  let conflicts = 0;
  const myLabel = "gerente";
  void myLabel;
  for (const row of data ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    try {
      const r = await api.syncImportBatch({
        originDevice: row.device_id as string,
        originLabel: `dependiente ${(row.device_id as string).slice(0, 4)}`,
        sale: {
          localId: row.local_id as number,
          kind: row.kind as string,
          total: (payload.total as number) ?? 0,
          paymentMethod: (payload.paymentMethod as string | null) ?? null,
          clientName: (payload.clientName as string | null) ?? null,
          clientPhone: (payload.clientPhone as string | null) ?? null,
          note: (payload.note as string | null) ?? null,
          createdAt: (payload.createdAt as string) ?? new Date().toISOString(),
          items: ((payload.items as never[]) ?? []) as never[],
          payments: ((payload.payments as never[]) ?? []) as never[],
          originCreditLocalId: (payload.origin_credit_local_id as number | null) ?? (payload.originCreditLocalId as number | null) ?? null,
        } as never,
      });
      imported += 1;
      if (r.hadConflict) conflicts += 1;
    } catch {
      // Seguir con el resto (ej. pago huerfano cuyo credito aun no llega: reintenta proximo tick)
      continue;
    }
  }
  if (imported > 0) {
    setLastSync(new Date().toISOString());
    window.dispatchEvent(new Event("tuorden:sales-imported"));
  }
  return { imported, conflicts };
}

/** Tick unificado con push-before-pull. */
export async function syncNow(): Promise<string> {
  const dev = await api.syncGetDevice();
  if (dev.role === "dependiente") {
    const up = await pushSales(true);
    const down = await pullCatalog();
    if (!up.uploaded && !down.applied) return "Sin cambios";
    return `Enviadas ${up.uploaded} · Catálogo ${down.applied ? `v${down.version}` : "al día"}`;
  }
  const down = await pullSales();
  if (!down.imported) return "Sin ventas nuevas";
  return down.conflicts > 0
    ? `Importadas ${down.imported} (${down.conflicts} con stock bajo)`
    : `Importadas ${down.imported}`;
}
