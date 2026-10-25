import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ChefHat,
  CreditCard,
  Factory,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  Shield,
  ShoppingCart,
  Trash2,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../ui";
import { useAuth } from "../../lib/auth";
import type { SectionKey } from "../../lib/access";

const NAV: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  section: SectionKey;
}[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, section: "dashboard" },
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false, section: "venta" },
  { to: "/historial", label: "Historial", icon: History, end: false, section: "historial" },
  { to: "/menu", label: "Menú", icon: UtensilsCrossed, end: false, section: "menu" },
  { to: "/produccion", label: "Producción", icon: Factory, end: false, section: "produccion" },
  { to: "/materiales", label: "Materiales", icon: Boxes, end: false, section: "materiales" },
  { to: "/entradas", label: "Entradas", icon: Truck, end: false, section: "entradas" },
  { to: "/mermas", label: "Mermas", icon: Trash2, end: false, section: "mermas" },
  { to: "/gastos", label: "Gastos", icon: CreditCard, end: false, section: "gastos" },
  { to: "/reportes", label: "Reportes", icon: BarChart3, end: false, section: "reportes" },
  { to: "/sincronizacion", label: "Sincronización", icon: RefreshCw, end: false, section: "sincronizacion" },
  { to: "/configuracion", label: "Configuración", icon: Settings, end: false, section: "configuracion" },
];

export default function Sidebar() {
  const { can, user, isOwner, logout } = useAuth();
  const nav = NAV.filter((item) => can(item.section));

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] bg-surface-900/40 p-4 lg:flex">
      <div className="flex items-center gap-3 px-2 pt-2 pb-6">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-accent-500/20 bg-accent-500/15 text-accent-400">
          <ChefHat size={18} />
        </div>
        <div>
          <p className="text-sm leading-none font-semibold tracking-tight text-zinc-50">
            TuOrden
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">Punto de venta</p>
        </div>
      </div>

      {user && !isOwner && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <Shield size={14} className="shrink-0 text-amber-400" />
          <span className="truncate text-xs font-medium text-amber-300">{user.name}</span>
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {nav.map(({ to, label, icon: Icon, end, section }) => (
          <NavLink
            key={section}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-white/[0.07] font-medium text-zinc-50"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={17} className={cn("shrink-0", isActive && "text-accent-400")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 px-1">
        <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
          <p className="text-[10px] tracking-wide text-zinc-600 uppercase">Sesión</p>
          <p className="mt-0.5 truncate text-xs font-medium text-zinc-300">
            {user?.name ?? "—"}
          </p>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
        >
          <LogOut size={14} />
          Cambiar de usuario
        </button>
        <p className="px-2 text-[11px] text-zinc-600">TuOrden v0.4.0 · SQLite local</p>
      </div>
    </aside>
  );
}
