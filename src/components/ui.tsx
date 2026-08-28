import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";

export const cn = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

/* ---------- Button ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const buttonVariants = {
  primary:
    "bg-accent-500 text-zinc-950 font-medium hover:bg-accent-400 shadow-sm shadow-accent-500/20",
  outline:
    "border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

const buttonSizes = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-9.5 px-4 text-sm rounded-lg gap-2",
  lg: "h-11 px-5 text-sm rounded-xl gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */

const inputBase =
  "w-full rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-accent-500/50 focus:ring-2 focus:ring-accent-500/15 disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}

/* ---------- Card / Badge ---------- */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-surface-900",
        className,
      )}
    >
      {children}
    </div>
  );
}

const badgeTones = {
  zinc: "bg-white/[0.06] text-zinc-300 border-white/10",
  accent: "bg-accent-500/10 text-accent-400 border-accent-500/25",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  danger: "bg-red-500/10 text-red-400 border-red-500/25",
};

export function Badge({
  tone = "zinc",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center sm:items-center sm:p-4 pt-[env(safe-area-inset-top)]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-b-2xl border border-white/10 bg-surface-900 shadow-2xl sm:max-h-[85vh] sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pt-4 sm:pb-4">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-zinc-400">{message}</p>
    </Modal>
  );
}

/* ---------- Toasts ---------- */

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

const ToastCtx = createContext<(kind: ToastKind, msg: string) => void>(() => {});
let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, msg: string) => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-4), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-400" />,
    error: <XCircle size={16} className="text-red-400" />,
    info: <Info size={16} className="text-zinc-400" />,
  };

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[70] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/10 bg-surface-800 px-3.5 py-3 shadow-2xl"
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <p className="text-xs leading-relaxed break-words text-zinc-200">{t.msg}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Misc ---------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase sm:text-[11px]">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold break-words tabular-nums text-zinc-50 sm:mt-1.5 sm:text-2xl">
            {value}
          </p>
          {hint && (
            <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs">{hint}</p>
          )}
        </div>
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-500/10 text-accent-400 sm:h-10 sm:w-10">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && (
        <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-zinc-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description && <p className="max-w-xs text-xs text-zinc-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={20} className={cn("animate-spin text-zinc-500", className)} />;
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-surface-800 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
            active === t.value
              ? "bg-white/[0.08] text-zinc-50"
              : "text-zinc-500 hover:text-zinc-200",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
