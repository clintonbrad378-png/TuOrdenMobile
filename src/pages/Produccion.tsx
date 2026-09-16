import { useCallback, useEffect, useMemo, useState } from "react";
import { CookingPot, Factory, Minus, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import type { Product, Production, ProductionEstimate } from "../lib/types";
import { errMsg, fmtDateTime, fmtMoney, fmtQty } from "../lib/format";
import { convertQty } from "../lib/units";
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
  cn,
  useToast,
} from "../components/ui";

export default function Produccion() {
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

  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [prods, hist] = await Promise.all([
        api.listProducts(true),
        api.listProductions(100),
      ]);
      setProducts(prods);
      setProductions(hist);
      if (selectedId === null) {
        const first = prods.find((p) => p.tracksStock && p.active);
        if (first) setSelectedId(first.id);
      }
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
          subtitle="Elabora producto terminado: descuenta materiales y suma stock para vender"
        />

        {stockProducts.length === 0 ? (
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
