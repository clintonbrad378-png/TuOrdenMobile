import { api } from "./api";
import {
  getLastPush,
  getPanelClient,
  getPanelIncludeCosts,
  setLastPush,
} from "./supabase";
import { isoToday } from "./format";

export interface PanelSnapshot {
  day: string;
  device_label: string;
  kpis: Record<string, number>;
  products: { name: string; qty: number; total: number; profit: number }[];
  materials: { id: number; name: string; stock: number; minStock: number; unit: string; estado: string }[];
  low_stock: { id: number; name: string; stock: number; minStock: number; unit: string }[];
  sales_by_day: { date: string; total: number; count: number }[];
  by_payment: { method: string; total: number; count: number }[];
  include_costs: boolean;
}

let lastHash = "";

function hashSnapshot(s: PanelSnapshot): string {
  const str = JSON.stringify([s.kpis, s.products, s.materials, s.by_payment]);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return `${h}:${str.length}`;
}

/** Arma el snapshot del día con los datos locales (SQLite vía Tauri). */
export async function buildPanelSnapshot(): Promise<PanelSnapshot> {
  const today = isoToday();
  const includeCosts = getPanelIncludeCosts();
  const [stats, report, materials] = await Promise.all([
    api.dashboardStats(),
    api.reportData(today, today),
    api.listMaterials(),
  ]);

  const mats = materials.map((m) => ({
    id: m.id,
    name: m.name,
    stock: m.stock,
    minStock: m.minStock,
    unit: m.unit,
    estado: m.stock <= 0 ? "agotado" : m.minStock > 0 && m.stock <= m.minStock ? "bajo" : "ok",
  }));

  return {
    day: today,
    device_label: "caja-1",
    kpis: {
      ventasHoy: report.totalSales,
      transacciones: report.countSales,
      ticketProm: report.avgTicket,
      articulos: report.totalItems,
      ganancia: includeCosts ? report.totalProfit : 0,
      inversion: includeCosts ? report.totalInvestment : 0,
      gastosNegocio: includeCosts ? report.totalBusinessExpenses : 0,
      mermas: includeCosts ? report.totalMermaExpenses : 0,
      gananciaNeta: includeCosts ? report.totalNetProfit : 0,
      semanaTotal: stats.weekTotal,
      mesTotal: stats.monthTotal,
    },
    products: report.byProduct.map((p) => ({
      name: p.name,
      qty: p.qty,
      total: p.total,
      profit: includeCosts ? p.profit : 0,
    })),
    materials: mats,
    low_stock: stats.lowStock,
    sales_by_day: stats.salesByDay,
    by_payment: report.byPayment,
    include_costs: includeCosts,
  };
}

/**
 * Sube el snapshot a Supabase (upsert por `day`).
 * - Requiere sesión iniciada (login gerente en Configuración).
 * - Omite la subida si nada cambió (ahorra datos móviles).
 * - `force=true` para el botón "Publicar ahora".
 */
export async function pushPanelSnapshot(force = false): Promise<{ skipped: boolean; updatedAt: string }> {
  const sb = getPanelClient();
  if (!sb) throw new Error("Configura URL y anon key de Supabase primero");
  const { data: session } = await sb.auth.getSession();
  if (!session.session) throw new Error("Inicia sesión como gerente en el panel online");

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Sin conexión a internet");
  }

  const snap = await buildPanelSnapshot();
  const h = hashSnapshot(snap);
  if (!force && h === lastHash) {
    return { skipped: true, updatedAt: getLastPush() ?? "" };
  }

  const { error } = await sb.from("panel_snapshots").upsert(
    {
      day: snap.day,
      device_label: snap.device_label,
      kpis: snap.kpis,
      products: snap.products,
      materials: snap.materials,
      low_stock: snap.low_stock,
      sales_by_day: snap.sales_by_day,
      by_payment: snap.by_payment,
      include_costs: snap.include_costs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "day" },
  );
  if (error) throw new Error(error.message);

  lastHash = h;
  const now = new Date().toISOString();
  setLastPush(now);
  return { skipped: false, updatedAt: now };
}

/** Reset de dedupe (ej. al cambiar de día o de toggle de costos). */
export function resetPanelDedupe() {
  lastHash = "";
}
