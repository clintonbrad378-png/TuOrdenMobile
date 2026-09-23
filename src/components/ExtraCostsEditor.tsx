import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input } from "./ui";
import { fmtMoney } from "../lib/format";
import type { ExtraCostInput } from "../lib/types";

export const EXTRA_KINDS = [
  { value: "mano_obra", label: "Mano de obra" },
  { value: "logistica", label: "Logística" },
  { value: "energia", label: "Energía / Gas" },
  { value: "otro", label: "Otro" },
] as const;

export function extraKindLabel(kind: string): string {
  const found = EXTRA_KINDS.find((k) => k.value === kind);
  return found ? found.label : "Otro";
}

export interface ExtraRow {
  name: string;
  kind: string;
  amount: string;
}

export function toExtraInputs(rows: ExtraRow[]): ExtraCostInput[] {
  return rows
    .filter((r) => r.name.trim() !== "" || Number(r.amount) > 0)
    .map((r) => ({
      name: r.name.trim(),
      kind: r.kind || "otro",
      amount: Number(r.amount) || 0,
    }))
    .filter((r) => r.name !== "" && r.amount > 0);
}

export function extraTotal(rows: ExtraRow[]): number {
  return rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
}

export default function ExtraCostsEditor({
  rows,
  onChange,
  unitLabel,
  compact = false,
}: {
  rows: ExtraRow[];
  onChange: (rows: ExtraRow[]) => void;
  unitLabel: string;
  compact?: boolean;
}) {
  const total = extraTotal(rows);
  return (
    <div className={`space-y-2 ${compact ? "" : "rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"}`}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-zinc-400">
            Gastos extra por {unitLabel} · mano de obra, logística…
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange([...rows, { name: "", kind: "mano_obra", amount: "" }])}
          >
            <Plus size={13} />
            Gasto
          </Button>
        </div>
      )}
      {compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">Gastos extra (por {unitLabel})</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange([...rows, { name: "", kind: "mano_obra", amount: "" }])}
          >
            <Plus size={13} />
            Gasto
          </Button>
        </div>
      )}
      <p className="text-[11px] text-zinc-600">
        Se suman al costo de materiales. La ganancia queda limpia: no los descuentes luego en Gastos.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.name}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], name: e.target.value };
              onChange(next);
            }}
            placeholder="Ej. Mano de obra"
            className="h-8 flex-1 py-1 text-xs"
          />
          <select
            value={row.kind}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], kind: e.target.value };
              onChange(next);
            }}
            className="h-8 shrink-0 rounded-lg border border-white/10 bg-surface-800 px-1.5 text-xs text-zinc-200 outline-none"
          >
            {EXTRA_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min="0"
            step="any"
            value={row.amount}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], amount: e.target.value };
              onChange(next);
            }}
            placeholder="0.00"
            className="h-8 w-24 shrink-0 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition-colors hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {rows.length > 0 && (
        <p className="text-[11px] tabular-nums text-zinc-500">
          Total extra: <strong className="font-medium text-zinc-200">{fmtMoney(total)}</strong> / {unitLabel}
        </p>
      )}
      {rows.length === 0 && (
        <p className="text-[11px] text-zinc-600">Sin gastos extra. Solo costo de materiales.</p>
      )}
    </div>
  );
}

// Re-export Field for convenience in editors that want labeled wrapper
export { Field };
