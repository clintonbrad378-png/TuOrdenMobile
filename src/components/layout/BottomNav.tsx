import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  CreditCard,
  History,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../ui";
import { useAuth } from "../../lib/auth";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
  { to: "/historial", label: "Historial", icon: History, end: false },
  { to: "/menu", label: "Menú", icon: UtensilsCrossed, end: false },
  { to: "/materiales", label: "Materiales", icon: Boxes, end: false },
  { to: "/entradas", label: "Entradas", icon: Truck, end: false },
  { to: "/mermas", label: "Mermas", icon: Trash2, end: false },
  { to: "/gastos", label: "Gastos", icon: CreditCard, end: false },
  { to: "/reportes", label: "Reportes", icon: BarChart3, end: false },
  { to: "/configuracion", label: "Ajustes", icon: Settings, end: false },
];

const VENTA_ONLY = [
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
];

export default function BottomNav() {
  const { isDependiente } = useAuth();
  const nav = isDependiente ? VENTA_ONLY : NAV;

  // En modo dependiente solo mostrar venta centrado + banner
  if (isDependiente) {
    return (
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-surface-900/95 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center justify-center gap-3 px-4">
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300">
            Modo dependiente
          </span>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "relative flex touch-none flex-col items-center justify-center gap-1 rounded-xl px-6 py-1.5 transition-colors active:bg-white/[0.06]",
                  isActive ? "bg-white/[0.07] text-accent-400" : "text-zinc-400",
                )
              }
            >
              <Icon size={20} />
              <span className="text-[10px] leading-none font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-surface-900/95 backdrop-blur lg:hidden">
      <div className="scrollbar-hide flex h-[76px] touch-pan-x items-stretch gap-1 overflow-x-auto px-2">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative flex min-w-[78px] flex-1 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-xl transition-colors active:bg-white/[0.06]",
                isActive ? "text-accent-400" : "text-zinc-500",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-1 h-1 w-10 rounded-full bg-accent-400" />
                )}
                <Icon size={26} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[11px] leading-none font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
