import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import type { Product, Sale } from "../lib/types";
import { errMsg, fmtMoney } from "../lib/format";
import { PAYMENT_METHODS, paymentLabel } from "../lib/constants";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  cn,
  useToast,
} from "../components/ui";

export default function Venta() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Todas");
  const [cart, setCart] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .listProducts(false)
      .then(setProducts)
      .catch((e) => toast("error", errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const addToCart = useCallback((id: number) => {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }, []);

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
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setPlacing(false);
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
    <div className="flex h-full">
      {/* Products */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 px-6 pt-6 pb-3">
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

        <div className="flex gap-2 overflow-x-auto px-6 pb-4">
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

        <div className="flex-1 overflow-y-auto px-6 pb-6">
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((p) => {
                const inCart = cart[p.id] ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p.id)}
                    className={cn(
                      "relative rounded-xl border bg-surface-900 p-4 text-left transition-all",
                      inCart > 0
                        ? "border-accent-500/50 ring-1 ring-accent-500/20"
                        : "border-white/[0.06] hover:border-accent-500/30 hover:bg-surface-800",
                    )}
                  >
                    {inCart > 0 && (
                      <span className="absolute top-2.5 right-2.5 grid h-6 w-6 place-items-center rounded-full bg-accent-500 text-[11px] font-bold text-zinc-950">
                        {inCart}
                      </span>
                    )}
                    <p className="pr-7 text-sm leading-snug font-medium text-zinc-100">{p.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">{p.category}</p>
                    <p className="mt-3 text-lg font-semibold tabular-nums text-accent-400">
                      {fmtMoney(p.price)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Cart */}
      <aside className="flex w-[360px] shrink-0 flex-col border-l border-white/[0.06] bg-surface-900/40">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
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
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium tabular-nums text-zinc-100">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(product.id, qty + 1)}
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition-colors hover:text-zinc-100"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <span className="w-20 text-right text-sm font-medium tabular-nums text-zinc-100">
                  {fmtMoney(product.price * qty)}
                </span>
                <button
                  onClick={() => setQty(product.id, 0)}
                  className="rounded-md p-1 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <footer className="space-y-3 border-t border-white/[0.06] px-5 py-4">
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
  );
}
