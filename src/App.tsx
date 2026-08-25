import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import BottomNav from "./components/layout/BottomNav";
import Sidebar from "./components/layout/Sidebar";
import { ToastProvider } from "./components/ui";
import Configuracion from "./pages/Configuracion";
import Licencia from "./pages/Licencia";
import Dashboard from "./pages/Dashboard";
import Materiales from "./pages/Materiales";
import Menu from "./pages/Menu";
import Reportes from "./pages/Reportes";
import Venta from "./pages/Venta";

function Shell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/venta" element={<Venta />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/materiales" element={<Materiales />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/licencia" element={<Licencia />} />
        </Routes>
      </main>
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
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}
