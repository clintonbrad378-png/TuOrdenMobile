import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ChefHat,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
  { to: "/menu", label: "Menú", icon: UtensilsCrossed, end: false },
  { to: "/materiales", label: "Materiales", icon: Boxes, end: false },
  { to: "/reportes", label: "Reportes", icon: BarChart3, end: false },
  { to: "/configuracion", label: "Configuración", icon: Settings, end: false },
];

export default function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-surface-900/40 p-4">
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

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
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

      <div className="mt-auto px-3">
        <p className="text-[11px] text-zinc-600">TuOrden v0.1.0 · SQLite local</p>
      </div>
    </aside>
  );
}
