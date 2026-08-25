import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "../ui";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, end: true },
  { to: "/venta", label: "Venta", icon: ShoppingCart, end: false },
  { to: "/menu", label: "Menú", icon: UtensilsCrossed, end: false },
  { to: "/materiales", label: "Materiales", icon: Boxes, end: false },
  { to: "/reportes", label: "Reportes", icon: BarChart3, end: false },
  { to: "/configuracion", label: "Ajustes", icon: Settings, end: false },
];

export default function BottomNav() {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-surface-900/95 backdrop-blur lg:hidden">
      <div className="grid h-16 grid-cols-6">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "relative flex touch-none flex-col items-center justify-center gap-1 transition-colors active:bg-white/[0.06]",
                isActive ? "text-accent-400" : "text-zinc-500",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent-400" />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[10px] leading-none font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
