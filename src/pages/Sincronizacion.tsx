import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, QrCode, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { api } from "../lib/api";
import type { SyncStatus } from "../lib/types";
import { errMsg } from "../lib/format";
import { useAuth } from "../lib/auth";
import {
  generateLink,
  getLastSync,
  getRelayClient,
  getRelayConfig,
  getSyncIntervalMin,
  pullCatalog,
  pullSales,
  pushCatalog,
  redeemLink,
  saveRelayConfig,
  setSyncIntervalMin,
  syncNow,
  testRelay,
} from "../lib/sync";
import { Badge, Button, Card, Input, PageHeader, Spinner, cn, useToast } from "../components/ui";

const INTERVAL_OPTIONS = [
  { value: 0, label: "Solo manual" },
  { value: 1, label: "Cada 1 min" },
  { value: 5, label: "Cada 5 min" },
  { value: 15, label: "Cada 15 min" },
  { value: 30, label: "Cada 30 min" },
];

export default function Sincronizacion() {
  const toast = useToast();
  const { isDependiente } = useAuth();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [sbUrl, setSbUrl] = useState("");
  const [sbAnon, setSbAnon] = useState("");
  const [code, setCode] = useState("");
  const [lastCode, setLastCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [interval, setInterval] = useState(5);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  const reload = useCallback(async () => {
    try {
      setStatus(await api.syncGetDevice());
    } catch (e) {
      toast("error", errMsg(e));
    }
    const cfg = getRelayConfig();
    setSbUrl(cfg.url);
    setSbAnon(cfg.anonKey);
    setInterval(getSyncIntervalMin());
    setLastSync(getLastSync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onUpd = () => reload();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("tuorden:catalog-updated", onUpd);
    window.addEventListener("tuorden:sales-imported", onUpd);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("tuorden:catalog-updated", onUpd);
      window.removeEventListener("tuorden:sales-imported", onUpd);
    };
  }, [reload]);

  const handleSaveRelay = () => {
    saveRelayConfig(sbUrl, sbAnon);
    toast("success", "Conexión guardada");
  };

  const handleTestRelay = async () => {
    setBusy(true);
    try {
      saveRelayConfig(sbUrl, sbAnon);
      const msg = await testRelay();
      toast("success", msg);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      saveRelayConfig(sbUrl, sbAnon);
      const r = await generateLink("caja-gerente");
      setLastCode(r.code);
      await reload();
      toast("success", `Código ${r.code} listo para compartir (24h, 5 usos)`);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    if (!code.trim()) {
      toast("error", "Ingresa el código del gerente");
      return;
    }
    setBusy(true);
    try {
      saveRelayConfig(sbUrl, sbAnon);
      await redeemLink(code, "caja-dependiente");
      setCode("");
      await reload();
      toast("success", "Vinculado. Ahora descarga el menú.");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const msg = await syncNow();
      await reload();
      toast(msg.includes("Sin") ? "info" : "success", msg);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePushCatalog = async () => {
    setBusy(true);
    try {
      const r = await pushCatalog();
      await reload();
      toast("success", `Catálogo v${r.version} publicado (${r.count})`);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePullCatalog = async () => {
    setBusy(true);
    try {
      const r = await pullCatalog();
      await reload();
      toast("success", r.applied ? `Menú actualizado a v${r.version}` : "Menú al día");
      if (r.applied) window.location.reload();
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePullSales = async () => {
    setBusy(true);
    try {
      const r = await pullSales();
      await reload();
      toast(r.imported ? "success" : "info", r.imported ? `Importadas ${r.imported}${r.conflicts ? ` (${r.conflicts} con stock bajo)` : ""}` : "Sin ventas nuevas");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lastCode);
      toast("info", "Código copiado");
    } catch {
      toast("error", "No se pudo copiar");
    }
  };

  const connected = !!getRelayClient();
  const role = status?.role ?? (isDependiente ? "dependiente" : "gerente");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Sincronización"
          subtitle={role === "dependiente" ? "Recibe el menú y envía tus ventas" : "Comparte tu menú y recibe ventas"}
          actions={
            <div className="flex items-center gap-2">
              <Badge tone={online ? "success" : "danger"}>
                {online ? <Wifi size={11} /> : <WifiOff size={11} />}
                {online ? "En línea" : "Sin internet"}
              </Badge>
              <Button variant="ghost" size="sm" onClick={reload}>
                <RefreshCw size={14} />
                Actualizar
              </Button>
            </div>
          }
        />

        {!status ? (
          <div className="grid h-24 place-items-center"><Spinner /></div>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Smartphone size={16} className="text-accent-400" />
                  Este dispositivo
                </h2>
                <Badge tone={status.businessId ? "accent" : "zinc"}>
                  {status.businessId ? `Vinculado · ${role}` : "Sin vincular"}
                </Badge>
              </div>
              <p className="mt-2 font-mono text-[11px] break-all text-zinc-500">
                ID {status.deviceId} · Catálogo v{status.catalogVersion} · Pendientes {status.pendingOut}
              </p>
              {lastSync && <p className="mt-1 text-[11px] text-zinc-600">Última sync: {new Date(lastSync).toLocaleString()}</p>}
              {status.pendingOut > 0 && (
                <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Tienes {status.pendingOut} venta(s) sin enviar. Se envían solas al reconectar o con el botón Sincronizar.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={handleSync} loading={busy}>
                  <RefreshCw size={15} />
                  Sincronizar ahora
                </Button>
                {role === "dependiente" ? (
                  <Button variant="outline" onClick={handlePullCatalog} disabled={busy}>
                    Descargar menú
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={handlePushCatalog} disabled={busy}>
                      Publicar catálogo
                    </Button>
                    <Button variant="outline" onClick={handlePullSales} disabled={busy}>
                      Recibir ventas
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-xs text-zinc-400">Auto-sync con app abierta:</span>
                <div className="flex flex-wrap gap-1.5">
                  {INTERVAL_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => { setSyncIntervalMin(o.value); setInterval(o.value); }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        interval === o.value
                          ? "border-accent-500/40 bg-accent-500/10 text-accent-400"
                          : "border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                      )}
                    >
                      {o.value === interval && <Check size={11} className="mr-1 inline" />}
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
                El auto-sync corre solo con la app abierta (Android suspende timers en 2do plano).
                Al volver al frente o reconectar se sincroniza solo. 0 = solo manual.
              </p>
            </Card>

            {!isDependiente && (
              <Card className="mt-6 p-5">
                <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <QrCode size={16} className="text-accent-400" />
                  Compartir con dependiente
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                  Genera un código de 6 letras. El dependiente lo ingresa una vez y queda vinculado.
                  Válido 24h, 5 usos. Luego publica el catálogo.
                </p>
                <div className="mt-4">
                  <Button variant="primary" onClick={handleGenerate} loading={busy}>
                    <QrCode size={15} />
                    Generar código
                  </Button>
                </div>
                {lastCode && (
                  <div className="mt-4 flex flex-col items-center rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-4">
                    <button onClick={copyCode} className="flex items-center gap-2 text-3xl font-bold tracking-[0.3em] text-zinc-50">
                      {lastCode}
                      <Copy size={16} className="text-zinc-500" />
                    </button>
                    <div className="mt-3 rounded-2xl bg-white p-3 shadow-xl">
                      <QRCodeSVG value={`TUORDEN:${lastCode}`} size={160} level="M" bgColor="#ffffff" fgColor="#000000" />
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">El dependiente escribe el código o escanea el QR</p>
                  </div>
                )}
              </Card>
            )}

            {isDependiente && (
              <Card className="mt-6 p-5">
                <h2 className="text-sm font-medium text-zinc-200">Unirse con código</h2>
                <p className="mt-1.5 text-xs text-zinc-500">Pide al gerente su código de 6 letras e ingrésalo una vez.</p>
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Ej. KQ7M2X"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                    className="font-mono tracking-[0.2em] uppercase"
                  />
                  <Button variant="primary" onClick={handleRedeem} loading={busy}>
                    Vincular
                  </Button>
                </div>
              </Card>
            )}

            <Card className="mt-6 p-5">
              <h2 className="text-sm font-medium text-zinc-200">Conexión Supabase (relay)</h2>
              <p className="mt-1.5 text-xs text-zinc-500">
                Mismo proyecto que usabas para el panel. Solo es buzón de intercambio, la venta sigue offline.
                {connected ? "" : " Pega URL y anon key."}
              </p>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Supabase URL</label>
                  <Input placeholder="https://xyz.supabase.co" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Anon key</label>
                  <Input type="password" placeholder="eyJhbGciOi..." value={sbAnon} onChange={(e) => setSbAnon(e.target.value)} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleSaveRelay}>Guardar conexión</Button>
                <Button variant="ghost" onClick={handleTestRelay} loading={busy}>Probar conexión</Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
