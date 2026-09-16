import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { api } from "../lib/api";
import type { Material, Product } from "../lib/types";
import { errMsg, fmtMoney, fmtQty } from "../lib/format";
import { compatibleUnits, convertQty, unitFamily } from "../lib/units";
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
  Spinner,
  Switch,
  cn,
  useToast,
} from "../components/ui";

interface RecipeRow {
  materialId: number | null;
  quantity: string;
  unit: string;
}

const emptyForm = {
  name: "",
  category: "",
  price: "",
  active: true,
  tracksStock: false,
  stock: "",
  minStock: "",
  manualCost: "",
};

/* ---------- Combobox de materiales ---------- */

function MaterialPicker({
  materials,
  value,
  onChange,
}: {
  materials: Material[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = materials.find((m) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? materials : materials.filter((m) => m.name.toLowerCase().includes(q));
  }, [materials, query]);

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={selected?.name}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
          open
            ? "border-accent-500/50 ring-2 ring-accent-500/15"
            : "border-white/10 hover:border-zinc-600",
          "bg-surface-800",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            selected ? "text-zinc-100" : "text-zinc-600",
          )}
        >
          {selected ? selected.name : "Seleccionar material…"}
        </span>
        {selected && (
          <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
            {selected.unit}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn("shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-surface-800 shadow-2xl">
            <div className="border-b border-white/[0.06] p-2">
              <input
                autoFocus
                placeholder="Buscar material…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                className="w-full rounded-lg bg-surface-700 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-5 text-center text-xs text-zinc-500">Sin resultados</p>
              ) : (
                filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]",
                      m.id === value && "bg-accent-500/[0.08]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-100">
                      {m.name}
                      {m.id === value && (
                        <CheckMark />
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                      Stock {fmtQty(m.stock)} {m.unit} · {fmtMoney(m.costPerUnit)}/{m.unit}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CheckMark() {
  return <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent-400 align-middle" />;
}

/** Unidad de entrada por defecto: gramos para masa (más exacto por porción),
 *  unidad de stock en los demás casos. */
function defaultRecipeUnit(mat: Material | null | undefined): string {
  if (!mat) return "g";
  return unitFamily(mat.unit) === "mass" ? "g" : mat.unit;
}

/* ---------- Página ---------- */

export default function Menu() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [prods, mats] = await Promise.all([
        api.listProducts(true),
        api.listMaterials(),
      ]);
      setProducts(prods);
      setMaterials(mats);
    } catch (e) {
      toast("error", errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.category))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => (showInactive ? true : p.active))
      .filter(
        (p) => q === "" || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
      );
  }, [products, search, showInactive]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setRecipe([]);
    setEditorOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      price: String(p.price),
      active: p.active,
      tracksStock: p.tracksStock ?? false,
      stock: String(p.stock ?? 0),
      minStock: String(p.minStock ?? 0),
      manualCost: String(p.manualCost ?? 0),
    });
    setRecipe(
      p.recipe.map((r) => {
        const mat = materials.find((m) => m.id === r.materialId) ?? null;
        const dispUnit = defaultRecipeUnit(mat);
        const dispQty =
          mat && dispUnit !== mat.unit
            ? (convertQty(r.quantity, mat.unit, dispUnit) ?? r.quantity)
            : r.quantity;
        return {
          materialId: r.materialId,
          quantity: String(Math.round(dispQty * 1000) / 1000),
          unit: dispUnit,
        };
      }),
    );
    setEditorOpen(true);
  };

  /** Costo de una fila convertido a la unidad de stock del material. */
  const rowStockQty = (row: RecipeRow): number | null => {
    const mat = materials.find((m) => m.id === row.materialId);
    if (!mat) return null;
    const q = Number(row.quantity);
    if (!(q > 0)) return null;
    return convertQty(q, row.unit || mat.unit, mat.unit);
  };

  const recipeCost = useMemo(() => {
    return recipe.reduce((acc, row) => {
      const mat = materials.find((m) => m.id === row.materialId);
      if (!mat) return acc;
      const stockQty = rowStockQty(row);
      if (stockQty === null) return acc;
      return acc + mat.costPerUnit * stockQty;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe, materials]);

  const priceNum = Number(form.price) || 0;
  const margin =
    priceNum > 0 && recipeCost > 0 ? ((priceNum - recipeCost) / priceNum) * 100 : null;
  const profitPerUnit = Math.max(0, priceNum - recipeCost);

  // El costo del producto por stock NACE de la receta: siempre es el costo
  // de receta vigente. Solo si no hay receta (revendido) se usa costo manual.
  const hasRecipe = recipe.length > 0;
  const effectiveUnitCost = form.tracksStock
    ? hasRecipe
      ? recipeCost
      : Number(form.manualCost) || 0
    : recipeCost;
  const stockMargin =
    form.tracksStock && priceNum > 0 && effectiveUnitCost > 0
      ? ((priceNum - effectiveUnitCost) / priceNum) * 100
      : null;
  const stockProfit = form.tracksStock ? Math.max(0, priceNum - effectiveUnitCost) : profitPerUnit;

  const saveProduct = async () => {
    if (!form.name.trim()) {
      toast("error", "El nombre del producto es obligatorio");
      return;
    }
    if (!(Number(form.price) >= 0) || form.price === "") {
      toast("error", "Ingresa un precio válido");
      return;
    }
    if (form.tracksStock && !hasRecipe && !(Number(form.manualCost) >= 0 && form.manualCost !== "")) {
      toast("error", "Sin receta: ingresa el costo fijo por unidad (puede ser 0)");
      return;
    }
    // Convertir cada fila a la unidad de stock del material antes de guardar.
    const converted: { materialId: number; quantity: number }[] = [];
    for (const r of recipe) {
      const mat = materials.find((m) => m.id === r.materialId);
      if (r.materialId === null || !mat || !(Number(r.quantity) > 0)) {
        toast("error", "Completa la receta: selecciona material y cantidad mayor a cero");
        return;
      }
      const stockQty = convertQty(Number(r.quantity), r.unit || mat.unit, mat.unit);
      if (stockQty === null || !(stockQty > 0)) {
        toast("error", `Unidad incompatible para "${mat.name}"`);
        return;
      }
      converted.push({ materialId: r.materialId, quantity: Math.round(stockQty * 100000) / 100000 });
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "General",
      price: Number(form.price),
      active: form.active,
      recipe: converted,
      tracksStock: form.tracksStock,
      stock: editingId === null ? Number(form.stock) || 0 : 0,
      minStock: form.tracksStock ? Number(form.minStock) || 0 : 0,
      // Costo nace de la receta; solo manual cuando no hay receta.
      manualCost: form.tracksStock ? (hasRecipe ? recipeCost : Number(form.manualCost) || 0) : 0,
    };
    try {
      if (editingId === null) await api.createProduct(payload);
      else await api.updateProduct(editingId, payload);
      toast("success", editingId === null ? "Producto creado" : "Producto actualizado");
      setEditorOpen(false);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProduct(deleteTarget.id);
      toast("success", `Producto "${deleteTarget.name}" eliminado`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  if (!products) {
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
          title="Menú"
          subtitle={`${products.filter((p) => p.active).length} productos activos`}
          actions={
            <>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                Ver inactivos
                <Switch checked={showInactive} onChange={setShowInactive} />
              </label>
              <Button variant="primary" onClick={openCreate}>
                <Plus size={15} />
                Nuevo producto
              </Button>
            </>
          }
        />

        <div className="relative mb-4 max-w-md">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Buscar producto o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={<UtensilsCrossed size={22} />}
              title={products.length === 0 ? "Tu menú está vacío" : "Sin resultados"}
              description={
                products.length === 0
                  ? "Crea tu primer producto y define su receta de materiales."
                  : "Ajusta la búsqueda o activa 'Ver inactivos'."
              }
              action={
                products.length === 0 ? (
                  <Button variant="primary" onClick={openCreate}>
                    <Plus size={15} />
                    Nuevo producto
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card className="divide-y divide-white/[0.05]">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => openEdit(p)}
                className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] active:bg-white/[0.03] sm:gap-4 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm font-medium", p.active ? "text-zinc-100" : "text-zinc-500")}>
                      {p.name}
                    </p>
                    {!p.active && <Badge tone="zinc">Inactivo</Badge>}
                    {p.tracksStock && <Badge tone="accent">Por stock</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {p.category} ·{" "}
                    {p.tracksStock ? (
                      <>Stock: {fmtQty(p.stock)} u{p.minStock > 0 ? ` · Mín ${fmtQty(p.minStock)}` : ""} · </>
                    ) : null}
                    {p.recipe.length > 0
                      ? `${p.recipe.length} ingrediente${p.recipe.length > 1 ? "s" : ""}`
                      : "sin receta"}
                    {p.tracksStock && p.recipe.length > 0 ? " · para producir" : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-accent-400">
                  {fmtMoney(p.price)}
                </span>
                <Switch
                  checked={p.active}
                  onChange={(v) =>
                    api
                      .setProductActive(p.id, v)
                      .then(load)
                      .catch((e) => toast("error", errMsg(e)))
                  }
                />
                <div className="flex items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(p);
                    }}
                    onKeyDown={() => {}}
                    className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                  >
                    <Pencil size={14} />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(p);
                    }}
                    onKeyDown={() => {}}
                    className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </span>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId === null ? "Nuevo producto" : "Editar producto"}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveProduct} loading={saving}>
              {editingId === null ? "Crear producto" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Pizza personal"
            />
          </Field>
          <Field label="Categoría">
            <>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="General"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          </Field>
          <Field label="Precio de venta">
            <Input
              type="number"
              min="0"
              step="any"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="0.00"
            />
          </Field>
          <label className="mt-6 flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-2">
            <span className="text-sm text-zinc-300">Producto activo</span>
            <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
          </label>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-accent-500/25 bg-accent-500/[0.06] px-4 py-3">
          <span className="text-sm text-zinc-200">
            Vender por stock
            <span className="block text-[11px] font-normal text-zinc-500">
              {form.tracksStock
                ? "La venta descuenta unidades del producto. La receta solo se usa al producir."
                : "La venta descuenta materiales de la receta en cada venta (flujo actual)."}
            </span>
          </span>
          <Switch checked={form.tracksStock} onChange={(v) => setForm({ ...form, tracksStock: v })} />
        </label>

        {form.tracksStock && (
          <div className="grid grid-cols-3 gap-4">
            {editingId === null && (
              <Field label="Stock inicial (u)" hint="Unidades ya elaboradas">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="0"
                />
              </Field>
            )}
            <Field label="Stock mínimo (u)" hint="Alerta cuando baje de aquí">
              <Input
                type="number"
                min="0"
                step="1"
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                placeholder="0"
              />
            </Field>
            {!hasRecipe && (
              <Field label="Costo fijo / unidad" hint="Solo sin receta (revendido)">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.manualCost}
                  onChange={(e) => setForm({ ...form, manualCost: e.target.value })}
                  placeholder="0.00"
                />
              </Field>
            )}
          </div>
        )}

        {form.tracksStock && hasRecipe && (
          <p className="rounded-lg border border-accent-500/20 bg-accent-500/[0.06] px-3 py-2 text-xs text-accent-400/90">
            Costo por unidad = costo de receta ({fmtMoney(recipeCost)}). Se calcula solo y se usa en ganancia, ventas y producción.
          </p>
        )}

        {form.tracksStock && editingId !== null && (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500">
            El stock se gestiona desde Producción (elaborar) o con ajustes manuales. Aquí solo puedes cambiar mínimo y receta.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-zinc-400">
              {form.tracksStock
                ? "Receta para producción · no se descuenta en venta"
                : "Receta · materiales por unidad vendida"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRecipe([...recipe, { materialId: null, quantity: "", unit: "g" }])}
              disabled={materials.length === 0}
            >
              <Plus size={13} />
              Ingrediente
            </Button>
          </div>

          {materials.length === 0 && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400/90">
              Primero registra materiales en la sección Materiales para poder armar recetas.
            </p>
          )}
          <p className="text-[11px] text-zinc-600">
            Puedes pesar en gramos aunque el material esté en libras: elige la unidad por ingrediente y se convierte solo al stock.
          </p>

          {recipe.map((row, i) => {
            const mat = materials.find((m) => m.id === row.materialId) ?? null;
            const stockQty = rowStockQty(row);
            const lineCost = mat && stockQty !== null ? mat.costPerUnit * stockQty : null;
            const units = mat ? compatibleUnits(mat.unit) : ["g", "kg", "lb", "oz", "ml", "L", "u"];
            const showConv = mat && row.unit && row.unit !== mat.unit && stockQty !== null;
            return (
              <div
                key={i}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
              >
                <div className="flex items-center gap-2">
                  <MaterialPicker
                    materials={materials}
                    value={row.materialId}
                    onChange={(id) => {
                      const next = [...recipe];
                      const m = materials.find((x) => x.id === id) ?? null;
                      next[i] = { ...next[i], materialId: id, unit: defaultRecipeUnit(m) };
                      setRecipe(next);
                    }}
                  />
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
                    value={row.unit || mat?.unit || "g"}
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
                  {mat && (
                    <span className="text-[11px] text-zinc-600">
                      stock en {mat.unit}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-zinc-500">
                    Costo línea:{" "}
                    <strong className="font-medium text-zinc-300">
                      {lineCost !== null ? fmtMoney(lineCost) : "—"}
                    </strong>
                  </span>
                </div>
                {showConv && mat && (
                  <p className="mt-1 px-0.5 text-[11px] tabular-nums text-zinc-600">
                    {row.quantity} {row.unit} = {fmtQty(stockQty ?? 0)} {mat.unit} de "{mat.name}"
                  </p>
                )}
              </div>
            );
          })}

          {(recipeCost > 0 || margin !== null) && !form.tracksStock && (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-2.5 text-xs">
              <span className="text-zinc-400">
                Costo de receta:{" "}
                <strong className="text-zinc-100">{fmtMoney(recipeCost)}</strong>
                <span className="mx-2 text-zinc-600">·</span>
                Ganancia estimada:{" "}
                <strong className="text-accent-400">+{fmtMoney(profitPerUnit)}</strong> / unidad
              </span>
              {margin !== null && (
                <Badge tone={margin >= 30 ? "success" : margin >= 10 ? "warn" : "danger"}>
                  Margen {margin.toFixed(0)}%
                </Badge>
              )}
            </div>
          )}
          {form.tracksStock && (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-2.5 text-xs">
              <span className="text-zinc-400">
                Costo unidad (de receta):{" "}
                <strong className="text-zinc-100">{fmtMoney(effectiveUnitCost)}</strong>
                <span className="mx-2 text-zinc-600">·</span>
                Ganancia:{" "}
                <strong className="text-accent-400">+{fmtMoney(stockProfit)}</strong> / unidad
              </span>
              {stockMargin !== null && (
                <Badge tone={stockMargin >= 30 ? "success" : stockMargin >= 10 ? "warn" : "danger"}>
                  Margen {stockMargin.toFixed(0)}%
                </Badge>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title="Eliminar producto"
        confirmLabel="Eliminar"
        message={
          <>
            ¿Seguro que quieres eliminar <strong>{deleteTarget?.name}</strong>? Las ventas
            anteriores conservarán su historial, pero dejará de existir en el menú.
          </>
        }
      />
    </div>
  );
}
