import { useCallback, useEffect, useMemo, useState } from "react";
import {
  History,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import type { Product, SaleDetail, SaleSummary } from "../lib/types";
import { errMsg, fmtDateTime, fmtMoney, isoToday } from "../lib/format";
import { PAYMENT_METHODS, paymentLabel } from "../lib/constants";
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
  cn,
  useToast,
} from "../components/ui";
import ProductPicker from "../components/ProductPicker";

interface EditLine {
  productId: number;
  name: string;
  price: number;
  qty: number;
}

export default function Historial() {
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [sales, setSales] = useState<SaleSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [editPayment, setEditPayment] = useState("efectivo");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SaleSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toast = useToast();

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    try {
      const [list, prods] = await Promise.all([
        api.listSales(from, to),
        api.listProducts(false),
      ]);
      setSales(list);
      setProducts(prods);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const list = sales ?? [];
    return {
      count: list.length,
      total: list.reduce((a, s) => a + s.total, 0),
    };
  }, [sales]);

  const openDetail = async (s: SaleSummary) => {
    setDetailLoading(true);
    try {
      setDetail(await api.getSale(s.id));
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const startEdit = () => {
    if (!detail) return;
    if (detail.items.some((i) => i.productId === null)) {
      toast("error", "No se puede editar: la venta contiene un producto eliminado");
      return;
    }
    setLines(
      detail.items.map((i) => ({
        productId: i.productId as number,
        name: i.productName,
        price: i.unitPrice,
        qty: i.quantity,
      })),
    );
    setEditPayment(detail.paymentMethod);
    setEditNote(detail.note ?? "");
    setEditing(true);
  };

  const setLineQty = (productId: number, qty: number) => {
    setLines((ls) =>
      qty <= 0 ? ls.filter((l) => l.productId !== productId) : ls.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    );
  };

  const addProduct = (p: Product) => {
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id);
      if (found) return ls.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { productId: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };

  const editTotal = lines.reduce((a, l) => a + l.price * l.qty, 0);

  const saveEdit = async () => {
    if (!detail) return;
    if (lines.length === 0) {
      toast("error", "La venta debe tener al menos un producto");
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateSale({
        id: detail.id,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.qty })),
        paymentMethod: editPayment,
        note: editNote.trim() === "" ? null : editNote.trim(),
      });
      toast("success", `Venta #${updated.id} actualizada · stock ajustado`);
      setEditing(false);
      setDetail(null);
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
      await api.deleteSale(deleteTarget.id);
      toast("success", `Venta #${deleteTarget.id} eliminada · materiales devueltos al stock`);
      setDeleteTarget(null);
      setDetail(null);
      await load();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Historial de ventas"
          subtitle={
            sales === null
              ? "Cada venta registrada"
              : `${totals.count} ventas · ${fmtMoney(totals.total)} en el período`
          }
        />

        <Card className="mb-4 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
              <Field label="Desde">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
            </div>
            <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
              <Field label="Hasta">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setFrom(isoToday());
                setTo(isoToday());
              }}
            >
              Hoy
            </Button>
          </div>
        </Card>

        {!sales || loading ? (
          <div className="grid h-48 place-items-center">
            <Spinner />
          </div>
        ) : sales.length === 0 ? (
          <Card>
            <EmptyState
              icon={<History size={22} />}
              title="Sin ventas en este período"
              description="Ajusta el rango de fechas o registra una venta."
            />
          </Card>
        ) : (
          <Card className="divide-y divide-white/[0.04]">
            {sales.map((s) => (
              <button
                key={s.id}
                onClick={() => openDetail(s)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:gap-4 sm:px-5"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-zinc-400">
                  <Receipt size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100">Venta #{s.id}</p>
                  <p className="text-[11px] text-zinc-500">
                    {fmtDateTime(s.createdAt)} · {s.itemCount} art.
                  </p>
                </div>
                <Badge>{paymentLabel(s.paymentMethod)}</Badge>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-50">
                  {fmtMoney(s.total)}
                </span>
              </button>
            ))}
          </Card>
        )}
      </div>

      {/* Detalle */}
      <Modal
        open={detail !== null || detailLoading}
        onClose={() => setDetail(null)}
        title={detail ? `Venta #${detail.id}` : "Cargando…"}
        width="max-w-lg"
        footer={
          detail ? (
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>
                Cerrar
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const s = sales?.find((x) => x.id === detail.id);
                  if (s) setDeleteTarget(s);
                  else setDeleteTarget({ id: detail.id, total: detail.total, paymentMethod: detail.paymentMethod, itemCount: detail.items.length, createdAt: detail.createdAt });
                }}
              >
                <Trash2 size={15} />
                Eliminar
              </Button>
              <Button variant="primary" onClick={startEdit}>
                <Pencil size={15} />
                Editar
              </Button>
            </>
          ) : undefined
        }
      >
        {detailLoading || !detail ? (
          <div className="grid h-32 place-items-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>{fmtDateTime(detail.createdAt)}</span>
              <Badge>{paymentLabel(detail.paymentMethod)}</Badge>
              {detail.note && <span className="italic">“{detail.note}”</span>}
            </div>
            <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
              {detail.items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{i.productName}</p>
                    <p className="text-[11px] tabular-nums text-zinc-500">
                      {i.quantity} × {fmtMoney(i.unitPrice)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-zinc-100">
                    {fmtMoney(i.subtotal)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-zinc-400">Total</span>
              <span className="text-lg font-semibold tabular-nums text-zinc-50">
                {fmtMoney(detail.total)}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Editor */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={detail ? `Editar venta #${detail.id}` : "Editar venta"}
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveEdit} loading={saving}>
              Guardar cambios
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {lines.length === 0 ? (
            <EmptyState title="Sin productos" description="Agrega productos a la venta." />
          ) : (
            <div className="divide-y divide-white/[0.04] rounded-xl border border-white/[0.06]">
              {lines.map((l) => (
                <div key={l.productId} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{l.name}</p>
                    <p className="text-[11px] tabular-nums text-zinc-500">{fmtMoney(l.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLineQty(l.productId, l.qty - 1)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                    <button
                      onClick={() => setLineQty(l.productId, l.qty + 1)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-white/[0.06] hover:text-accent-400"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-medium tabular-nums text-zinc-100">
                    {fmtMoney(l.price * l.qty)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={() => setPickerOpen(true)} className="w-full">
            <Plus size={15} />
            Agregar producto
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Método de pago">
              <Select value={editPayment} onChange={(e) => setEditPayment(e.target.value)}>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nota (opcional)">
              <Input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Nota…"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
            <span className="text-sm text-zinc-400">Nuevo total</span>
            <span className={cn("text-lg font-semibold tabular-nums", editTotal > 0 ? "text-zinc-50" : "text-zinc-500")}>
              {fmtMoney(editTotal)}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Al guardar se recalcula con precios vigentes y se ajusta el stock automáticamente.
          </p>
        </div>
      </Modal>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        products={products}
        onSelect={addProduct}
        title="Agregar a la venta"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        danger
        title={`Eliminar venta #${deleteTarget?.id}`}
        confirmLabel="Eliminar"
        message={
          <>
            Se eliminará la venta de <strong>{deleteTarget && fmtMoney(deleteTarget.total)}</strong> y
            los materiales descontados <strong>volverán al stock</strong>. Esta acción no se puede deshacer.
          </>
        }
      />
    </div>
  );
}
