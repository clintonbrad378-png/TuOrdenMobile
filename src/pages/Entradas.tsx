import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Package, Search, Truck } from "lucide-react";
import { api } from "../lib/api";
import type { Material } from "../lib/types";
import { errMsg, fmtMoney, fmtQty } from "../lib/format";
import {
  parseLocaleNumber,
  weightedAverage,
  getUnitInputConfig,
} from "../lib/numbers";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from "../components/ui";

const emptyForm = { materialId: null as number | null, quantity: "", costPerUnit: "" };

export default function Entradas() {
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [search, setSearch] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const mats = await api.listMaterials();
      setMaterials(mats);
    } catch (e) {
      toast("error", errMsg(e));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (materials ?? []).filter((m) => q === "" || m.name.toLowerCase().includes(q));
  }, [materials, search]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditorOpen(true);
  };

  const saveEntry = async () => {
    if (form.materialId === null) {
      toast("error", "Selecciona un material");
      return;
    }
    const quantity = parseLocaleNumber(form.quantity);
    const costPerUnit = parseLocaleNumber(form.costPerUnit);
    if (Number.isNaN(quantity)) {
      toast("error", "Ingresa una cantidad válida");
      return;
    }
    if (Number.isNaN(costPerUnit)) {
      toast("error", "Ingresa un costo válido");
      return;
    }
    if (!getUnitInputConfig(selectedMaterial?.unit ?? "").validate(quantity)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    if (costPerUnit < 0) {
      toast("error", "El costo no puede ser negativo");
      return;
    }
    setSaving(true);
    try {
      await api.receiveMaterial({ materialId: form.materialId, quantity, costPerUnit });
      toast("success", "Entrada registrada y costo actualizado");
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (!materials) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  const selectedMaterial = materials.find((m) => m.id === form.materialId) ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Entradas de materiales"
          subtitle="Registra recepciones de mercancía con nuevo precio de costo (promedio ponderado)"
          actions={
            <Button variant="primary" onClick={openCreate}>
              <Truck size={15} />
              Nueva entrada
            </Button>
          }
        />

        <div className="relative mb-4 max-w-md">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
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
                  ? "Primero registra materiales en la sección Materiales."
                  : "Prueba con otro término de búsqueda."
              }
              action={
                materials.length === 0 ? (
                  <Button variant="primary" onClick={openCreate}>
                    <Package size={15} />
                    Nuevo material
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card className="divide-y divide-white/[0.04]">
            {filtered.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4 sm:px-5"
              >
                <div className="min-w-0 flex-1 basis-36">
                  <p className="truncate text-sm font-medium text-zinc-100">{m.name}</p>
                  <p className="text-[11px] text-zinc-500">
                    Unidad: {m.unit} · Stock: {fmtQty(m.stock)} · Costo actual: {fmtMoney(m.costPerUnit)}/{m.unit}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Badge tone="accent" className="text-xs">
                    {fmtMoney(m.costPerUnit)}/{m.unit}
                  </Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="Registrar entrada de material"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveEntry} loading={saving}>
              Registrar entrada
            </Button>
          </>
        }
      >
        <Field label="Material" hint="Selecciona el material a recibir">
          <Select
            value={form.materialId?.toString() ?? ""}
            onChange={(e) => setForm({ ...form, materialId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Seleccionar material…</option>
            {materials?.map((m) => (
              <option key={m.id} value={m.id.toString()}>
                {m.name} ({m.unit})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad a recibir">
            <Input
              type="number"
              min={getUnitInputConfig(selectedMaterial?.unit ?? "").min}
              step={getUnitInputConfig(selectedMaterial?.unit ?? "").step}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder={getUnitInputConfig(selectedMaterial?.unit ?? "").placeholder}
            />
          </Field>
          <Field label="Nuevo costo por unidad" hint="Se calculará el promedio ponderado con el stock actual">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.costPerUnit}
              onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
              placeholder="0.00"
            />
          </Field>
        </div>
        {selectedMaterial && (
          <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-3 text-xs">
            <p className="text-zinc-400">Material seleccionado: <span className="text-zinc-100 font-medium">{selectedMaterial.name}</span></p>
            <p className="text-zinc-400">Stock actual: <span className="text-zinc-100 font-medium">{fmtQty(selectedMaterial.stock)} {selectedMaterial.unit}</span></p>
            <p className="text-zinc-400">Costo actual: <span className="text-zinc-100 font-medium">{fmtMoney(selectedMaterial.costPerUnit)}/{selectedMaterial.unit}</span></p>
            {form.quantity && form.costPerUnit && (
              <p className="text-zinc-400">
                Nuevo costo estimado:{" "}
                <span className="text-emerald-400 font-medium">
                  {fmtMoney(
                    weightedAverage(
                      selectedMaterial.stock,
                      selectedMaterial.costPerUnit,
                      parseLocaleNumber(form.quantity),
                      parseLocaleNumber(form.costPerUnit)
                    )
                  )}/{selectedMaterial.unit}
                </span>
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}