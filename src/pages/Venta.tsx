import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, X, UserPlus, DollarSign, Users } from "lucide-react";
import { api } from "../lib/api";
import type { Product, Sale, CreditSaleSummary, CreditSaleDetail } from "../lib/types";
import { errMsg, fmtMoney } from "../lib/format";
import { PAYMENT_METHODS, paymentLabel } from "../lib/constants";
import {
  Badge,
  Button,
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
import ProductPicker from "../components/ProductPicker";

type VentaTab = "venta" | "credito";

const emptyCreditForm = { clientName: "", clientPhone: "", items: [] as { productId: number; quantity: number }[], note: "" };

export default function Venta() {
  const [tab, setTab] = useState<VentaTab>("venta");

  // Venta normal
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Todas");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  // Crédito
  const [creditSales, setCreditSales] = useState<CreditSaleSummary[]>([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditSearch, setCreditSearch] = useState("");
  const [creditFilter, setCreditFilter] = useState<string>("pendiente");
  const [creditEditorOpen, setCreditEditorOpen] = useState(false);
  const [creditForm, setCreditForm] = useState(emptyCreditForm);
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditDetail, setCreditDetail] = useState<CreditSaleDetail | null>(null);
  const [paymentForm, setPaymentForm] = useState<{ creditSaleId: number; amount: number; paymentMethod: string; note: string } | null>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const toast = useToast();

  const reloadProducts = useCallback(async () => {
    try {
      setProducts(await api.listProducts(false));
    } catch (e) {
      toast("error", errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reloadProducts();
    loadCreditSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCreditSales = async () => {
    setCreditLoading(true);
    try {
      const sales = await api.listCreditSales(creditFilter === "todas" ? undefined : creditFilter);
      setCreditSales(sales);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setCreditLoading(false);
    }
  };

  const categories = useMemo(() => {
    const set = new Set((products ?? []).map((p) => p.category));
    return ["Todas", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (category === "Todas" || p.category === category) &&
        (q === "" || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
    );
  }, [products, search, category]);

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const product = products?.find((p) => p.id === Number(id));
          return product ? { product, qty } : null;
        })
        .filter((l): l is { product: Product; qty: number } => l !== null),
    [cart, products],
  );

  const total = cartLines.reduce((acc, l) => acc + l.product.price * l.qty, 0);
  const totalQty = cartLines.reduce((acc, l) => acc + l.qty, 0);

  const addToCart = useCallback((id: number) => {
    setCart((c) => {
      const prod = products?.find((p) => p.id === id);
      const next = (c[id] ?? 0) + 1;
      if (prod?.tracksStock && next > prod.stock) {
        toast("error", `Sin stock suficiente de "${prod.name}" (disponible ${prod.stock})`);
        return c;
      }
      return { ...c, [id]: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const setQty = useCallback((id: number, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }, []);

  const checkout = async () => {
    if (cartLines.length === 0) return;
    setPlacing(true);
    try {
      const sale = await api.createSale({
        items: cartLines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        paymentMethod,
        note: note.trim() || null,
      });
      setLastSale(sale);
      setCart({});
      setNote("");
      setCartOpen(false);
      await reloadProducts();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setPlacing(false);
    }
  };

  // Crédito functions
  const openCreditCreate = () => {
    setCreditForm(emptyCreditForm);
    setCreditEditorOpen(true);
  };

  const setCreditItemQty = (index: number, qty: number) => {
    setCreditForm((f) => {
      const next = [...f.items];
      if (qty <= 0) next.splice(index, 1);
      else next[index] = { ...next[index], quantity: qty };
      return { ...f, items: next };
    });
  };

  const creditTotal = creditForm.items.reduce((acc, item) => {
    const product = products?.find((p) => p.id === item.productId);
    return acc + (product?.price ?? 0) * item.quantity;
  }, 0);

  const saveCreditSale = async () => {
    if (!creditForm.clientName.trim()) {
      toast("error", "El nombre del cliente es obligatorio");
      return;
    }
    if (creditForm.items.length === 0) {
      toast("error", "Agrega al menos un producto");
      return;
    }
    setCreditSaving(true);
    try {
      await api.createCreditSale({
        clientName: creditForm.clientName.trim(),
        clientPhone: creditForm.clientPhone.trim() || null,
        items: creditForm.items,
        note: creditForm.note.trim() || null,
      });
      toast("success", "Venta a crédito registrada");
      setCreditEditorOpen(false);
      setCreditForm(emptyCreditForm);
      await loadCreditSales();
      await reloadProducts();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setCreditSaving(false);
    }
  };

  const openCreditDetail = async (cs: CreditSaleSummary) => {
    try {
      const detail = await api.getCreditSale(cs.id);
      setCreditDetail(detail);
    } catch (e) {
      toast("error", errMsg(e));
    }
  };

  const openPaymentModal = (creditSaleId: number, balance: number) => {
    setPaymentForm({
      creditSaleId,
      amount: balance,
      paymentMethod: "efectivo",
      note: "",
    });
  };

  const savePayment = async () => {
    if (!paymentForm || paymentForm.amount <= 0) return;
    try {
      await api.addCreditPayment({
        creditSaleId: paymentForm.creditSaleId,
        amount: paymentForm.amount,
        paymentMethod: paymentForm.paymentMethod,
        note: paymentForm.note.trim() || null,
      });
      toast("success", "Pago registrado");
      setPaymentForm(null);
      if (creditDetail) {
        const detail = await api.getCreditSale(creditDetail.creditSale.id);
        setCreditDetail(detail);
      }
      await loadCreditSales();
    } catch (e) {
      toast("error", errMsg(e));
    }
  };

  const filteredCreditSales = useMemo(() => {
    const q = creditSearch.trim().toLowerCase();
    return creditSales.filter(
      (s) =>
        q === "" ||
        s.clientName.toLowerCase().includes(q) ||
        (s.clientPhone ?? "").includes(q),
    );
  }, [creditSales, creditSearch]);

  if (!products) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <Tabs
        tabs={[
          { value: "venta" as VentaTab, label: "Venta" },
          { value: "credito" as VentaTab, label: "Crédito" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "venta" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Products */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex items-center gap-3 px-4 pt-4 pb-3 sm:gap-4 sm:px-6 sm:pt-6 flex-shrink-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Venta</h1>
              <div className="relative max-w-md flex-1">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Buscar producto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </header>

            <div className="flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6 flex-shrink-0">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    category === c
                      ? "border-accent-500/40 bg-accent-500/10 text-accent-400"
                      : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
              {filtered.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart size={22} />}
                  title={products.length === 0 ? "No hay productos en el menú" : "Sin resultados"}
                  description={
                    products.length === 0
                      ? "Agrega productos en la sección Menú para poder vender."
                      : "Prueba con otro término de búsqueda o categoría."
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4">
                  {filtered.map((p) => {
                    const inCart = cart[p.id] ?? 0;
                    const outOfStock = p.tracksStock && p.stock <= 0;
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p.id)}
                        disabled={outOfStock}
                        className={cn(
                          "relative rounded-xl border bg-surface-900 p-3 text-left transition-all active:scale-[0.97] active:bg-surface-800 sm:p-4",
                          outOfStock
                            ? "border-white/[0.04] opacity-50"
                            : inCart > 0
                              ? "border-accent-500/50 ring-1 ring-accent-500/20"
                              : "border-white/[0.06] hover:border-accent-500/30 hover:bg-surface-800",
                        )}
                      >
                        {inCart > 0 && (
                          <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-accent-500 text-[11px] font-bold text-zinc-950 sm:top-2.5 sm:right-2.5">
                            {inCart}
                          </span>
                        )}
                        <p className="pr-7 text-sm leading-snug font-medium text-zinc-100">{p.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                          {p.category}
                          {p.tracksStock ? ` · Stock ${p.stock}` : ""}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
                          <p className="text-lg font-semibold tabular-nums text-accent-400">
                            {fmtMoney(p.price)}
                          </p>
                          {p.tracksStock &&
                            (outOfStock ? (
                              <Badge tone="danger">Agotado</Badge>
                            ) : p.stock <= (p.minStock > 0 ? p.minStock : 0) && p.minStock > 0 ? (
                              <Badge tone="warn">{p.stock} u</Badge>
                            ) : null)}
                        </div>
                      </button>
);
              })}
          </div>
              )}
            </div>
          </section>

          {/* Cart — panel lateral en desktop */}
          <aside className="hidden w-[360px] shrink-0 flex-col border-l border-white/[0.06] bg-surface-900/40 lg:flex flex-shrink-0">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4 flex-shrink-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <ShoppingCart size={16} className="text-accent-400" />
                Carrito
                {cartLines.length > 0 && (
                  <Badge tone="accent" className="ml-1">
                    {cartLines.length}
                  </Badge>
                )}
              </h2>
              {cartLines.length > 0 && (
                <button
                  onClick={() => setCart({})}
                  className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-red-400"
                  title="Vaciar carrito"
                >
                  <X size={15} />
                </button>
              )}
            </header>

            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
              {cartLines.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart size={20} />}
                  title="Carrito vacío"
                  description="Haz clic en los productos para agregarlos."
                />
              ) : (
                cartLines.map(({ product, qty }) => (
                  <div
                    key={product.id}
                    className="group flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">{product.name}</p>
                      <p className="text-[11px] tabular-nums text-zinc-500">
                        {fmtMoney(product.price)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-800">
                      <button
                        onClick={() => setQty(product.id, qty - 1)}
                        className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100 active:bg-white/[0.06]"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-medium tabular-nums text-zinc-100">
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(product.id, qty + 1)}
                        className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100 active:bg-white/[0.06]"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-medium tabular-nums text-zinc-100">
                      {fmtMoney(product.price * qty)}
                    </span>
                    <button
                      onClick={() => setQty(product.id, 0)}
                      className="rounded-md p-1.5 text-zinc-600 transition-colors hover:text-red-400 active:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <footer className="space-y-3 border-t border-white/[0.06] px-5 py-4 flex-shrink-0">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Nota (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="text-2xl font-semibold tabular-nums text-zinc-50">
                  {fmtMoney(total)}
                </span>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={cartLines.length === 0}
                loading={placing}
                onClick={checkout}
              >
                Cobrar venta
              </Button>
            </footer>
          </aside>

          {/* Floating cart button — móvil */}
          {cartLines.length > 0 && !cartOpen && (
            <button
              onClick={() => setCartOpen(true)}
              className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2.5 rounded-full bg-accent-500 py-3 pr-5 pl-4 shadow-xl shadow-black/50 transition-transform active:scale-95 lg:hidden"
            >
              <span className="relative">
                <ShoppingCart size={18} className="text-zinc-950" />
                <span className="absolute -top-2 -right-2 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-zinc-950 px-1 text-[10px] font-bold text-accent-400">
                  {totalQty}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-zinc-950">
                {fmtMoney(total)}
              </span>
            </button>
          )}

          {/* Cart — bottom sheet en móvil */}
          <Modal
            open={cartOpen}
            onClose={() => setCartOpen(false)}
            title={`Carrito · ${cartLines.length} producto${cartLines.length === 1 ? "" : "s"}`}
            width="sm:max-w-md"
            footer={
              <>
                <Button variant="ghost" onClick={() => setCartOpen(false)}>
                  Seguir vendiendo
                </Button>
                <Button
                  variant="primary"
                  disabled={cartLines.length === 0}
                  loading={placing}
                  onClick={checkout}
                >
                  Cobrar {fmtMoney(total)}
                </Button>
              </>
            }
          >
            {cartLines.length === 0 ? (
              <EmptyState
                icon={<ShoppingCart size={20} />}
                title="Carrito vacío"
                description="Toca los productos para agregarlos."
              />
            ) : (
              <div className="space-y-1">
                {cartLines.map(({ product, qty }) => (
                  <div key={product.id} className="flex items-center gap-2 rounded-xl px-1 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">{product.name}</p>
                      <p className="text-[11px] tabular-nums text-zinc-500">
                        {fmtMoney(product.price)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-800">
                      <button
                        onClick={() => setQty(product.id, qty - 1)}
                        className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 active:bg-white/[0.06]"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-6 text-center text-sm font-medium tabular-nums text-zinc-100">
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(product.id, qty + 1)}
                        className="grid h-9 w-9 place-items-center rounded-md text-zinc-400 active:bg-white/[0.06]"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="w-20 text-right text-sm font-medium tabular-nums text-zinc-100">
                      {fmtMoney(product.price * qty)}
                    </span>
                    <button
                      onClick={() => setQty(product.id, 0)}
                      className="rounded-md p-1.5 text-zinc-600 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    placeholder="Nota (opcional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-zinc-400">Total</span>
                    <span className="text-2xl font-semibold tabular-nums text-zinc-50">
                      {fmtMoney(total)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Modal>

          {/* Success modal */}
          <Modal open={lastSale !== null} onClose={() => setLastSale(null)} width="max-w-sm">
            {lastSale && (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-accent-500/15 text-accent-400">
                  <CheckCircle2 size={28} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-zinc-50">Venta registrada</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Venta #{lastSale.id} · {paymentLabel(lastSale.paymentMethod)}
                </p>
                <p className="mt-4 text-3xl font-semibold tabular-nums text-accent-400">
                  {fmtMoney(lastSale.total)}
                </p>
                <Button variant="primary" className="mt-6 w-full" onClick={() => setLastSale(null)}>
                  Nueva venta
                </Button>
              </div>
            )}
          </Modal>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Credit Sales List */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <PageHeader
              title="Ventas a crédito"
              subtitle="Ventas pendientes de cobro - stock ya descontado"
              actions={
                <Button variant="primary" onClick={openCreditCreate}>
                  <UserPlus size={15} />
                  Nueva venta a crédito
                </Button>
              }
            />

            <div className="flex flex-wrap gap-2 px-4 pb-3 sm:px-6">
              <Tabs
                tabs={[
                  { value: "pendiente", label: "Pendientes" },
                  { value: "parcial", label: "Parciales" },
                  { value: "pagado", label: "Pagadas" },
                  { value: "todas", label: "Todas" },
                ]}
                active={creditFilter}
                onChange={(v) => {
                  setCreditFilter(v);
                  loadCreditSales();
                }}
              />
              <div className="relative flex-1 max-w-md ml-auto">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Buscar cliente…"
                  value={creditSearch}
                  onChange={(e) => setCreditSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
              {creditLoading ? (
                <div className="grid h-32 place-items-center">
                  <Spinner />
                </div>
              ) : filteredCreditSales.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title="Sin ventas a crédito"
                  description={creditFilter === "todas" ? "No hay ventas registradas" : `No hay ventas con estado "${creditFilter}"`}
                />
              ) : (
                <div className="space-y-2">
                  {filteredCreditSales.map((cs) => (
                    <button
                      key={cs.id}
                      onClick={() => openCreditDetail(cs)}
                      className="w-full text-left rounded-xl border border-white/[0.06] bg-surface-900 p-4 transition-colors hover:bg-white/[0.02]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-zinc-100 truncate">{cs.clientName}</p>
                            <Badge
                              tone={
                                cs.status === "pagado" ? "success" : cs.status === "parcial" ? "warn" : "accent"
                              }
                              className="text-xs shrink-0"
                            >
                              {cs.status}
                            </Badge>
                          </div>
                          {cs.clientPhone && (
                            <p className="mt-1 text-[11px] text-zinc-500">{cs.clientPhone}</p>
                          )}
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {new Date(cs.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-semibold tabular-nums text-zinc-50">
                            {fmtMoney(cs.total)}
                          </p>
                          <p className="text-xs text-zinc-500">Total</p>
                          <p className="mt-1 text-sm font-medium tabular-nums text-amber-400">
                            {fmtMoney(cs.balance)}
                          </p>
                          <p className="text-xs text-zinc-500">Pendiente</p>
                          {cs.status !== "pagado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPaymentModal(cs.id, cs.balance);
                              }}
                            >
                              <DollarSign size={12} />
                              Cobrar
                            </Button>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credit Sale Editor Modal */}
      <Modal
        open={creditEditorOpen}
        onClose={() => setCreditEditorOpen(false)}
        title="Nueva venta a crédito"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreditEditorOpen(false)} disabled={creditSaving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveCreditSale} loading={creditSaving} disabled={creditForm.items.length === 0}>
              Registrar venta a crédito
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre del cliente *">
            <Input
              value={creditForm.clientName}
              onChange={(e) => setCreditForm({ ...creditForm, clientName: e.target.value })}
              placeholder="Juan Pérez"
            />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input
              type="tel"
              value={creditForm.clientPhone}
              onChange={(e) => setCreditForm({ ...creditForm, clientPhone: e.target.value })}
              placeholder="+52 1 55 1234 5678"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-zinc-400">Productos</span>
              <Button size="sm" variant="outline" onClick={() => setProductPickerOpen(true)}>
                <Plus size={13} />
                Agregar producto
              </Button>
            </div>

            {creditForm.items.length === 0 ? (
              <p className="text-center text-zinc-500 py-4 text-sm">No hay productos agregados</p>
            ) : (
              creditForm.items.map((item, index) => {
                const product = products?.find((p) => p.id === item.productId);
                return (
                  <div
                    key={index}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100 min-w-[150px] truncate">
                        {product?.name ?? "Producto eliminado"}
                      </span>
                      <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-800">
                        <button
                          onClick={() => setCreditItemQty(index, item.quantity - 1)}
                          className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 active:bg-white/[0.06]"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums text-zinc-100">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => setCreditItemQty(index, item.quantity + 1)}
                          className="grid h-8 w-8 place-items-center rounded-md text-zinc-400 active:bg-white/[0.06]"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="ml-auto text-sm font-medium tabular-nums text-zinc-100">
                        {fmtMoney((product?.price ?? 0) * item.quantity)}
                      </span>
                      <button
                        onClick={() => setCreditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                        className="rounded-md p-1.5 text-zinc-600 transition-colors hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
);
            })
          )}
        </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-2xl font-semibold tabular-nums text-zinc-50">
                {fmtMoney(creditTotal)}
              </span>
            </div>
          </div>

          <Field label="Nota (opcional)">
            <Input
              value={creditForm.note}
              onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })}
              placeholder="Observaciones..."
            />
          </Field>
        </div>
      </Modal>

      {/* Credit Detail Modal */}
      <Modal
        open={creditDetail !== null}
        onClose={() => setCreditDetail(null)}
        title={`Venta a crédito #${creditDetail?.creditSale.id}`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreditDetail(null)}>
              Cerrar
            </Button>
            {creditDetail && creditDetail.creditSale.status !== "pagado" && (
              <Button
                variant="primary"
                onClick={() => {
                  openPaymentModal(creditDetail.creditSale.id, creditDetail.creditSale.total - creditDetail.creditSale.paid);
                  setCreditDetail(null);
                }}
              >
                <DollarSign size={15} />
                Registrar pago
              </Button>
            )}
          </>
        }
      >
        {creditDetail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-zinc-500">Cliente</p>
                  <p className="font-medium text-zinc-100">{creditDetail.creditSale.clientName}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Teléfono</p>
                  <p className="font-medium text-zinc-100">{creditDetail.creditSale.clientPhone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Estado</p>
                  <Badge
                    tone={
                      creditDetail.creditSale.status === "pagado" ? "success"
                        : creditDetail.creditSale.status === "parcial" ? "warn" : "accent"
                    }
                  >
                    {creditDetail.creditSale.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-zinc-500">Fecha</p>
                  <p className="font-medium text-zinc-100">
                    {new Date(creditDetail.creditSale.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[11px] text-zinc-500">Total</p>
                  <p className="text-xl font-semibold text-zinc-50">{fmtMoney(creditDetail.creditSale.total)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500">Pagado</p>
                  <p className="text-xl font-semibold text-emerald-400">{fmtMoney(creditDetail.creditSale.paid)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500">Pendiente</p>
                  <p className="text-xl font-semibold text-amber-400">{fmtMoney(creditDetail.creditSale.total - creditDetail.creditSale.paid)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium tracking-wide text-zinc-400">Productos</span>
              {creditDetail.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-100">{item.productName}</p>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-[11px] text-zinc-500">{item.quantity} × {fmtMoney(item.unitPrice)}</span>
                      <span className="font-medium text-zinc-100">{fmtMoney(item.subtotal)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {creditDetail.payments.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-medium tracking-wide text-zinc-400">Pagos registrados</span>
                {creditDetail.payments.map((payment) => (
                  <div key={payment.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {paymentLabel(payment.paymentMethod)}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {new Date(payment.createdAt).toLocaleString()}
                        {payment.note && ` · ${payment.note}`}
                      </p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums text-emerald-400">
                      +{fmtMoney(payment.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {creditDetail.creditSale.note && (
              <div className="rounded-xl border border-white/[0.06] bg-surface-800 p-3 text-sm">
                <p className="text-zinc-500">Nota: {creditDetail.creditSale.note}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Payment Modal */}
      <Modal
        open={paymentForm !== null}
        onClose={() => setPaymentForm(null)}
        title="Registrar pago"
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPaymentForm(null)} disabled={!paymentForm || paymentForm.amount <= 0}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={savePayment} disabled={!paymentForm || paymentForm.amount <= 0}>
              Registrar pago
            </Button>
          </>
        }
      >
        {paymentForm && (
          <div className="space-y-4">
            <Field label="Monto a cobrar">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </Field>
            <Field label="Método de pago">
              <Select
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nota (opcional)">
              <Input
                value={paymentForm.note}
                onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                placeholder="Referencia, observaciones..."
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Product Picker Modal */}
      <ProductPicker
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSelect={(product) => {
          setCreditForm((f) => {
            const existingIndex = f.items.findIndex((item) => item.productId === product.id);
            if (existingIndex >= 0) {
              const next = [...f.items];
              next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 };
              return { ...f, items: next };
            }
            return { ...f, items: [...f.items, { productId: product.id, quantity: 1 }] };
          });
        }}
        products={products ?? []}
        title="Agregar producto a la venta a crédito"
      />
    </div>
  );
}