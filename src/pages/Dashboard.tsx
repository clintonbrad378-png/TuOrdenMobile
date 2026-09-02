import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  CreditCard,
  DollarSign,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { api } from "../lib/api";
import type { DashboardStats } from "../lib/types";
import { errMsg, fmtMoney, fmtQty, shortDay } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Spinner,
  StatCard,
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

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.dashboardStats());
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!stats) {
    return (
      <div className="grid h-full place-items-center">
        {loading ? <Spinner /> : <EmptyState title="No se pudieron cargar las estadísticas" />}
      </div>
    );
  }

  const maxTop = Math.max(1, ...stats.topProducts.map((p) => p.total));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Dashboard"
          subtitle="Resumen del día y estado del negocio"
          actions={
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Actualizar
            </Button>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard
            label="Ventas hoy"
            value={fmtMoney(stats.todayTotal)}
            hint={`${stats.todayCount} transacciones`}
            icon={<DollarSign size={18} />}
          />
          <StatCard
            label="Ganancia hoy"
            value={fmtMoney(stats.todayProfit)}
            hint={
              stats.todayTotal > 0
                ? `Inversión ${fmtMoney(stats.todayInvestment)} · margen ${((stats.todayProfit / stats.todayTotal) * 100).toFixed(0)}%`
                : "Según costo de recetas"
            }
            icon={<Coins size={18} />}
          />
          <StatCard
            label="Ganancia neta mes"
            value={fmtMoney(stats.todayNetProfit)}
            hint={
              stats.monthTotal > 0
                ? `Gastos mes ${fmtMoney(stats.todayBusinessExpenses + stats.todayMermaExpenses)} (negocio: ${fmtMoney(stats.todayBusinessExpenses)}, mermas: ${fmtMoney(stats.todayMermaExpenses)})`
                : "Ganancia bruta mes - gastos mes"
            }
            icon={<CreditCard size={18} />}
          />
          <StatCard
            label="Ticket promedio"
            value={fmtMoney(stats.avgTicket)}
            hint="por venta hoy"
            icon={<Receipt size={18} />}
          />
          <StatCard
            label="Artículos vendidos"
            value={fmtQty(stats.todayItems)}
            hint="unidades hoy"
            icon={<ShoppingBag size={18} />}
          />
          <StatCard
            label="Ventas · 7 días"
            value={fmtMoney(stats.weekTotal)}
            hint={`Mes actual: ${fmtMoney(stats.monthTotal)}`}
            icon={<TrendingUp size={18} />}
          />
          <StatCard
            label="Ganancia · 7 días"
            value={fmtMoney(stats.weekProfit)}
            hint={`Mes actual: ${fmtMoney(stats.monthProfit)}`}
            icon={<Coins size={18} />}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <Card className="p-5">
            <h2 className="text-sm font-medium text-zinc-200">Ventas · últimos 7 días</h2>
            <div className="mt-4 h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.salesByDay} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDay}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)}
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)" }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="url(#salesGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-200">Alertas de stock</h2>
              {stats.lowStock.length > 0 && (
                <Badge tone="warn">
                  <AlertTriangle size={11} />
                  {stats.lowStock.length}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
              {stats.lowStock.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={22} />}
                  title="Todo en orden"
                  description="Ningún material está por debajo de su mínimo."
                />
              ) : (
                stats.lowStock.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => navigate("/materiales")}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">{m.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        Mínimo: {fmtQty(m.minStock)} {m.unit}
                      </p>
                    </div>
                    {m.stock <= 0 ? (
                      <Badge tone="danger">Agotado</Badge>
                    ) : (
                      <Badge tone="warn">
                        {fmtQty(m.stock)} {m.unit}
                      </Badge>
                    )}
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className="mt-6 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-200">Productos más vendidos</h2>
            <span className="text-[11px] text-zinc-600">Últimos 30 días</span>
          </div>
          {stats.topProducts.length === 0 ? (
            <EmptyState
              icon={<Banknote size={22} />}
              title="Aún no hay ventas registradas"
              description="Cuando registres ventas verás aquí tus productos estrella."
            />
          ) : (
            <div className="mt-4 space-y-3">
              {stats.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-start gap-3">
                  <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-zinc-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <p className="min-w-0 truncate text-sm text-zinc-200">{p.name}</p>
                      <p className="shrink-0 text-right text-xs leading-relaxed break-words tabular-nums text-zinc-500">
                        {fmtQty(p.qty)} u · {fmtMoney(p.total)} ·{" "}
                        <span className="font-medium text-accent-400">+{fmtMoney(p.profit)}</span>
                      </p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-accent-500/70"
                        style={{ width: `${(p.total / maxTop) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
