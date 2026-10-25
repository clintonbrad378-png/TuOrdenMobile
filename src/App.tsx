import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { Lock } from "lucide-react";
import BottomNav from "./components/layout/BottomNav";
import Sidebar from "./components/layout/Sidebar";
import LicenseGate from "./components/LicenseGate";
import RoleGate from "./components/RoleGate";
import { Button, ToastProvider, useToast } from "./components/ui";
import { AuthProvider, clearStoredSession, useAuth } from "./lib/auth";
import { useSyncAuto } from "./lib/useSyncAuto";
import { firstAllowedPath, hasAnyAccess, sectionForPath } from "./lib/access";
import Configuracion from "./pages/Configuracion";
import Gastos from "./pages/Gastos";
import Licencia from "./pages/Licencia";
import Dashboard from "./pages/Dashboard";
import Materiales from "./pages/Materiales";
import Menu from "./pages/Menu";
import Produccion from "./pages/Produccion";
import Reportes from "./pages/Reportes";
import Venta from "./pages/Venta";
import Entradas from "./pages/Entradas";
import Historial from "./pages/Historial";
import Mermas from "./pages/Mermas";
import Sincronizacion from "./pages/Sincronizacion";

function AccessGuard({ children }: { children: React.ReactNode }) {
  const { user, can } = useAuth();
  const loc = useLocation();
  if (!user) return null;
  const section = sectionForPath(loc.pathname);
  if (!section || !can(section)) {
    return <Navigate to={firstAllowedPath(user)} replace />;
  }
  return <>{children}</>;
}

function SessionBanner() {
  const { user, isOwner, logout } = useAuth();
  if (!user) return null;
  const count = user.permissions.length;
  return (
    <div
      className={
        isOwner
          ? "flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2 text-xs lg:hidden"
          : "flex items-center justify-between gap-2 border-b border-amber-500/15 bg-amber-500/10 px-4 py-2 text-xs"
      }
    >
      <span className={isOwner ? "font-medium text-zinc-400" : "font-medium text-amber-300"}>
        {isOwner
          ? `Sesión: ${user.name}`
          : `Sesión: ${user.name} — ${count} ${
              count === 1 ? "sección habilitada" : "secciones habilitadas"
            }`}
      </span>
      <button
        onClick={logout}
        className={
          isOwner
            ? "shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/15"
            : "shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-medium text-amber-100 hover:bg-white/15"
        }
      >
        Cambiar de usuario
      </button>
    </div>
  );
}

function NoAccess() {
  const { user, logout } = useAuth();
  return (
    <div className="grid h-full place-items-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
          <Lock size={26} />
        </div>
        <h1 className="text-lg font-semibold text-zinc-100">Sin secciones autorizadas</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          {user?.name ?? "Tu usuario"} no tiene acceso a ninguna sección. Pide al gerente que te
          asigne al menos una desde Configuración → Usuarios y permisos.
        </p>
        <Button variant="outline" className="mt-4" onClick={logout}>
          Cambiar de usuario
        </Button>
      </div>
    </div>
  );
}

function Shell() {
  const toast = useToast();
  const { user } = useAuth();
  useSyncAuto((msg, err) => {
    if (msg) toast(err ? "error" : "success", msg);
  });
  const hasAccess = !!user && hasAnyAccess(user);
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <SessionBanner />
        <main className="min-w-0 flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          {hasAccess ? (
            <AccessGuard>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/venta" element={<Venta />} />
                <Route path="/historial" element={<Historial />} />
                <Route path="/menu" element={<Menu />} />
                <Route path="/produccion" element={<Produccion />} />
                <Route path="/materiales" element={<Materiales />} />
                <Route path="/entradas" element={<Entradas />} />
                <Route path="/mermas" element={<Mermas />} />
                <Route path="/gastos" element={<Gastos />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/configuracion" element={<Configuracion />} />
                <Route path="/sincronizacion" element={<Sincronizacion />} />
                <Route path="/licencia" element={<Licencia />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AccessGuard>
          ) : (
            <NoAccess />
          )}
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
    listen("db-restored", () => {
      clearStoredSession();
      window.location.reload();
    }).then((fn) => {
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
