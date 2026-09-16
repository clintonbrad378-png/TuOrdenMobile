import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Product } from "../lib/types";
import { fmtMoney } from "../lib/format";
import { Button, Input, Modal, cn } from "./ui";

interface ProductPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  products: Product[];
  title?: string;
}

export default function ProductPicker({
  open,
  onClose,
  onSelect,
  products,
  title = "Seleccionar producto",
}: ProductPickerProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("Todas");

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ["Todas", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "Todas" || p.category === category) &&
        (q === "" || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)),
    );
  }, [products, search, category]);

  const handleSelect = (product: Product) => {
    onSelect(product);
    onClose();
    setSearch("");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-3xl max-h-[85vh]"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
            <Input
              placeholder="Buscar producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  category === c
                    ? "border-accent-500/40 bg-accent-500/10 text-accent-400"
                    : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="grid h-48 place-items-center text-zinc-500">
            <p>No hay productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4 max-h-96 overflow-y-auto">
            {filtered.map((p) => {
              const out = p.tracksStock && p.stock <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  disabled={out}
                  className="relative rounded-xl border border-white/[0.06] bg-surface-900 p-3 text-left transition-all active:scale-[0.97] active:bg-surface-800 sm:p-4 disabled:opacity-50"
                >
                  <p className="pr-7 text-sm leading-snug font-medium text-zinc-100">{p.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {p.category}
                    {p.tracksStock ? ` · Stock ${p.stock}` : ""}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
                    <p className="text-lg font-semibold tabular-nums text-accent-400">
                      {fmtMoney(p.price)}
                    </p>
                    {p.tracksStock && out && (
                      <span className="text-[10px] font-medium text-red-400">Agotado</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-white/[0.06]">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
}