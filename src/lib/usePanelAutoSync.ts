import { useEffect, useRef } from "react";
import { pushPanelSnapshot } from "./panelSync";
import { getPanelClient, getPanelIntervalMin } from "./supabase";

/**
 * Auto-sync del panel online cada N minutos.
 * - Solo cuando hay sesión Supabase (gerente logueado) y la app está visible.
 * - 0 = desactivado (solo manual). Valores: 1, 5, 15, 30, 60.
 * - En Android/iOS el intervalo solo corre con la app abierta (el OS
 *   suspende timers en segundo plano). Al volver al frente, sincroniza.
 */
export function usePanelAutoSync(onStatus?: (msg: string | null, err?: boolean) => void) {
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const stop = () => {
      if (timer.current) window.clearInterval(timer.current);
      timer.current = null;
    };
    const tick = async (force = false) => {
      try {
        const sb = getPanelClient();
        if (!sb) return;
        const { data } = await sb.auth.getSession();
        if (!data.session) return;
        if (document.hidden) return;
        const r = await pushPanelSnapshot(force);
        if (!r.skipped) onStatus?.(`Sincronizado ${new Date().toLocaleTimeString("es-AR")}`);
      } catch (e) {
        // Silencioso en auto: no spamear toasts cada minuto; solo reporta estado.
        onStatus?.(e instanceof Error ? e.message : "Error de sincronización", true);
      }
    };

    const start = () => {
      stop();
      const min = getPanelIntervalMin();
      if (min <= 0) return;
      // Primera subida al abrir (sin forzar: se omite si nada cambió)
      void tick(false);
      timer.current = window.setInterval(() => void tick(false), min * 60_000);
    };

    start();
    const onVis = () => {
      if (!document.hidden) void tick(false);
    };
    const onCfg = () => start();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("tuorden:panel-config", onCfg);
    window.addEventListener("online", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("tuorden:panel-config", onCfg);
      window.removeEventListener("online", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function notifyPanelConfigChanged() {
  window.dispatchEvent(new Event("tuorden:panel-config"));
}
