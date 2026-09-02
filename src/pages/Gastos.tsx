import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, FileText, Trash2, Warehouse } from "lucide-react";
import { api } from "../lib/api";
import type { Expense, NetProfitData, ExpenseCategory } from "../lib/types";
import { errMsg, fmtMoney, isoToday, monthBounds } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Tabs,
  useToast,
} from "../components/ui";

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "alquiler", label: "Alquiler / Renta" },
  { value: "servicios", label: "Servicios (luz, agua, internet)" },
  { value: "nomina", label: "Nómina / Sueldos" },
  { value: "marketing", label: "Marketing / Publicidad" },
  { value: "impuestos", label: "Impuestos" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otro", label: "Otros" },
];

const emptyForm = {
  name: "",
  amount: "",
  category: "otro" as ExpenseCategory,
  description: "",
};

type Tab = "gastos" | "mermas" | "resumen";

export default function Gastos() {
  const [tab, setTab] = useState<Tab>("gastos");
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [mermaExpenses, setMermaExpenses] = useState<Expense[] | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const [dateFrom, setDateFrom] = useState(monthBounds(0)[0]);
  const [dateTo, setDateTo] = useState(isoToday());

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [netProfit, setNetProfit] = useState<NetProfitData | null>(null);
  const [netProfitLoading, setNetProfitLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allExpenses, mermaExpensesData, profitData] = await Promise.all([
        api.listExpenses(),
        api.listExpenses({ category: "merma" }),
        api.getNetProfit(dateFrom, dateTo),
      ]);
      setExpenses(allExpenses);
      setMermaExpenses(mermaExpensesData);
      setNetProfit(profitData);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoading(false);
      setNetProfitLoading(false);
    }
  }, [dateFrom, dateTo, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchesSearch =
        q === "" ||
        e.name.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q);
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, search, categoryFilter]);

  const totalBusinessExpenses = useMemo(() => {
    return expenses?.filter((e) => e.category !== "merma").reduce((sum, e) => sum + e.amount, 0) ?? 0;
  }, [expenses]);

  const totalMermaExpenses = useMemo(() => {
    return mermaExpenses?.reduce((sum, e) => sum + e.amount, 0) ?? 0;
  }, [mermaExpenses]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      name: expense.name,
      amount: expense.amount.toString(),
      category: expense.category,
      description: expense.description ?? "",
    });
    setEditingId(expense.id);
    setEditorOpen(true);
  };

  const saveExpense = async () => {
    if (!form.name.trim()) {
      toast("error", "El nombre es obligatorio");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast("error", "Ingresa un monto válido mayor a cero");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateExpense(editingId, {
          name: form.name,
          amount,
          category: form.category,
          description: form.description,
        });
        toast("success", "Gasto actualizado");
      } else {
        await api.createExpense({
          name: form.name,
          amount,
          category: form.category,
          description: form.description,
        });
        toast("success", "Gasto registrado");
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteExpense(deleteTarget.id);
      toast("success", "Gasto eliminado");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Gastos del negocio"
          subtitle="Registra y controla los gastos operativos. Las mermas se registran automáticamente."
          actions={
            tab === "gastos" ? (
              <Button variant="primary" onClick={openCreate}>
                <CreditCard size={15} />
                Nuevo gasto
              </Button>
            ) : null
          }
        />

        <Tabs
          tabs={[
            { value: "gastos" as Tab, label: "Gastos del negocio" },
            { value: "mermas" as Tab, label: "Mermas (automático)" },
            { value: "resumen" as Tab, label: "Resumen neto" },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "gastos" && (
          <>
            <Card className="mb-4 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative max-w-xs flex-1 min-w-[200px]">
                  <Input
                    placeholder="Buscar gasto…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | "all")}
                  className="w-48 sm:w-auto"
                >
                  <option value="all">Todas las categorías</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <div className="ml-auto flex items-center gap-2">
                  <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                    <Field label="Desde">
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          load();
                        }}
                      />
                    </Field>
                  </div>
                  <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                    <Field label="Hasta">
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          load();
                        }}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            </Card>

            {filteredExpenses.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<CreditCard size={22} />}
                  title={expenses?.length === 0 ? "Sin gastos registrados" : "Sin resultados"}
                  description={
                    expenses?.length === 0
                      ? "Registra tu primer gasto del negocio."
                      : "Prueba con otro término de búsqueda o filtro."
                  }
                  action={
                    <Button variant="primary" onClick={openCreate}>
                      <CreditCard size={15} />
                      Nuevo gasto
                    </Button>
                  }
                />
              </Card>
            ) : (
              <Card className="divide-y divide-white/[0.04]">
                {filteredExpenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 flex-1 basis-36">
                      <p className="truncate text-sm font-medium text-zinc-100">{e.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        {e.description ?? "Sin descripción"} · {e.category}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge tone="warn" className="text-xs">
                        {fmtMoney(e.amount)}
                      </Badge>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                        {new Date(e.createdAt).toLocaleDateString("es-ES")}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(e)}>
                        Editar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setDeleteTarget(e)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <Card className="mt-6 p-4">
              <h3 className="text-sm font-medium text-zinc-200">Totales por categoría</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const catTotal = expenses
                    ?.filter((e) => e.category === cat.value)
                    .reduce((sum, e) => sum + e.amount, 0) ?? 0;
                  return (
                    <Badge key={cat.value} tone="accent" className="text-xs">
                      {cat.label}: {fmtMoney(catTotal)}
                    </Badge>
                  );
                })}
                <Badge tone="warn" className="text-xs">
                  Total gastos: {fmtMoney(totalBusinessExpenses)}
                </Badge>
              </div>
            </Card>
          </>
        )}

        {tab === "mermas" && (
          <>
            {mermaExpenses?.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Trash2 size={22} />}
                  title="Sin mermas registradas"
                  description="Las mermas se registran automáticamente cuando registras desperdicios en la sección Mermas."
                />
              </Card>
            ) : (
              <Card className="divide-y divide-white/[0.04]">
                {mermaExpenses!.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 flex-1 basis-36">
                      <p className="truncate text-sm font-medium text-zinc-100">{e.name}</p>
                      <p className="text-[11px] text-zinc-500">{e.description ?? "Sin descripción"}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge tone="danger" className="text-xs">
                        {fmtMoney(e.amount)}
                      </Badge>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                        {new Date(e.createdAt).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <Card className="mt-6 p-4">
              <h3 className="text-sm font-medium text-zinc-200">Total mermas</h3>
              <div className="mt-3">
                <Badge tone="danger" className="text-sm">
                  {fmtMoney(totalMermaExpenses)}
                </Badge>
              </div>
            </Card>
          </>
        )}

        {tab === "resumen" && (
          <>
            <Card className="mb-6 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                  <Field label="Desde">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        load();
                      }}
                    />
                  </Field>
                </div>
                <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                  <Field label="Hasta">
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        load();
                      }}
                    />
                  </Field>
                </div>
                <Button variant="outline" onClick={load} loading={netProfitLoading} disabled={netProfitLoading}>
                  <FileText size={14} />
                  Actualizar
                </Button>
              </div>
            </Card>

            {netProfit && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  <StatCard
                    label="Ganancia bruta (ventas)"
                    value={fmtMoney(netProfit.grossProfit)}
                    hint="Ventas - Costo de recetas"
                    icon={<Warehouse size={18} />}
                  />
                  <StatCard
                    label="Gastos del negocio"
                    value={fmtMoney(netProfit.businessExpenses)}
                    hint="Alquiler, nómina, servicios, etc."
                    icon={<CreditCard size={18} />}
                  />
                  <StatCard
                    label="Mermas (pérdida capital)"
                    value={fmtMoney(netProfit.mermaExpenses)}
                    hint="Desperdicios, vencidos, roturas"
                    icon={<Trash2 size={18} />}
                  />
                  <StatCard
                    label="Ganancia neta"
                    value={fmtMoney(netProfit.netProfit)}
                    hint={netProfit.netProfit >= 0 ? "Rentable" : "Pérdida neta"}
                    icon={<CreditCard size={18} />}
                  />
                </div>

                <Card className="mt-6 p-5">
                  <h2 className="text-sm font-medium text-zinc-200">Desglose de gastos del negocio</h2>
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const catTotal = expenses
                      ?.filter((e) => e.category === cat.value)
                      .reduce((sum, e) => sum + e.amount, 0) ?? 0;
                    const percentage = netProfit.totalExpenses > 0 ? (catTotal / netProfit.totalExpenses) * 100 : 0;
                    return (
                      <div key={cat.value} className="mt-3 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-zinc-200">{cat.label}</p>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                            <div
                              className="h-full rounded-full bg-accent-500/70"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-medium tabular-nums text-zinc-100">{fmtMoney(catTotal)}</p>
                          <p className="text-[11px] text-zinc-500">{percentage.toFixed(1)}% del total</p>
                        </div>
                      </div>
                    );
                  })}
                </Card>
              </>
            )}
          </>
        )}
      </div>

      {/* Editor Modal */}
      <Modal
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingId(null);
          setForm(emptyForm);
        }}
        title={editingId ? "Editar gasto" : "Nuevo gasto"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveExpense} loading={saving}>
              {editingId ? "Actualizar" : "Registrar"}
            </Button>
          </>
        }
      >
        <Field label="Nombre" hint="Ej: Alquiler local, Factura luz, Nómina febrero">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre del gasto"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Monto">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Categoría">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descripción (opcional)">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Detalles adicionales..."
          />
        </Field>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Eliminar gasto"
        confirmLabel="Eliminar"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"?`}
      />
    </div>
  );
}