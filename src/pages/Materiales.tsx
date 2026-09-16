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
import { costEquivalents, stockEquivalents } from "../lib/units";
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
  Tabs,
  cn,
  useToast,
} from "../components/ui";

type Tab = "inventario" | "movimientos";

const emptyForm = { name: "", unit: "u", stock: "", minStock: "", costPerUnit: "" };

export default function Materiales() {
  const [tab, setTab] = useState<Tab>("inventario");
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
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
    });
    setEditorOpen(true);
  };

  const saveMaterial = async () => {
    if (!form.name.trim()) {
      toast("error", "El nombre del material es obligatorio");
      return;
    }
    if (editingId === null && !(Number(form.stock) >= 0)) {
      toast("error", "Ingresa un stock inicial válido");
      return;
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
        });
        toast("success", "Material creado");
      } else {
        await api.updateMaterial(editingId, {
          name: form.name.trim(),
          unit: form.unit,
          minStock: Number(form.minStock) || 0,
          costPerUnit: Number(form.costPerUnit) || 0,
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
                        <p className="truncate text-sm font-medium text-zinc-100">{m.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          Unidad: {m.unit} · Mín: {fmtQty(m.minStock)}
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
            placeholder="Ej. Harina de trigo"
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
          <Field label="Costo por unidad">
            <Input
              type="number"
              min="0"
              step="any"
              value={form.costPerUnit}
              onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
              placeholder="0.00"
            />
          </Field>
        </div>
        {editingId !== null && (
          <p className="text-xs text-zinc-600">
            El stock se modifica mediante entradas y salidas para mantener trazabilidad.
          </p>
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
            todas las recetas donde se use y se perderá su historial de movimientos.
          </>
        }
      />
    </div>
  );
}
