import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  ShoppingCart,
  Trash2,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../ui";
import { useAuth } from "../../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
  { to: "/menu", label: "Menú", icon: UtensilsCrossed, end: false },
  { to: "/materiales", label: "Materiales", icon: Boxes, end: false },
  { to: "/entradas", label: "Entradas", icon: Truck, end: false },
  { to: "/mermas", label: "Mermas", icon: Trash2, end: false },
  { to: "/reportes", label: "Reportes", icon: BarChart3, end: false },
  { to: "/configuracion", label: "Configuración", icon: Settings, end: false },
];

const VENTA_ONLY = [
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
];

export default function Sidebar() {
  const { isDependiente, isGerente, logout, switchToDependiente } = useAuth();
  const nav = isDependiente ? VENTA_ONLY : NAV;

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

      {isDependiente && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <Shield size={14} className="shrink-0 text-amber-400" />
          <span className="text-xs font-medium text-amber-300">Modo dependiente</span>
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
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
        {isDependiente && (
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          >
            <LogOut size={14} />
            Cambiar a gerente
          </button>
        )}
        {isGerente && (
          <div className="space-y-1 border-t border-white/[0.06] pt-3">
            <button
              onClick={switchToDependiente}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              title="Cambiar a modo dependiente (solo ventas)"
            >
              <Shield size={14} />
              Modo dependiente
            </button>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <LogOut size={14} />
              Bloquear
            </button>
          </div>
        )}
        <p className="px-2 text-[11px] text-zinc-600">TuOrden v0.2.0 · SQLite local</p>
      </div>
    </aside>
  );
}
