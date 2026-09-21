import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Boxes,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { Material, Movement } from "../lib/types";
import { errMsg, fmtDateTime, fmtMoney, fmtQty } from "../lib/format";
import { REASON_LABELS, UNITS } from "../lib/constants";
import { compatibleUnits, convertQty, costEquivalents, stockEquivalents, unitFamily } from "../lib/units";
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
  Switch,
  Tabs,
  cn,
  useToast,
} from "../components/ui";

type Tab = "inventario" | "movimientos";

interface RecipeRow {
  componentId: number | null;
  quantity: string;
  unit: string;
}

const emptyForm = {
  name: "",
  unit: "u",
  stock: "",
  minStock: "",
  costPerUnit: "",
  isElaborated: false,
  recipeYield: "",
};

function defaultRecipeUnit(mat: Material | null | undefined): string {
  if (!mat) return "g";
  return unitFamily(mat.unit) === "mass" ? "g" : mat.unit;
}

export default function Materiales() {
  const [tab, setTab] = useState<Tab>("inventario");
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<Material | null>(null);
  const [adjustMode, setAdjustMode] = useState<"entrada" | "salida">("entrada");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [mats, movs] = await Promise.all([api.listMaterials(), api.listMovements(100)]);
      setMaterials(mats);
      setMovements(movs);
    } catch (e) {
      toast("error", errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials ?? []).filter((m) => q === "" || m.name.toLowerCase().includes(q));
  }, [materials, search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setRecipe([]);
    setEditorOpen(true);
  };

  const openEdit = (m: Material) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      unit: m.unit,
      stock: "",
      minStock: String(m.minStock),
      costPerUnit: String(m.costPerUnit),
      isElaborated: m.isElaborated ?? false,
      recipeYield:
        m.isElaborated && m.recipeYield > 0 ? String(m.recipeYield) : "",
    });
    setRecipe(
      (m.recipe ?? []).map((r) => {
        const comp = (materials ?? []).find((x) => x.id === r.materialId) ?? null;
        const dispUnit = defaultRecipeUnit(comp);
        const dispQty =
          comp && dispUnit !== comp.unit
            ? (convertQty(r.quantity, comp.unit, dispUnit) ?? r.quantity)
            : r.quantity;
        return {
          componentId: r.materialId,
          quantity: String(Math.round(dispQty * 1000) / 1000),
          unit: dispUnit,
        };
      }),
    );
    setEditorOpen(true);
  };

  const rowStockQty = (row: RecipeRow): number | null => {
    const comp = (materials ?? []).find((x) => x.id === row.componentId);
    if (!comp) return null;
    const q = Number(row.quantity);
    if (!(q > 0)) return null;
    return convertQty(q, row.unit || comp.unit, comp.unit);
  };

  const recipeCostForYield = useMemo(() => {
    return recipe.reduce((acc, row) => {
      const comp = (materials ?? []).find((x) => x.id === row.componentId);
      if (!comp) return acc;
      const sq = rowStockQty(row);
      if (sq === null) return acc;
      return acc + comp.costPerUnit * sq;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 0);
  }, [recipe, materials]);

  const saveMaterial = async () => {
    if (!form.name.trim()) {
      toast("error", "El nombre del material es obligatorio");
      return;
    }
    if (editingId === null && !(Number(form.stock) >= 0)) {
      toast("error", "Ingresa un stock inicial válido");
      return;
    }
    if (form.isElaborated) {
      if (!(Number(form.recipeYield) > 0)) {
        toast("error", "Indica cuánto rinde la receta base (ej. 10 lb)");
        return;
      }
      if (recipe.length === 0) {
        toast("error", "Agrega al menos un ingrediente a la receta");
        return;
      }
    }
    const converted: { componentId: number; quantity: number }[] = [];
    if (form.isElaborated) {
      for (const r of recipe) {
        const comp = (materials ?? []).find((x) => x.id === r.componentId);
        if (r.componentId === null || !comp || !(Number(r.quantity) > 0)) {
          toast("error", "Completa la receta: ingrediente y cantidad mayor a cero");
          return;
        }
        if (editingId !== null && r.componentId === editingId) {
          toast("error", "Un material no puede usarse a sí mismo como ingrediente");
          return;
        }
        const sq = convertQty(Number(r.quantity), r.unit || comp.unit, comp.unit);
        if (sq === null || !(sq > 0)) {
          toast("error", `Unidad incompatible para "${comp.name}"`);
          return;
        }
        converted.push({
          componentId: r.componentId,
          quantity: Math.round(sq * 100000) / 100000,
        });
      }
    }
    setSaving(true);
    try {
      if (editingId === null) {
        await api.createMaterial({
          name: form.name.trim(),
          unit: form.unit,
          stock: Number(form.stock) || 0,
          minStock: Number(form.minStock) || 0,
          costPerUnit: Number(form.costPerUnit) || 0,
          isElaborated: form.isElaborated,
          recipeYield: form.isElaborated ? Number(form.recipeYield) || 0 : 0,
          recipe: converted,
        });
        toast("success", "Material creado");
      } else {
        await api.updateMaterial(editingId, {
          name: form.name.trim(),
          unit: form.unit,
          minStock: Number(form.minStock) || 0,
          costPerUnit: Number(form.costPerUnit) || 0,
          isElaborated: form.isElaborated,
          recipeYield: form.isElaborated ? Number(form.recipeYield) || 0 : 0,
          recipe: converted,
        });
        toast("success", "Material actualizado");
      }
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const applyAdjust = async () => {
    if (!adjustTarget) return;
    const amount = Number(adjustAmount);
    if (!(amount > 0)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    setAdjusting(true);
    try {
      await api.adjustStock(
        adjustTarget.id,
        adjustMode === "entrada" ? amount : -amount,
        adjustMode,
      );
      toast(
        "success",
        `${adjustMode === "entrada" ? "Entrada" : "Salida"} de ${fmtQty(amount)} ${adjustTarget.unit} registrada`,
      );
      setAdjustTarget(null);
      setAdjustAmount("");
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setAdjusting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteMaterial(deleteTarget.id);
      toast("success", `Material "${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!materials) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  const lowCount = materials.filter((m) => m.minStock > 0 && m.stock <= m.minStock).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Materiales"
          subtitle={
            lowCount > 0
              ? `${materials.length} materiales · ${lowCount} con stock bajo`
              : `${materials.length} materiales en inventario`
          }
          actions={
            <>
              <Tabs
                tabs={[
                  { value: "inventario" as Tab, label: "Inventario" },
                  { value: "movimientos" as Tab, label: "Movimientos" },
                ]}
                active={tab}
                onChange={setTab}
              />
              <Button variant="primary" onClick={openCreate}>
                <Plus size={15} />
                Nuevo material
              </Button>
            </>
          }
        />

        {tab === "inventario" ? (
          <>
            <div className="relative mb-4 max-w-md">
              <Search
                size={15}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500"
              />
              <Input
                placeholder="Buscar material…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Boxes size={22} />}
                  title={materials.length === 0 ? "Sin materiales" : "Sin resultados"}
                  description={
                    materials.length === 0
                      ? "Registra las materias primas que usas para elaborar tus productos."
                      : "Prueba con otro término de búsqueda."
                  }
                  action={
                    materials.length === 0 ? (
                      <Button variant="primary" onClick={openCreate}>
                        <Plus size={15} />
                        Nuevo material
                      </Button>
                    ) : undefined
                  }
                />
              </Card>
            ) : (
              <Card className="divide-y divide-white/[0.04]">
                {filtered.map((m) => {
                  const isOut = m.stock <= 0;
                  const isLow = !isOut && m.minStock > 0 && m.stock <= m.minStock;
                  const equiv = stockEquivalents(m.stock, m.unit);
                  const costs = costEquivalents(m.costPerUnit, m.unit);
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
                    >
                      <div className="min-w-0 flex-1 basis-36">
                        <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium text-zinc-100">
                          <span className="truncate">{m.name}</span>
                          {m.isElaborated && <Badge tone="accent">Elaborado</Badge>}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          Unidad: {m.unit} · Mín: {fmtQty(m.minStock)}
                          {m.isElaborated
                            ? ` · Rinde ${fmtQty(m.recipeYield)} ${m.unit} · ${(m.recipe ?? []).length} insumos`
                            : ""}
                        </p>
                        {equiv && (
                          <p className="mt-0.5 truncate text-[11px] tabular-nums text-zinc-600">
                            = {equiv}
                          </p>
                        )}
                        {costs.length > 0 && (
                          <p className="truncate text-[11px] tabular-nums text-zinc-600">
                            {costs.map((c) => `${fmtMoney(c.cost)}/${c.unit}`).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-zinc-100",
                          )}
                        >
                          {fmtQty(m.stock)}
                          <span className="ml-1 text-[11px] font-normal text-zinc-500">
                            {m.unit}
                          </span>
                        </span>
                        {isOut ? (
                          <Badge tone="danger">Agotado</Badge>
                        ) : isLow ? (
                          <Badge tone="warn">Bajo</Badge>
                        ) : null}
                      </div>
                      <span className="order-last basis-full text-[11px] text-zinc-500 sm:order-none sm:w-24 sm:basis-auto sm:text-right sm:text-sm sm:text-zinc-300">
                        {fmtMoney(m.costPerUnit)}
                        <span className="sm:hidden"> costo/u</span>
                      </span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          title="Entrada / salida de stock"
                          onClick={() => {
                            setAdjustTarget(m);
                            setAdjustMode("entrada");
                            setAdjustAmount("");
                          }}
                          className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-accent-400 active:bg-white/[0.06]"
                        >
                          <ArrowDownUp size={15} />
                        </button>
                        <button
                          title="Editar"
                          onClick={() => openEdit(m)}
                          className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 active:bg-white/[0.06]"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          title="Eliminar"
                          onClick={() => setDeleteTarget(m)}
                          className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-400 active:bg-white/[0.06]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        ) : (
          <Card>
            {movements.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={22} />}
                title="Sin movimientos"
                description="Aquí verás el historial de entradas, salidas y descuentos por ventas."
              />
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {movements.map((mv) => (
                  <div key={mv.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-36 shrink-0 text-xs tabular-nums text-zinc-500">
                      {fmtDateTime(mv.createdAt)}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                      {mv.materialName}
                    </p>
                    <span
                      className={cn(
                        "w-28 text-right text-sm font-medium tabular-nums",
                        mv.change >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {mv.change > 0 ? "+" : ""}
                      {fmtQty(mv.change)}
                    </span>
                    <Badge
                      tone={
                        mv.reason === "venta"
                          ? "accent"
                          : mv.reason === "salida"
                            ? "warn"
                            : mv.reason === "produccion_material" ||
                                mv.reason === "elaboracion" ||
                                mv.reason === "produccion"
                              ? "success"
                              : "zinc"
                      }
                      className="w-24 justify-center"
                    >
                      {REASON_LABELS[mv.reason] ?? mv.reason}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId === null ? "Nuevo material" : "Editar material"}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveMaterial} loading={saving}>
              {editingId === null ? "Crear material" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <Field label="Nombre">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej. Masa de hamburguesa"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unidad de medida">
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          {editingId === null && (
            <Field label="Stock inicial">
              <Input
                type="number"
                min="0"
                step="any"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="0"
              />
            </Field>
          )}
          <Field label="Stock mínimo" hint="Se alertará cuando el stock baje de aquí">
            <Input
              type="number"
              min="0"
              step="any"
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field
            label="Costo por unidad"
            hint={
              form.isElaborated
                ? "Se recalcula solo al elaborar (total receta / rendimiento)"
                : undefined
            }
          >
            <Input
              type="number"
              min="0"
              step="any"
              value={form.costPerUnit}
              onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
              placeholder="0.00"
              disabled={form.isElaborated && editingId !== null}
            />
          </Field>
        </div>
        {editingId !== null && (
          <p className="text-xs text-zinc-600">
            El stock se modifica mediante entradas y salidas para mantener trazabilidad.
          </p>
        )}

        <label className="flex items-center justify-between rounded-xl border border-accent-500/25 bg-accent-500/[0.06] px-4 py-3">
          <span className="text-sm text-zinc-200">
            Es material elaborado
            <span className="block text-[11px] font-normal text-zinc-500">
              {form.isElaborated
                ? "Se fabrica con otros materiales (ej. masa con picadillo + harina). Luego sirve para producir."
                : "Es materia prima comprada (ej. harina, picadillo)."}
            </span>
          </span>
          <Switch
            checked={form.isElaborated}
            onChange={(v) => setForm({ ...form, isElaborated: v })}
          />
        </label>

        {form.isElaborated && (
          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={`Rinde (en ${form.unit})`}
                hint="Cuánto sale con la receta base. Ej. receta para 10 lb → 10"
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.recipeYield}
                  onChange={(e) => setForm({ ...form, recipeYield: e.target.value })}
                  placeholder="Ej. 10"
                />
              </Field>
              <div className="flex items-end pb-1 text-[11px] leading-snug text-zinc-500">
                Costo lote base:{" "}
                <strong className="ml-1 text-zinc-200">{fmtMoney(recipeCostForYield)}</strong>
                {Number(form.recipeYield) > 0 && (
                  <span className="ml-1">
                    · Costo/{form.unit}:{" "}
                    <strong className="text-accent-400">
                      {fmtMoney(recipeCostForYield / Number(form.recipeYield))}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-zinc-400">
                Receta base · insumos por {form.recipeYield || "?"} {form.unit}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRecipe([...recipe, { componentId: null, quantity: "", unit: "g" }])}
                disabled={(materials ?? []).length === 0}
              >
                <Plus size={13} />
                Ingrediente
              </Button>
            </div>
            <p className="text-[11px] text-zinc-600">
              Pesa en gramos aunque el insumo esté en libras: se convierte solo al guardar.
              El propio material no puede ser su ingrediente.
            </p>

            {recipe.map((row, i) => {
              const comp = (materials ?? []).find((x) => x.id === row.componentId) ?? null;
              const sq = rowStockQty(row);
              const lineCost = comp && sq !== null ? comp.costPerUnit * sq : null;
              const units = comp ? compatibleUnits(comp.unit) : ["g", "kg", "lb", "oz", "ml", "L", "u"];
              const candidates = (materials ?? []).filter((x) =>
                editingId !== null ? x.id !== editingId : true,
              );
              return (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-surface-800 p-2.5">
                  <div className="flex items-center gap-2">
                    <Select
                      value={row.componentId?.toString() ?? ""}
                      onChange={(e) => {
                        const next = [...recipe];
                        const id = e.target.value ? Number(e.target.value) : null;
                        const m = (materials ?? []).find((x) => x.id === id) ?? null;
                        next[i] = { ...next[i], componentId: id, unit: defaultRecipeUnit(m) };
                        setRecipe(next);
                      }}
                    >
                      <option value="">Seleccionar ingrediente…</option>
                      {candidates.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit}){m.isElaborated ? " · elaborado" : ""}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}
                      className="shrink-0 rounded-lg p-2 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 px-0.5">
                    <span className="text-[11px] text-zinc-500">Cantidad</span>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 w-24 py-1"
                      placeholder="0"
                      value={row.quantity}
                      onChange={(e) => {
                        const next = [...recipe];
                        next[i] = { ...next[i], quantity: e.target.value };
                        setRecipe(next);
                      }}
                    />
                    <select
                      value={row.unit || comp?.unit || "g"}
                      onChange={(e) => {
                        const next = [...recipe];
                        next[i] = { ...next[i], unit: e.target.value };
                        setRecipe(next);
                      }}
                      className="h-8 rounded-lg border border-white/10 bg-surface-800 px-2 text-xs text-zinc-200 outline-none"
                    >
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    {comp && <span className="text-[11px] text-zinc-600">stock en {comp.unit}</span>}
                    <span className="ml-auto text-[11px] tabular-nums text-zinc-500">
                      Costo línea:{" "}
                      <strong className="font-medium text-zinc-300">
                        {lineCost !== null ? fmtMoney(lineCost) : "—"}
                      </strong>
                    </span>
                  </div>
                  {comp && row.unit && row.unit !== comp.unit && sq !== null && (
                    <p className="mt-1 px-0.5 text-[11px] tabular-nums text-zinc-600">
                      {row.quantity} {row.unit} = {fmtQty(sq)} {comp.unit} de "{comp.name}"
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Adjust stock */}
      <Modal
        open={adjustTarget !== null}
        onClose={() => setAdjustTarget(null)}
        title="Ajustar stock"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustTarget(null)} disabled={adjusting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={applyAdjust} loading={adjusting}>
              Registrar movimiento
            </Button>
          </>
        }
      >
        {adjustTarget && (
          <>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-100">{adjustTarget.name}</p>
                <p className="text-xs text-zinc-500">Stock actual</p>
              </div>
              <p className="text-lg font-semibold tabular-nums text-zinc-50">
                {fmtQty(adjustTarget.stock)}{" "}
                <span className="text-xs font-normal text-zinc-500">{adjustTarget.unit}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["entrada", "salida"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAdjustMode(mode)}
                  className={cn(
                    "rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors",
                    adjustMode === mode
                      ? mode === "entrada"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {mode === "entrada" ? "Entrada" : "Salida"}
                </button>
              ))}
            </div>
            <Field label={`Cantidad (${adjustTarget.unit})`}>
              <Input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
          </>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Eliminar material"
        confirmLabel="Eliminar"
        message={
          <>
            ¿Seguro que quieres eliminar <strong>{deleteTarget?.name}</strong>? Se quitará de
            todas las recetas de productos y de materiales elaborados donde se use, se borrará
            su receta si es elaborado y se perderá su historial de movimientos y elaboraciones.
          </>
        }
      />
    </div>
  );
}
