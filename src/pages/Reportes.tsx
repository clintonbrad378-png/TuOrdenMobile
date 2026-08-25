import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Coins, FileDown, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import type { ReportData } from "../lib/types";
import { errMsg, fmtMoney, fmtQty, isoAddDays, isoToday, monthBounds, shortDay } from "../lib/format";
import { paymentLabel } from "../lib/constants";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatCard,
  cn,
  useToast,
} from "../components/ui";

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-xs shadow-xl">
      <div className="text-zinc-400">{label}</div>
      <div className="mt-0.5 font-semibold text-zinc-100">{fmtMoney(payload[0].value)}</div>
    </div>
  );
};

type Preset = "hoy" | "ayer" | "ult7" | "mes" | "mesPasado" | "custom";

export default function Reportes() {
  const [preset, setPreset] = useState<Preset>("hoy");
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const applyPreset = useCallback((p: Preset) => {
    setPreset(p);
    const today = isoToday();
    switch (p) {
      case "hoy":
        setFrom(today);
        setTo(today);
        break;
      case "ayer": {
        const y = isoAddDays(today, -1);
        setFrom(y);
        setTo(y);
        break;
      }
      case "ult7":
        setFrom(isoAddDays(today, -6));
        setTo(today);
        break;
      case "mes":
        setFrom(monthBounds(0)[0]);
        setTo(monthBounds(0)[1]);
        break;
      case "mesPasado":
        setFrom(monthBounds(-1)[0]);
        setTo(monthBounds(-1)[1]);
        break;
      case "custom":
        break;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .reportData(from, to)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => !cancelled && toast("error", errMsg(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const maxProductTotal = useMemo(
    () => Math.max(1, ...(report?.byProduct ?? []).map((p) => p.total)),
    [report],
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      const path = await save({
        title: "Exportar ventas a CSV",
        defaultPath: `ventas_${from}_${to}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      const count = await api.exportSalesCsv(from, to, path);
      toast("success", `Se exportaron ${count} líneas a:\n${path}`);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setExporting(false);
    }
  };

  const presets: { value: Preset; label: string }[] = [
    { value: "hoy", label: "Hoy" },
    { value: "ayer", label: "Ayer" },
    { value: "ult7", label: "Últimos 7 días" },
    { value: "mes", label: "Este mes" },
    { value: "mesPasado", label: "Mes anterior" },
    { value: "custom", label: "Personalizado" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Reportes"
          subtitle="Analiza el desempeño de tus ventas por período"
          actions={
            <Button onClick={exportCsv} loading={exporting}>
              <FileDown size={15} />
              Exportar CSV
            </Button>
          }
        />

        {/* Range selector */}
        <Card className="mb-6 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <button
                key={p.value}
                onClick={() => applyPreset(p.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  preset === p.value
                    ? "border-accent-500/40 bg-accent-500/10 text-accent-400"
                    : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="mt-2 flex w-full items-end gap-2 sm:mt-0 sm:ml-auto sm:w-auto">
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <Field label="Desde">
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPreset("custom");
                    }}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <Field label="Hasta">
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPreset("custom");
                    }}
                  />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        {!report ? (
          <div className="grid h-64 place-items-center">{loading && <Spinner />}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard
                label="Ventas totales"
                value={fmtMoney(report.totalSales)}
                hint={`${report.countSales} transacciones · ${from} → ${to}`}
                icon={<Wallet size={18} />}
              />
              <StatCard
                label="Ganancia"
                value={fmtMoney(report.totalProfit)}
                hint={
                  report.totalSales > 0
                    ? `Inversión ${fmtMoney(report.totalInvestment)} · margen ${((report.totalProfit / report.totalSales) * 100).toFixed(0)}%`
                    : "Según costo de recetas"
                }
                icon={<Coins size={18} />}
              />
              <StatCard
                label="Ticket promedio"
                value={fmtMoney(report.avgTicket)}
                hint="por venta del período"
                icon={<TrendingUp size={18} />}
              />
              <StatCard
                label="Artículos vendidos"
                value={fmtQty(report.totalItems)}
                hint="unidades totales"
                icon={<ShoppingBag size={18} />}
              />
            </div>

            <Card className="mt-6 p-5">
              <h2 className="text-sm font-medium text-zinc-200">Ventas por día</h2>
              {report.byDay.length === 0 ? (
                <EmptyState title="Sin datos en este rango" />
              ) : (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.byDay} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDay}
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v: number) =>
                          v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                        }
                        tick={{ fill: "#71717a", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                      <Bar dataKey="total" fill="#34d399" radius={[5, 5, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
              <Card className="p-5">
                <h2 className="text-sm font-medium text-zinc-200">Productos vendidos</h2>
                {report.byProduct.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays size={22} />}
                    title="Sin ventas en este período"
                    description="Registra ventas para ver estadísticas de productos."
                  />
                ) : (
                  <div className="mt-4 space-y-3">
                    {report.byProduct.map((p) => (
                      <div key={p.name}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm text-zinc-200">{p.name}</p>
                          <p className="shrink-0 text-xs tabular-nums text-zinc-500">
                            {fmtQty(p.qty)} u · {fmtMoney(p.total)} ·{" "}
                            <span className="font-medium text-accent-400">
                              +{fmtMoney(p.profit)}
                            </span>
                          </p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-accent-500/70"
                            style={{ width: `${(p.total / maxProductTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-medium text-zinc-200">Métodos de pago</h2>
                {report.byPayment.length === 0 ? (
                  <EmptyState title="Sin datos" />
                ) : (
                  <div className="mt-4 space-y-2">
                    {report.byPayment.map((pm) => (
                      <div
                        key={pm.method}
                        className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm text-zinc-200">{paymentLabel(pm.method)}</p>
                          <p className="text-[11px] text-zinc-500">{pm.count} ventas</p>
                        </div>
                        <Badge tone="accent">{fmtMoney(pm.total)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
