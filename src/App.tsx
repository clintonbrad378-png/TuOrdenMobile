import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import BottomNav from "./components/layout/BottomNav";
import Sidebar from "./components/layout/Sidebar";
import LicenseGate from "./components/LicenseGate";
import RoleGate from "./components/RoleGate";
import { ToastProvider } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { usePanelAutoSync } from "./lib/usePanelAutoSync";
import Configuracion from "./pages/Configuracion";
import Gastos from "./pages/Gastos";
import Licencia from "./pages/Licencia";
import Dashboard from "./pages/Dashboard";
import Materiales from "./pages/Materiales";
import Menu from "./pages/Menu";
import Reportes from "./pages/Reportes";
import Venta from "./pages/Venta";
import Entradas from "./pages/Entradas";
import Historial from "./pages/Historial";
import Mermas from "./pages/Mermas";

function DependienteGuard({ children }: { children: React.ReactNode }) {
  const { isDependiente } = useAuth();
  const loc = useLocation();
  if (isDependiente && loc.pathname !== "/venta") {
    return <Navigate to="/venta" replace />;
  }
  return <>{children}</>;
}

function DependienteBanner() {
  const { isDependiente, logout } = useAuth();
  if (!isDependiente) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-amber-500/15 bg-amber-500/10 px-4 py-2 text-xs">
      <span className="font-medium text-amber-300">Modo dependiente — solo Ventas habilitadas</span>
      <button onClick={logout} className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-white/15">
        Cambiar a gerente
      </button>
    </div>
  );
}

function Shell() {
  usePanelAutoSync();
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DependienteBanner />
        <main className="min-w-0 flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <DependienteGuard>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/venta" element={<Venta />} />
              <Route path="/historial" element={<Historial />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/materiales" element={<Materiales />} />
              <Route path="/entradas" element={<Entradas />} />
              <Route path="/mermas" element={<Mermas />} />
              <Route path="/gastos" element={<Gastos />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/licencia" element={<Licencia />} />
              <Route path="*" element={<Navigate to="/venta" replace />} />
            </Routes>
          </DependienteGuard>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("db-restored", () => window.location.reload()).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <LicenseGate>
            <RoleGate>
              <Shell />
            </RoleGate>
          </LicenseGate>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
