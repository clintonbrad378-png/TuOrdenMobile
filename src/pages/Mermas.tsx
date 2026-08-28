import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Search, Trash2, UserMinus } from "lucide-react";
import { api } from "../lib/api";
import type { Material, Product } from "../lib/types";
import { errMsg, fmtMoney, fmtQty } from "../lib/format";
import { REASON_LABELS } from "../lib/constants";
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
  useToast,
} from "../components/ui";

type Tab = "merma" | "consumo";

const wasteReasons = [
  { value: "vencido", label: "Vencido" },
  { value: "deteriorado", label: "Deteriorado" },
  { value: "robo", label: "Robo / Hurto" },
  { value: "muestras", label: "Muestras / Degustación" },
  { value: "error", label: "Error de preparación" },
  { value: "otro", label: "Otro" },
];

const emptyWasteForm = { materialId: null as number | null, quantity: "", reason: "" };
const emptyConsumptionForm = { productId: null as number | null, quantity: "" };

export default function Mermas() {
  const [tab, setTab] = useState<Tab>("merma");
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [movements, setMovements] = useState<{ id: number; materialName: string; change: number; reason: string; createdAt: string }[]>([]);
  const [search, setSearch] = useState("");

  const [wasteEditorOpen, setWasteEditorOpen] = useState(false);
  const [wasteForm, setWasteForm] = useState(emptyWasteForm);
  const [wasteSaving, setWasteSaving] = useState(false);

  const [consumptionEditorOpen, setConsumptionEditorOpen] = useState(false);
  const [consumptionForm, setConsumptionForm] = useState(emptyConsumptionForm);
  const [consumptionSaving, setConsumptionSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; materialName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [mats, prods, movs] = await Promise.all([
        api.listMaterials(),
        api.listProducts(true),
        api.listMovements(200),
      ]);
      setMaterials(mats);
      setProducts(prods);
      setMovements(movs);
    } catch (e) {
      toast("error", errMsg(e));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials ?? []).filter((m) => q === "" || m.name.toLowerCase().includes(q));
  }, [materials, search]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => q === "" || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const wasteMovements = useMemo(() =>
    movements.filter((m) => m.reason === "merma"),
  [movements]);

  const consumptionMovements = useMemo(() =>
    movements.filter((m) => m.reason === "consumo_interno"),
  [movements]);

  const openWasteCreate = () => {
    setWasteForm(emptyWasteForm);
    setWasteEditorOpen(true);
  };

  const saveWaste = async () => {
    if (wasteForm.materialId === null) {
      toast("error", "Selecciona un material");
      return;
    }
    const quantity = Number(wasteForm.quantity);
    if (!(quantity > 0)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    if (!wasteForm.reason.trim()) {
      toast("error", "Selecciona un motivo");
      return;
    }
    setWasteSaving(true);
    try {
      await api.wasteMaterial(wasteForm.materialId, quantity, wasteForm.reason);
      toast("success", "Merma registrada");
      setWasteEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setWasteSaving(false);
    }
  };

  const openConsumptionCreate = () => {
    setConsumptionForm(emptyConsumptionForm);
    setConsumptionEditorOpen(true);
  };

  const saveConsumption = async () => {
    if (consumptionForm.productId === null) {
      toast("error", "Selecciona un producto");
      return;
    }
    const quantity = Number(consumptionForm.quantity);
    if (!(quantity > 0)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    setConsumptionSaving(true);
    try {
      await api.internalConsumption(consumptionForm.productId, quantity);
      toast("success", "Consumo interno registrado (receta descontada)");
      setConsumptionEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setConsumptionSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.adjustStock(deleteTarget.id, 0, "ajuste");
      toast("success", `Movimiento eliminado`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!materials || !products) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  const activeProducts = products.filter((p) => p.active && p.recipe.length > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Mermas y consumo interno"
          subtitle={
            tab === "merma"
              ? "Registra desperdicios, vencidos, roturas o muestras de materiales"
              : "Registra productos consumidos sin venta (gerente, personal, degustaciones) — solo descuenta la receta"
          }
          actions={
            tab === "merma" ? (
              <Button variant="primary" onClick={openWasteCreate}>
                <Trash2 size={15} />
                Registrar merma
              </Button>
            ) : (
              <Button variant="primary" onClick={openConsumptionCreate}>
                <UserMinus size={15} />
                Registrar consumo
              </Button>
            )
          }
        />

        <Tabs
          tabs={[
            { value: "merma" as Tab, label: "Mermas (materiales)" },
            { value: "consumo" as Tab, label: "Consumo interno (productos)" },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div className="relative mb-4 max-w-md">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder={tab === "merma" ? "Buscar material…" : "Buscar producto…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {tab === "merma" ? (
          <>
            {filteredMaterials.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Boxes size={22} />}
                  title={materials.length === 0 ? "Sin materiales" : "Sin resultados"}
                  description={
                    materials.length === 0
                      ? "Primero registra materiales en la sección Materiales."
                      : "Prueba con otro término de búsqueda."
                  }
                />
              </Card>
            ) : (
              <Card className="divide-y divide-white/[0.04]">
                {filteredMaterials.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 flex-1 basis-36">
                      <p className="truncate text-sm font-medium text-zinc-100">{m.name}</p>
                      <p className="text-[11px] text-zinc-500">
                        Stock: {fmtQty(m.stock)} {m.unit} · Costo: {fmtMoney(m.costPerUnit)}/{m.unit}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge tone="warn" className="text-xs">
                        {fmtQty(m.stock)} {m.unit}
                      </Badge>
                    </div>
                  </div>
                ))}
              </Card>
            )}

            {wasteMovements.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-400">Historial de mermas</h3>
                <Card className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                  {wasteMovements.slice(0, 20).map((mv) => (
                    <div key={mv.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-36 shrink-0 text-xs tabular-nums text-zinc-500">
                        {mv.createdAt}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">{mv.materialName}</p>
                      <span className="w-28 text-right text-sm font-medium tabular-nums text-red-400">
                        {fmtQty(mv.change)} {mv.change > 0 ? "+" : ""}
                      </span>
                      <Badge tone="warn" className="w-24 justify-center">
                        {REASON_LABELS[mv.reason] ?? mv.reason}
                      </Badge>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </>
        ) : (
          <>
            {filteredProducts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Boxes size={22} />}
                  title={activeProducts.length === 0 ? "Sin productos con receta" : "Sin resultados"}
                  description={
                    activeProducts.length === 0
                      ? "Crea productos con receta en la sección Menú para poder registrar consumo interno."
                      : "Prueba con otro término de búsqueda."
                  }
                />
              </Card>
            ) : (
              <Card className="divide-y divide-white/[0.04]">
                {filteredProducts
                  .filter((p) => p.active && p.recipe.length > 0)
                  .map((p) => {
                    const recipeCost = p.recipe.reduce(
                      (acc, r) => acc + r.costPerUnit * r.quantity,
                      0
                    );
                    return (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
                      >
                        <div className="min-w-0 flex-1 basis-36">
                          <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {p.category} · {p.recipe.length} ingredientes · Costo receta: {fmtMoney(recipeCost)}
                          </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                          <Badge tone="accent" className="text-xs">
                            {fmtMoney(p.price)}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
              </Card>
            )}

            {consumptionMovements.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-400">Historial de consumo interno</h3>
                <Card className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                  {consumptionMovements.slice(0, 20).map((mv) => (
                    <div key={mv.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-36 shrink-0 text-xs tabular-nums text-zinc-500">
                        {mv.createdAt}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">{mv.materialName}</p>
                      <span className="w-28 text-right text-sm font-medium tabular-nums text-amber-400">
                        {fmtQty(mv.change)}
                      </span>
                      <Badge tone="warn" className="w-24 justify-center">
                        {REASON_LABELS[mv.reason] ?? mv.reason}
                      </Badge>
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Waste Editor */}
      <Modal
        open={wasteEditorOpen}
        onClose={() => setWasteEditorOpen(false)}
        title="Registrar merma de material"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWasteEditorOpen(false)} disabled={wasteSaving}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={saveWaste} loading={wasteSaving}>
              Registrar merma
            </Button>
          </>
        }
      >
        <Field label="Material" hint="Selecciona el material a descontar">
          <Select
            value={wasteForm.materialId?.toString() ?? ""}
            onChange={(e) => setWasteForm({ ...wasteForm, materialId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Seleccionar material…</option>
            {materials?.map((m) => (
              <option key={m.id} value={m.id.toString()}>
                {m.name} ({m.unit}) · Stock: {fmtQty(m.stock)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad a descontar">
            <Input
              type="number"
              min="0"
              step="any"
              value={wasteForm.quantity}
              onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Motivo">
            <Select
              value={wasteForm.reason}
              onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
            >
              <option value="">Seleccionar motivo…</option>
              {wasteReasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {wasteForm.materialId && wasteForm.quantity && (
          <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-3 text-xs">
            <p className="text-zinc-400">
              Se descontarán <span className="text-red-400 font-medium">{wasteForm.quantity}</span> unidades del stock.
            </p>
          </div>
        )}
      </Modal>

      {/* Consumption Editor */}
      <Modal
        open={consumptionEditorOpen}
        onClose={() => setConsumptionEditorOpen(false)}
        title="Registrar consumo interno"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsumptionEditorOpen(false)} disabled={consumptionSaving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveConsumption} loading={consumptionSaving}>
              Registrar consumo
            </Button>
          </>
        }
      >
        <Field label="Producto" hint="Selecciona el producto (se descontarán sus ingredientes de la receta)">
          <Select
            value={consumptionForm.productId?.toString() ?? ""}
            onChange={(e) => setConsumptionForm({ ...consumptionForm, productId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Seleccionar producto…</option>
            {activeProducts.map((p) => (
              <option key={p.id} value={p.id.toString()}>
                {p.name} ({p.category})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad de unidades">
            <Input
              type="number"
              min="1"
              step="1"
              value={consumptionForm.quantity}
              onChange={(e) => setConsumptionForm({ ...consumptionForm, quantity: e.target.value })}
              placeholder="1"
            />
          </Field>
          <div className="pt-6" />
        </div>
        {consumptionForm.productId && consumptionForm.quantity && (
          <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-3 text-xs">
            <p className="text-zinc-400 font-medium mb-2">Materiales que se descontarán:</p>
            {activeProducts
              .find((p) => p.id === consumptionForm.productId)
              ?.recipe.map((r) => (
                <p key={r.materialId} className="text-zinc-300">
                  - {r.materialName}: {fmtQty(r.quantity * Number(consumptionForm.quantity))} {r.unit}
                </p>
              ))}
          </div>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Eliminar movimiento"
        confirmLabel="Eliminar"
        message="¿Seguro que quieres eliminar este movimiento? Se revertirá el stock."
      />
    </div>
  );
}