import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, CookingPot, Factory, Minus, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import type {
  Material,
  MaterialProduction,
  MaterialProductionEstimate,
  Product,
  Production,
  ProductionEstimate,
} from "../lib/types";
import { errMsg, fmtDateTime, fmtMoney, fmtQty } from "../lib/format";
import { convertQty, costEquivalents } from "../lib/units";
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
  Tabs,
  cn,
  useToast,
} from "../components/ui";

type ProdTab = "productos" | "materiales";

export default function Produccion() {
  const [prodTab, setProdTab] = useState<ProdTab>("productos");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productions, setProductions] = useState<Production[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<ProductionEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [producing, setProducing] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"entrada" | "salida">("entrada");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // --- Elaboración de materiales ---
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matSearch, setMatSearch] = useState("");
  const [matSelectedId, setMatSelectedId] = useState<number | null>(null);
  const [matEstimate, setMatEstimate] = useState<MaterialProductionEstimate | null>(null);
  const [matEstimateLoading, setMatEstimateLoading] = useState(false);
  const [matQuantity, setMatQuantity] = useState("");
  const [matNote, setMatNote] = useState("");
  const [matProducing, setMatProducing] = useState(false);
  const [matProductions, setMatProductions] = useState<MaterialProduction[]>([]);

  // --- Calculadora de escala (opcional) ---
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMode, setCalcMode] = useState<"material" | "final">("material");
  const [calcTarget, setCalcTarget] = useState("");
  const [finalUnits, setFinalUnits] = useState("800");
  const [finalWeightG, setFinalWeightG] = useState("80");
  const [wastePct, setWastePct] = useState("5");
  const [finalProductId, setFinalProductId] = useState<string>("");

  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [prods, hist, mats, matHist] = await Promise.all([
        api.listProducts(true),
        api.listProductions(100),
        api.listMaterials(),
        api.listMaterialProductions(100),
      ]);
      setProducts(prods);
      setProductions(hist);
      setMaterials(mats);
      setMatProductions(matHist);
      const firstProd = prods.find((p) => p.tracksStock && p.active);
      if (firstProd) setSelectedId((prev) => prev ?? firstProd.id);
      const firstElab = mats.find((m) => m.isElaborated);
      if (firstElab) setMatSelectedId((prev) => prev ?? firstElab.id);
    } catch (e) {
      toast("error", errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stockProducts = useMemo(
    () => (products ?? []).filter((p) => p.tracksStock),
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockProducts.filter((p) => q === "" || p.name.toLowerCase().includes(q));
  }, [stockProducts, search]);

  const selected = useMemo(
    () => stockProducts.find((p) => p.id === selectedId) ?? null,
    [stockProducts, selectedId],
  );

  const loadEstimate = useCallback(
    async (id: number) => {
      setEstimateLoading(true);
      try {
        setEstimate(await api.estimateProduction(id));
      } catch (e) {
        toast("error", errMsg(e));
        setEstimate(null);
      } finally {
        setEstimateLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (selectedId !== null) loadEstimate(selectedId);
    else setEstimate(null);
  }, [selectedId, loadEstimate]);

  const maxUnits = estimate?.maxUnits ?? 0;
  const qtyNum = Math.floor(Number(quantity) || 0);

  const doProduce = async () => {
    if (!selected) return;
    if (!(qtyNum > 0)) {
      toast("error", "Ingresa una cantidad entera mayor a cero");
      return;
    }
    if (qtyNum > maxUnits) {
      toast("error", `No alcanza el material: máximo ${maxUnits} u (limita ${estimate?.limitingMaterial ?? "—"})`);
      return;
    }
    setProducing(true);
    try {
      const prod = await api.produceStock({
        productId: selected.id,
        quantity: qtyNum,
        note: note.trim() || null,
      });
      toast("success", `Producción registrada: ${fmtQty(prod.quantity)} u de "${prod.productName}"`);
      setQuantity("");
      setNote("");
      await load();
      await loadEstimate(selected.id);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setProducing(false);
    }
  };

  const doAdjust = async () => {
    if (!selected) return;
    const q = Number(adjustQty);
    if (!(q > 0)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    setAdjusting(true);
    try {
      await api.adjustProductStock({
        productId: selected.id,
        change: adjustMode === "entrada" ? q : -q,
        reason: adjustMode,
      });
      toast("success", "Stock ajustado");
      setAdjustOpen(false);
      setAdjustQty("");
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setAdjusting(false);
    }
  };

  // ---------- Materiales elaborados ----------

  const elaborated = useMemo(() => materials.filter((m) => m.isElaborated), [materials]);

  const matFiltered = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    return elaborated.filter((m) => q === "" || m.name.toLowerCase().includes(q));
  }, [elaborated, matSearch]);

  const matSelected = useMemo(
    () => elaborated.find((m) => m.id === matSelectedId) ?? null,
    [elaborated, matSelectedId],
  );

  const loadMatEstimate = useCallback(
    async (id: number) => {
      setMatEstimateLoading(true);
      try {
        setMatEstimate(await api.estimateMaterialProduction(id));
      } catch (e) {
        toast("error", errMsg(e));
        setMatEstimate(null);
      } finally {
        setMatEstimateLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (matSelectedId !== null) loadMatEstimate(matSelectedId);
    else setMatEstimate(null);
    setFinalProductId("");
  }, [matSelectedId, loadMatEstimate]);

  const matMax = matEstimate?.maxOutput ?? 0;
  const matQtyNum = Number(matQuantity) || 0;

  const doProduceMaterial = async () => {
    if (!matSelected) return;
    if (!(matQtyNum > 0)) {
      toast("error", "Ingresa una cantidad mayor a cero");
      return;
    }
    if (matQtyNum > matMax + 1e-9) {
      toast(
        "error",
        `No alcanza el insumo: máximo ${fmtQty(Math.floor(matMax * 1000) / 1000)} ${matSelected.unit} (limita ${matEstimate?.limitingMaterial ?? "—"})`,
      );
      return;
    }
    setMatProducing(true);
    try {
      const prod = await api.produceMaterial({
        materialId: matSelected.id,
        quantity: matQtyNum,
        note: matNote.trim() || null,
      });
      toast(
        "success",
        `Elaboración registrada: ${fmtQty(prod.quantity)} ${prod.unit} de "${prod.materialName}" · costo ${fmtMoney(prod.unitCost)}/${prod.unit}`,
      );
      setMatQuantity("");
      setMatNote("");
      await load();
      await loadMatEstimate(matSelected.id);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setMatProducing(false);
    }
  };

  // ---------- Calculadora de escala ----------
  // Modo "material": objetivo directo en unidad del material (ej. 141 lb de masa).
  // Modo "final": N porciones x peso g/u + % merma (0-99) -> masa necesaria -> insumos.
  const calcConvertible = useMemo(() => {
    if (!matEstimate) return true;
    return convertQty(1, "g", matEstimate.unit) !== null;
  }, [matEstimate]);

  const calcWasteError = useMemo(() => {
    if (calcMode !== "final") return null;
    const waste = Number(wastePct);
    if (wastePct.trim() !== "" && !(waste >= 0 && waste < 100))
      return "La merma debe estar entre 0 y 99%";
    return null;
  }, [calcMode, wastePct]);

  const calcObjetivo = useMemo(() => {
    if (!matEstimate || matEstimate.items.length === 0) return 0;
    if (calcMode === "material") {
      const t = Number(calcTarget) || 0;
      return t > 0 && Number.isFinite(t) ? t : 0;
    }
    const n = Number(finalUnits) || 0;
    const w = Number(finalWeightG) || 0;
    const waste = Number(wastePct) || 0;
    if (!(n > 0) || !(w > 0)) return 0;
    if (!(waste >= 0 && waste < 100)) return 0;
    const totalG = n * w;
    if (!Number.isFinite(totalG)) return 0;
    const totalInUnit = convertQty(totalG, "g", matEstimate.unit);
    if (totalInUnit === null) return 0;
    const factor = 1 - waste / 100;
    if (!(factor > 0)) return 0;
    return totalInUnit / factor;
  }, [calcMode, calcTarget, finalUnits, finalWeightG, wastePct, matEstimate]);

  const calcRows = useMemo(() => {
    if (!matEstimate || !(calcObjetivo > 0) || !(matEstimate.recipeYield > 0)) return [];
    const factor = calcObjetivo / matEstimate.recipeYield;
    return matEstimate.items.map((it) => {
      const need = it.baseQuantity * factor;
      const perUnit = it.requiredPerUnit;
      const missing = Math.max(0, need - it.stock);
      return {
        ...it,
        need,
        perUnit,
        missing,
        lineCost: need * it.costPerUnit,
      };
    });
  }, [matEstimate, calcObjetivo]);

  const calcTotal = useMemo(
    () => calcRows.reduce((a, r) => a + r.lineCost, 0),
    [calcRows],
  );
  const calcUnitCost = calcObjetivo > 0 ? calcTotal / calcObjetivo : 0;

  // Productos que usan el material seleccionado (para autocompletar gramaje).
  const productsUsingMat = useMemo(() => {
    if (!matSelected) return [];
    return (products ?? []).filter((p) =>
      p.recipe.some((r) => r.materialId === matSelected.id),
    );
  }, [products, matSelected]);

  const applyFinalProduct = (pidStr: string) => {
    setFinalProductId(pidStr);
    if (!pidStr || !matSelected) return;
    const p = (products ?? []).find((x) => x.id === Number(pidStr));
    if (!p) return;
    const line = p.recipe.find((r) => r.materialId === matSelected.id);
    if (!line) return;
    const g = convertQty(line.quantity, line.unit, "g");
    if (g !== null && g > 0) setFinalWeightG(String(Math.round(g * 100) / 100));
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
          title="Producción"
          subtitle="Elabora materiales (ej. masa) y producto terminado: descuenta insumos y suma stock"
          actions={
            <Tabs
              tabs={[
                { value: "productos" as ProdTab, label: "Productos" },
                { value: "materiales" as ProdTab, label: "Materiales" },
              ]}
              active={prodTab}
              onChange={setProdTab}
            />
          }
        />

        {prodTab === "productos" ? (
          stockProducts.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Factory size={22} />}
                title="Sin productos por stock"
                description="En Menú activa 'Vender por stock' en un producto (ej. hamburguesa) y opcionalmente cárgale su receta. Luego vuelve aquí a producir."
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              {/* Lista */}
              <div>
                <div className="relative mb-3">
                  <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
                  <Input
                    placeholder="Buscar producto por stock…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Card className="divide-y divide-white/[0.04] max-h-[60vh] overflow-y-auto">
                  {filtered.map((p) => {
                    const isOut = p.stock <= 0;
                    const isLow = !isOut && p.minStock > 0 && p.stock <= p.minStock;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]",
                          p.id === selectedId && "bg-accent-500/[0.07]",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-100">{p.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {p.recipe.length > 0 ? `${p.recipe.length} ingredientes` : "sin receta"} · Costo fijo {fmtMoney(p.manualCost)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-zinc-100",
                            )}
                          >
                            {fmtQty(p.stock)} u
                          </p>
                          {isOut ? (
                            <Badge tone="danger">Agotado</Badge>
                          ) : isLow ? (
                            <Badge tone="warn">Bajo</Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </Card>
              </div>

              {/* Detalle + producir */}
              <div className="space-y-4">
                {!selected ? (
                  <Card>
                    <EmptyState icon={<CookingPot size={22} />} title="Selecciona un producto" description="Elige de la lista para ver su receta y cuánto puedes producir." />
                  </Card>
                ) : (
                  <>
                    <Card className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-zinc-50">{selected.name}</h2>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {selected.category} · Precio {fmtMoney(selected.price)} · Costo fijo {fmtMoney(selected.manualCost)}/u · Stock {fmtQty(selected.stock)} u
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                          Ajuste manual
                        </Button>
                      </div>

                      {estimateLoading ? (
                        <div className="grid h-24 place-items-center">
                          <Spinner />
                        </div>
                      ) : !estimate || estimate.items.length === 0 ? (
                        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400/90">
                          Este producto no tiene receta. Solo puedes ajustar su stock manualmente (ej. producto revendido).
                        </p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-3">
                            <span className="text-xs text-zinc-400">
                              Puedes producir hasta{" "}
                              <strong className="text-lg text-zinc-50"> {maxUnits} u</strong>
                              {estimate.limitingMaterial && (
                                <span className="text-zinc-500"> · limita {estimate.limitingMaterial}</span>
                              )}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => setQuantity(String(maxUnits))} disabled={maxUnits <= 0}>
                              Usar máximo
                            </Button>
                          </div>
                          <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
                            {estimate.items.map((it) => {
                              const inG = it.unit !== "g" ? convertQty(it.requiredPerUnit, it.unit, "g") : null;
                              return (
                                <div key={it.materialId} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm text-zinc-200">{it.materialName}</p>
                                    <p className="text-[11px] tabular-nums text-zinc-500">
                                      {fmtQty(it.requiredPerUnit)} {it.unit}/u
                                      {inG !== null ? ` (${fmtQty(inG)} g/u)` : ""} · Stock {fmtQty(it.stock)} {it.unit}
                                    </p>
                                  </div>
                                  <Badge tone={it.maxUnits <= 0 ? "danger" : "zinc"}>máx {it.maxUnits}</Badge>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {estimate && estimate.items.length > 0 && (
                        <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                          <Field label="Unidades a producir">
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              placeholder={maxUnits > 0 ? `1 – ${maxUnits}` : "0"}
                            />
                          </Field>
                          <Field label="Nota (opcional)">
                            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lote, turno…" />
                          </Field>
                          <Button variant="primary" onClick={doProduce} loading={producing} disabled={!(qtyNum > 0)}>
                            <CookingPot size={15} />
                            Producir
                          </Button>
                        </div>
                      )}

                      {qtyNum > 0 && estimate && estimate.items.length > 0 && (
                        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-400">
                          <p className="font-medium text-zinc-300">Se descontará:</p>
                          {estimate.items.map((it) => (
                            <p key={it.materialId} className="tabular-nums">
                              · {it.materialName}: {fmtQty(it.requiredPerUnit * qtyNum)} {it.unit}
                            </p>
                          ))}
                          <p className="mt-1">
                            Y se sumarán <strong className="text-accent-400">{qtyNum} u</strong> al stock de "{selected.name}".
                          </p>
                        </div>
                      )}
                    </Card>

                    <div>
                      <h3 className="mb-2 text-sm font-medium text-zinc-400">Historial de producciones</h3>
                      <Card className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                        {productions.filter((pr) => pr.productId === selected.id).length === 0 ? (
                          <p className="px-5 py-4 text-xs text-zinc-600">Aún no hay producciones de este producto.</p>
                        ) : (
                          productions
                            .filter((pr) => pr.productId === selected.id)
                            .slice(0, 20)
                            .map((pr) => (
                              <div key={pr.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                                <span className="w-28 shrink-0 tabular-nums text-zinc-500">{fmtDateTime(pr.createdAt)}</span>
                                <span className="font-medium tabular-nums text-emerald-400">+{fmtQty(pr.quantity)} u</span>
                                <span className="min-w-0 flex-1 truncate text-zinc-500">{pr.note ?? `Costo mat. ${fmtMoney(pr.totalMaterialCost)}`}</span>
                              </div>
                            ))
                        )}
                      </Card>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        ) : elaborated.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Factory size={22} />}
              title="Sin materiales elaborados"
              description="En Materiales activa 'Es material elaborado' (ej. Masa de hamburguesa) y cárgale su receta con rendimiento. Luego elabóralo aquí."
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <div className="relative mb-3">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Buscar material elaborado…"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Card className="divide-y divide-white/[0.04] max-h-[60vh] overflow-y-auto">
                {matFiltered.map((m) => {
                  const isOut = m.stock <= 0;
                  const isLow = !isOut && m.minStock > 0 && m.stock <= m.minStock;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMatSelectedId(m.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]",
                        m.id === matSelectedId && "bg-accent-500/[0.07]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">{m.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {(m.recipe ?? []).length} insumos · Rinde {fmtQty(m.recipeYield)} {m.unit} · {fmtMoney(m.costPerUnit)}/{m.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            isOut ? "text-red-400" : isLow ? "text-amber-400" : "text-zinc-100",
                          )}
                        >
                          {fmtQty(m.stock)} {m.unit}
                        </p>
                        {isOut ? (
                          <Badge tone="danger">Agotado</Badge>
                        ) : isLow ? (
                          <Badge tone="warn">Bajo</Badge>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </Card>
            </div>

            <div className="space-y-4">
              {!matSelected ? (
                <Card>
                  <EmptyState icon={<CookingPot size={22} />} title="Selecciona un material" description="Elige de la lista para ver su receta y cuánto puedes elaborar." />
                </Card>
              ) : (
                <>
                  <Card className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-zinc-50">{matSelected.name}</h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Stock {fmtQty(matSelected.stock)} {matSelected.unit} · Costo {fmtMoney(matSelected.costPerUnit)}/{matSelected.unit} · Receta rinde {fmtQty(matSelected.recipeYield)} {matSelected.unit}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setCalcOpen((o) => !o)}>
                        <Calculator size={14} />
                        {calcOpen ? "Ocultar escala" : "Escala / gramaje"}
                      </Button>
                    </div>

                    {matEstimateLoading ? (
                      <div className="grid h-24 place-items-center">
                        <Spinner />
                      </div>
                    ) : !matEstimate || matEstimate.items.length === 0 ? (
                      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400/90">
                        Este material no tiene receta. Edítalo en Materiales y agrega insumos + rendimiento.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-3">
                          <span className="text-xs text-zinc-400">
                            Puedes elaborar hasta{" "}
                            <strong className="text-lg text-zinc-50">
                              {" "}
                              {fmtQty(Math.floor(matMax * 1000) / 1000)} {matEstimate.unit}
                            </strong>
                            {matEstimate.limitingMaterial && (
                              <span className="text-zinc-500"> · limita {matEstimate.limitingMaterial}</span>
                            )}
                            <span className="block text-[11px] text-zinc-500">
                              Costo lote base ({fmtQty(matEstimate.recipeYield)} {matEstimate.unit}):{" "}
                              {fmtMoney(matEstimate.totalBatchCost)} · Costo/{matEstimate.unit}:{" "}
                              {fmtMoney(matEstimate.unitCost)}
                            </span>
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => setMatQuantity(String(Math.floor(matMax * 1000) / 1000))} disabled={matMax <= 0}>
                            Usar máximo
                          </Button>
                        </div>
                        <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
                          {matEstimate.items.map((it) => (
                            <div key={it.materialId} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-zinc-200">{it.materialName}</p>
                                <p className="text-[11px] tabular-nums text-zinc-500">
                                  {fmtQty(it.baseQuantity)} {it.unit} por {fmtQty(matEstimate.recipeYield)} {matEstimate.unit}
                                  {" "}· {fmtQty(it.requiredPerUnit)} {it.unit}/{matEstimate.unit} · Stock {fmtQty(it.stock)} {it.unit}
                                </p>
                              </div>
                              <Badge tone={it.maxOutput <= 0 ? "danger" : "zinc"}>
                                máx {fmtQty(Math.floor(it.maxOutput * 1000) / 1000)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {calcOpen && matEstimate && matEstimate.items.length > 0 && (
                      <div className="mt-4 space-y-3 rounded-xl border border-accent-500/25 bg-accent-500/[0.04] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-zinc-200">
                            Calculadora de escala <span className="font-normal text-zinc-500">(opcional)</span>
                          </p>
                          <Tabs
                            tabs={[
                              { value: "material" as const, label: `Por ${matEstimate.unit}` },
                              { value: "final" as const, label: "Por producto final" },
                            ]}
                            active={calcMode}
                            onChange={setCalcMode}
                          />
                        </div>

                        {calcMode === "material" ? (
                          <Field label={`Objetivo a elaborar (${matEstimate.unit})`} hint={`La receta base rinde ${fmtQty(matEstimate.recipeYield)} ${matEstimate.unit}`}>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={calcTarget}
                              onChange={(e) => setCalcTarget(e.target.value)}
                              placeholder={`Ej. ${fmtQty(matEstimate.recipeYield * 2)}`}
                            />
                          </Field>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Field label="Porciones">
                              <Input type="number" min="0" step="1" value={finalUnits} onChange={(e) => setFinalUnits(e.target.value)} placeholder="800" />
                            </Field>
                            <Field label="Peso c/u (g)">
                              <Input type="number" min="0" step="any" value={finalWeightG} onChange={(e) => setFinalWeightG(e.target.value)} placeholder="80" />
                            </Field>
                            <Field label="Merma %">
                              <Input type="number" min="0" step="any" value={wastePct} onChange={(e) => setWastePct(e.target.value)} placeholder="5" />
                            </Field>
                            <Field label="Producto final">
                              <Select value={finalProductId} onChange={(e) => applyFinalProduct(e.target.value)}>
                                <option value="">Manual…</option>
                                {productsUsingMat.map((p) => (
                                  <option key={p.id} value={String(p.id)}>
                                    {p.name}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                        )}

                        {calcMode === "final" && !calcConvertible && (
                          <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400/90">
                            "{matEstimate.materialName}" se mide en {matEstimate.unit}: el modo por
                            producto final (gramos) solo aplica a materiales de masa (g/kg/lb/oz).
                            Usa el modo "Por {matEstimate.unit}".
                          </p>
                        )}
                        {calcMode === "final" && calcWasteError && (
                          <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-400/90">
                            {calcWasteError}
                          </p>
                        )}
                        {calcMode === "final" && calcObjetivo > 0 && (
                          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-300">
                            Para <strong>{fmtQty(Number(finalUnits) || 0)} u</strong> de{" "}
                            <strong>{fmtQty(Number(finalWeightG) || 0)} g</strong>
                            {Number(wastePct) > 0 && <> (+{fmtQty(Number(wastePct))}% merma)</>} necesitas{" "}
                            <strong className="text-accent-400">
                              {fmtQty(calcObjetivo)} {matEstimate.unit}
                            </strong>{" "}
                            de "{matEstimate.materialName}".
                          </p>
                        )}

                        {calcRows.length > 0 && (
                          <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06] bg-surface-800">
                            {calcRows.map((r) => (
                              <div key={r.materialId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-zinc-200">{r.materialName}</p>
                                  <p className="tabular-nums text-[11px] text-zinc-500">
                                    {fmtQty(r.perUnit)} {r.unit}/{matEstimate.unit} · Stock {fmtQty(r.stock)} {r.unit}
                                  </p>
                                </div>
                                <span className="tabular-nums text-zinc-100">
                                  {fmtQty(r.need)} {r.unit}
                                </span>
                                {r.missing > 0 ? (
                                  <Badge tone="danger">falta {fmtQty(r.missing)}</Badge>
                                ) : (
                                  <Badge tone="success">alcanza</Badge>
                                )}
                                <span className="w-20 text-right tabular-nums text-zinc-400">{fmtMoney(r.lineCost)}</span>
                              </div>
                            ))}
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                              <span className="text-zinc-400">
                                Total lote: <strong className="text-zinc-100">{fmtMoney(calcTotal)}</strong>
                                <span className="mx-2 text-zinc-600">·</span>
                                Costo/{matEstimate.unit}:{" "}
                                <strong className="text-accent-400">{fmtMoney(calcUnitCost)}</strong>
                                {(() => {
                                  const eq = costEquivalents(calcUnitCost, matEstimate.unit).find((c) => c.unit === "g");
                                  return eq ? (
                                    <span className="text-zinc-500"> ({fmtMoney(eq.cost)}/g)</span>
                                  ) : null;
                                })()}
                              </span>
                              <Button size="sm" variant="outline" onClick={() => setMatQuantity(String(Math.round(calcObjetivo * 1000) / 1000))}>
                                Usar como cantidad
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {matEstimate && matEstimate.items.length > 0 && (
                      <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <Field label={`Cantidad a elaborar (${matSelected.unit})`}>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={matQuantity}
                            onChange={(e) => setMatQuantity(e.target.value)}
                            placeholder={matMax > 0 ? `0 – ${fmtQty(Math.floor(matMax * 1000) / 1000)}` : "0"}
                          />
                        </Field>
                        <Field label="Nota (opcional)">
                          <Input value={matNote} onChange={(e) => setMatNote(e.target.value)} placeholder="Lote, turno…" />
                        </Field>
                        <Button variant="primary" onClick={doProduceMaterial} loading={matProducing} disabled={!(matQtyNum > 0)}>
                          <CookingPot size={15} />
                          Elaborar
                        </Button>
                      </div>
                    )}

                    {matQtyNum > 0 && matEstimate && matEstimate.items.length > 0 && matEstimate.recipeYield > 0 && (
                      <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-zinc-400">
                        <p className="font-medium text-zinc-300">Se descontará:</p>
                        {matEstimate.items.map((it) => (
                          <p key={it.materialId} className="tabular-nums">
                            · {it.materialName}: {fmtQty((it.baseQuantity / matEstimate.recipeYield) * matQtyNum)} {it.unit}
                            {" "}({fmtMoney((it.baseQuantity / matEstimate.recipeYield) * matQtyNum * it.costPerUnit)})
                          </p>
                        ))}
                        <p className="mt-1">
                          Y se sumarán <strong className="text-accent-400">{fmtQty(matQtyNum)} {matEstimate.unit}</strong> al stock de "{matSelected.name}"
                          {" "}con costo <strong className="text-accent-400">{fmtMoney(matEstimate.unitCost)}/{matEstimate.unit}</strong>.
                        </p>
                      </div>
                    )}
                  </Card>

                  <div>
                    <h3 className="mb-2 text-sm font-medium text-zinc-400">Historial de elaboraciones</h3>
                    <Card className="divide-y divide-white/[0.04] max-h-64 overflow-y-auto">
                      {matProductions.filter((pr) => pr.materialId === matSelected.id).length === 0 ? (
                        <p className="px-5 py-4 text-xs text-zinc-600">Aún no hay elaboraciones de este material.</p>
                      ) : (
                        matProductions
                          .filter((pr) => pr.materialId === matSelected.id)
                          .slice(0, 20)
                          .map((pr) => (
                            <div key={pr.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                              <span className="w-28 shrink-0 tabular-nums text-zinc-500">{fmtDateTime(pr.createdAt)}</span>
                              <span className="font-medium tabular-nums text-emerald-400">+{fmtQty(pr.quantity)} {pr.unit}</span>
                              <span className="min-w-0 flex-1 truncate text-zinc-500">
                                {pr.note ?? `Costo ${fmtMoney(pr.totalMaterialCost)} (${fmtMoney(pr.unitCost)}/${pr.unit})`}
                              </span>
                            </div>
                          ))
                      )}
                    </Card>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ajuste manual */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={`Ajustar stock · ${selected?.name ?? ""}`}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustOpen(false)} disabled={adjusting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={doAdjust} loading={adjusting}>
              Registrar
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Stock actual: <strong className="text-zinc-100">{fmtQty(selected.stock)} u</strong> · para mermas de producto terminado usa "Salida".
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(["entrada", "salida"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setAdjustMode(m)}
                  className={cn(
                    "rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors",
                    adjustMode === m
                      ? m === "entrada"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-white/[0.07] bg-white/[0.02] text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Field label="Cantidad (u)">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdjustQty(String(Math.max(0, (Number(adjustQty) || 0) - 1)))}
                  className="rounded-lg border border-white/[0.08] p-2 text-zinc-400"
                >
                  <Minus size={14} />
                </button>
                <Input type="number" min="0" step="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="0" />
                <button
                  onClick={() => setAdjustQty(String((Number(adjustQty) || 0) + 1))}
                  className="rounded-lg border border-white/[0.08] p-2 text-zinc-400"
                >
                  <Plus size={14} />
                </button>
              </div>
            </Field>
            <Field label="Motivo">
              <Select value={adjustMode} onChange={(e) => setAdjustMode(e.target.value as "entrada" | "salida")}>
                <option value="entrada">Entrada (compra / conteo)</option>
                <option value="salida">Salida (merma / rotura / consumo)</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
