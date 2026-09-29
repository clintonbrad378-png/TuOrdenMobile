import { useEffect, useRef } from "react";
import { api } from "./api";
import { getRelayClient, getSyncIntervalMin, syncNow } from "./sync";

/**
 * Auto-sync gerente <-> dependiente con tasa de refresco configurable.
 * - Solo con la app abierta y visible (Android suspende timers en 2do plano).
 * - 0 = solo manual. Valores: 1, 5, 15, 30.
 * - push-before-pull: el dependiente sube ventas antes de bajar catalogo.
 * - Al volver al frente / reconectar, sincroniza una vez.
 */
export function useSyncAuto(onStatus?: (msg: string | null, err?: boolean) => void) {
  const timer = useRef<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const stop = () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
    const tick = async (force = false) => {
      if (busy.current) return;
      if (document.hidden && !force) return;
      try {
        const sb = getRelayClient();
        if (!sb) return;
        const dev = await api.syncGetDevice();
        if (!dev.businessId) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        busy.current = true;
        const msg = await syncNow();
        busy.current = false;
        if (msg !== "Sin cambios" && msg !== "Sin ventas nuevas") onStatus?.(msg);
      } catch (e) {
        busy.current = false;
        onStatus?.(e instanceof Error ? e.message : "Error de sincronización", true);
      }
    };

    const start = () => {
      stop();
      const min = getSyncIntervalMin();
      if (min <= 0) return;
      void tick(false);
      timer.current = window.setInterval(() => void tick(false), min * 60_000);
    };

    start();
    const onVis = () => {
      if (!document.hidden) void tick(false);
    };
    const onCfg = () => start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("tuorden:sync-config", onCfg);
    window.addEventListener("online", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("tuorden:sync-config", onCfg);
      window.removeEventListener("online", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
