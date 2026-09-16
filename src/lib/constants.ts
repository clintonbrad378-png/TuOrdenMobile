export const UNITS = ["g", "kg", "lb", "oz", "ml", "L", "u"];

export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

export const paymentLabel = (value: string) =>
  PAYMENT_METHODS.find((p) => p.value === value)?.label ?? value;

export const REASON_LABELS: Record<string, string> = {
  venta: "Venta",
  venta_credito: "Venta crédito",
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  inicial: "Inicial",
  merma: "Merma",
  consumo_interno: "Consumo interno",
  produccion: "Producción",
};
