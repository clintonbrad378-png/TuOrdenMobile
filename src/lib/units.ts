/** Conversión de unidades para recetas y materiales.
 * Familias: masa (g base), volumen (ml base), unidades (u, sin conversión).
 * 1 lb = 453.59237 g · 1 oz = 28.349523125 g · 1 kg = 1000 g
 * 1 L = 1000 ml
 */

export const MASS_UNITS = ["g", "kg", "lb", "oz"] as const;
export const VOLUME_UNITS = ["ml", "L"] as const;

const TO_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  lb: 453.59237,
  oz: 28.349523125,
};

const TO_ML: Record<string, number> = {
  ml: 1,
  L: 1000,
};

export type UnitFamily = "mass" | "volume" | "unit" | "other";

export function unitFamily(unit: string): UnitFamily {
  const u = unit.trim();
  if (TO_GRAMS[u] !== undefined) return "mass";
  if (TO_ML[u] !== undefined) return "volume";
  if (u === "u") return "unit";
  return "other";
}

/** Unidades compatibles para convertir desde la unidad dada. */
export function compatibleUnits(unit: string): string[] {
  const f = unitFamily(unit);
  if (f === "mass") return [...MASS_UNITS];
  if (f === "volume") return [...VOLUME_UNITS];
  return [unit];
}

/** Convierte cantidad de `from` a `to`. Devuelve null si no son compatibles. */
export function convertQty(qty: number, from: string, to: string): number | null {
  if (!Number.isFinite(qty)) return null;
  if (from === to) return qty;
  const ff = unitFamily(from);
  const tf = unitFamily(to);
  if (ff !== tf) return null;
  if (ff === "mass") {
    const base = qty * TO_GRAMS[from];
    return base / TO_GRAMS[to];
  }
  if (ff === "volume") {
    const base = qty * TO_ML[from];
    return base / TO_ML[to];
  }
  return null;
}

/** Convierte cantidad en `from` a la unidad de stock `stockUnit` (para guardar). */
export function toStockUnit(qty: number, from: string, stockUnit: string): number | null {
  return convertQty(qty, from, stockUnit);
}

/** Texto corto de equivalencias: ej. "907.2 g · 0.907 kg · 32 oz" */
export function stockEquivalents(stock: number, unit: string, decimals = 3): string {
  const units = compatibleUnits(unit);
  if (units.length <= 1) return "";
  const parts: string[] = [];
  for (const u of units) {
    if (u === unit) continue;
    const v = convertQty(stock, unit, u);
    if (v === null) continue;
    parts.push(`${trimNum(v, decimals)} ${u}`);
  }
  return parts.join(" · ");
}

/** Costo por cada unidad compatible: ej. { g: 0.011, oz: 0.31 } */
export function costEquivalents(costPerUnit: number, unit: string): { unit: string; cost: number }[] {
  const units = compatibleUnits(unit);
  if (units.length <= 1) return [];
  const out: { unit: string; cost: number }[] = [];
  for (const u of units) {
    if (u === unit) continue;
    // 1 stockUnit = X u  →  costo/u = costo/stockUnit / X
    const perOne = convertQty(1, unit, u);
    if (perOne === null || perOne === 0) continue;
    out.push({ unit: u, cost: costPerUnit / perOne });
  }
  return out;
}

function trimNum(n: number, decimals = 3): string {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  if (Number.isInteger(r)) return String(r);
  return String(r);
}
