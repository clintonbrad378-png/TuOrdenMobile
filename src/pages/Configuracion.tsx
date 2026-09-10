import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Cloud,
  Copy,
  Database,
  Eye,
  EyeOff,
  HardDriveDownload,
  Info,
  Lock,
  Package,
  RotateCcw,
  Shield,
  ShoppingBag,
  Upload,
} from "lucide-react";
import { api } from "../lib/api";
import type { DbInfo } from "../lib/types";
import { errMsg, humanSize, isoToday } from "../lib/format";
import { useAuth } from "../lib/auth";
import {
  getLastPush,
  getPanelClient,
  getPanelConfig,
  getPanelEmail,
  getPanelIncludeCosts,
  getPanelIntervalMin,
  savePanelConfig,
  setPanelEmail,
  setPanelIncludeCosts,
  setPanelIntervalMin,
} from "../lib/supabase";
import { pushPanelSnapshot, resetPanelDedupe } from "../lib/panelSync";
import { notifyPanelConfigChanged } from "../lib/usePanelAutoSync";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  PageHeader,
  Spinner,
  useToast,
} from "../components/ui";

export default function Configuracion() {
  const [info, setInfo] = useState<DbInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const toast = useToast();
  const { isDependiente } = useAuth();
  const [pinHint, setPinHint] = useState<string>("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPins, setShowPins] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  // Panel online (Supabase)
  const [sbUrl, setSbUrl] = useState("");
  const [sbAnon, setSbAnon] = useState("");
  const [sbEmail, setSbEmail] = useState("");
  const [sbPass, setSbPass] = useState("");
  const [sbSession, setSbSession] = useState<string | null>(null);
  const [sbInterval, setSbInterval] = useState(5);
  const [sbCosts, setSbCosts] = useState(true);
  const [sbBusy, setSbBusy] = useState(false);
  const [sbLastPush, setSbLastPush] = useState<string | null>(null);
  const [showSbKeys, setShowSbKeys] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api.dbInfo());
    } catch (e) {
      toast("error", errMsg(e));
    }
    try {
      if (!isDependiente) {
        const hint = await api.getManagerPinHint();
        setPinHint(hint);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDependiente]);

  useEffect(() => {
    load();
  }, [load]);

  // Cargar config del panel + sesión Supabase
  useEffect(() => {
    const cfg = getPanelConfig();
    setSbUrl(cfg.url);
    setSbAnon(cfg.anonKey);
    setSbEmail(getPanelEmail());
    setSbInterval(getPanelIntervalMin());
    setSbCosts(getPanelIncludeCosts());
    setSbLastPush(getLastPush());
    const sb = getPanelClient();
    sb?.auth.getSession().then(({ data }) => {
      setSbSession(data.session?.user?.email ?? null);
    }).catch(() => {});
    const { data: sub } = sb?.auth.onAuthStateChange((_e, s) => {
      setSbSession(s?.user?.email ?? null);
    }) ?? { data: { subscription: { unsubscribe: () => {} } } };
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSavePanelConfig = () => {
    savePanelConfig({ url: sbUrl, anonKey: sbAnon });
    setPanelEmail(sbEmail);
    setPanelIntervalMin(sbInterval);
    setPanelIncludeCosts(sbCosts);
    resetPanelDedupe();
    notifyPanelConfigChanged();
    toast("success", "Configuración del panel guardada");
  };

  const handlePanelLogin = async () => {
    if (!sbEmail.trim() || !sbPass) {
      toast("error", "Ingresa email y contraseña del gerente");
      return;
    }
    setSbBusy(true);
    try {
      savePanelConfig({ url: sbUrl, anonKey: sbAnon });
      setPanelEmail(sbEmail);
      const sb = getPanelClient();
      if (!sb) throw new Error("Configura URL y anon key primero");
      const { error } = await sb.auth.signInWithPassword({ email: sbEmail.trim(), password: sbPass });
      if (error) throw new Error(error.message);
      setSbPass("");
      notifyPanelConfigChanged();
      toast("success", "Sesión de gerente iniciada para el panel");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSbBusy(false);
    }
  };

  const handlePanelLogout = async () => {
    try {
      await getPanelClient()?.auth.signOut();
      toast("info", "Sesión del panel cerrada");
    } catch (e) {
      toast("error", errMsg(e));
    }
  };

  const handlePanelSignup = async () => {
    if (!sbEmail.trim() || !sbPass) {
      toast("error", "Ingresa email y contraseña para crear la cuenta de gerente");
      return;
    }
    if (sbPass.length < 6) {
      toast("error", "La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setSbBusy(true);
    try {
      savePanelConfig({ url: sbUrl, anonKey: sbAnon });
      setPanelEmail(sbEmail);
      const sb = getPanelClient();
      if (!sb) throw new Error("Configura URL y anon key primero");
      const { data, error } = await sb.auth.signUp({ email: sbEmail.trim(), password: sbPass });
      if (error) throw new Error(error.message);
      if (!data.session) {
        throw new Error(
          "Cuenta creada. Revisa tu email para confirmarla, o desactiva Auth → Sign In/Up → Confirm email en Supabase y vuelve a iniciar sesión",
        );
      }
      setSbPass("");
      notifyPanelConfigChanged();
      toast("success", "Cuenta de gerente creada y sesión iniciada");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSbBusy(false);
    }
  };

  const handlePublishNow = async () => {
    setSbBusy(true);
    try {
      savePanelConfig({ url: sbUrl, anonKey: sbAnon });
      const r = await pushPanelSnapshot(true);
      setSbLastPush(r.updatedAt);
      toast("success", r.skipped ? "Sin cambios, nada que subir" : "Resumen del día publicado");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSbBusy(false);
    }
  };

  const createBackup = async () => {
    setBackingUp(true);
    try {
      const path = await save({
        title: "Guardar respaldo de la base de datos",
        defaultPath: `tuorden-respaldo-${isoToday()}.db`,
        filters: [{ name: "Base de datos", extensions: ["db"] }],
      });
      if (!path) return;
      await api.backupDatabase(path);
      toast("success", `Respaldo creado en:\n${path}`);
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setBackingUp(false);
    }
  };

  const pickRestore = async () => {
    try {
      const path = await open({
        title: "Seleccionar respaldo a restaurar",
        multiple: false,
        directory: false,
        filters: [{ name: "Base de datos", extensions: ["db"] }],
      });
      if (typeof path === "string") setRestorePath(path);
    } catch (e) {
      toast("error", errMsg(e));
    }
  };

  const doRestore = async () => {
    if (!restorePath) return;
    setRestoring(true);
    try {
      await api.restoreDatabase(restorePath);
      // The backend emits "db-restored" and the app reloads itself.
    } catch (e) {
      toast("error", errMsg(e));
      setRestoring(false);
    }
  };

  const copyPath = async () => {
    if (!info?.path) return;
    try {
      await navigator.clipboard.writeText(info.path);
      toast("info", "Ruta copiada al portapapeles");
    } catch {
      toast("error", "No se pudo copiar la ruta");
    }
  };

  const handleChangePin = async () => {
    if (!currentPin.trim() || !newPin.trim() || !confirmPin.trim()) {
      toast("error", "Completa todos los campos de PIN");
      return;
    }
    if (newPin !== confirmPin) {
      toast("error", "El nuevo PIN y la confirmación no coinciden");
      return;
    }
    if (newPin.length < 4 || newPin.length > 12 || !/^\d+$/.test(newPin)) {
      toast("error", "El PIN debe ser de 4 a 12 dígitos numéricos");
      return;
    }
    setSavingPin(true);
    try {
      const ok = await api.verifyManagerPin(currentPin.trim());
      if (!ok) {
        toast("error", "PIN actual incorrecto");
        return;
      }
      await api.setManagerPin(newPin.trim());
      const hint = await api.getManagerPinHint();
      setPinHint(hint);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast("success", "PIN de gerente actualizado correctamente");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setSavingPin(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Configuración"
          subtitle="Respaldos y estado de tu base de datos"
          actions={
            <Button variant="ghost" size="sm" onClick={load}>
              <RotateCcw size={14} />
              Actualizar
            </Button>
          }
        />

        {/* Database info */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Database size={16} className="text-accent-400" />
              Base de datos
            </h2>
            {info && (
              <Badge tone="accent">{humanSize(info.sizeBytes)}</Badge>
            )}
          </div>
          {!info ? (
            <div className="grid h-24 place-items-center">
              <Spinner />
            </div>
          ) : (
            <>
              <button
                onClick={copyPath}
                className="mt-4 flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
                title="Copiar ruta"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">
                  {info.path || "—"}
                </span>
                <Copy size={13} className="shrink-0 text-zinc-500" />
              </button>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge>
                  <Package size={11} />
                  {info.materials} materiales
                </Badge>
                <Badge>
                  <Info size={11} />
                  {info.products} productos
                </Badge>
                <Badge>
                  <ShoppingBag size={11} />
                  {info.sales} ventas
                </Badge>
              </div>
            </>
          )}
        </Card>

        {/* Backups */}
        <Card className="mt-6 p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <HardDriveDownload size={16} className="text-accent-400" />
            Respaldos
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            Guarda copias de seguridad de tu base de datos en cualquier carpeta de tu equipo.
            Se recomienda hacer respaldos periódicos, especialmente antes de restaurar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={createBackup} loading={backingUp}>
              <HardDriveDownload size={15} />
              Crear respaldo
            </Button>
            <Button variant="outline" onClick={pickRestore}>
              <Upload size={15} />
              Restaurar desde copia…
            </Button>
          </div>
        </Card>

        {/* PIN Gerente */}
        {!isDependiente ? (
          <Card className="mt-6 p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Lock size={16} className="text-accent-400" />
                PIN de Gerente
              </h2>
              <Badge tone={pinHint ? "accent" : "zinc"}>{pinHint ? `Actual: ${pinHint}` : "Sin configurar"}</Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
              Este PIN protege el acceso completo a la app. El modo dependiente no lo necesita. Por defecto es <span className="font-mono text-zinc-400">1234</span>.
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-zinc-400">PIN actual</label>
                <div className="relative">
                  <Input
                    type={showPins ? "text" : "password"}
                    inputMode="numeric"
                    placeholder="Ingresa PIN actual"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPins((v) => !v)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/5"
                  >
                    {showPins ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Nuevo PIN (4-12 dígitos)</label>
                <Input
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="Nuevo PIN"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Confirmar nuevo PIN</label>
                <Input
                  type={showPins ? "text" : "password"}
                  inputMode="numeric"
                  placeholder="Repite el nuevo PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={handleChangePin} loading={savingPin}>
                <Shield size={15} />
                {savingPin ? "Guardando..." : "Actualizar PIN"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCurrentPin("");
                  setNewPin("");
                  setConfirmPin("");
                }}
              >
                Limpiar
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="mt-6 p-5 border-amber-500/15 bg-amber-500/[0.04]">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
              <Shield size={16} />
              Modo dependiente activo
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
              No tienes permiso para cambiar el PIN de gerente ni ver esta configuración completa. Inicia sesión como gerente para gestionar el PIN.
            </p>
          </Card>
        )}

        {/* Panel online (Supabase) */}
        {!isDependiente && (
          <Card className="mt-6 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Cloud size={16} className="text-accent-400" />
                Panel online
              </h2>
              <Badge tone={sbSession ? "accent" : "zinc"}>
                {sbSession ? `Conectado: ${sbSession}` : "Sin sesión"}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
              Mira las ventas del día, el stock y los productos vendidos desde cualquier navegador.
              Pega tu URL y clave, inicia sesión y la app lo mantiene actualizado solo.
            </p>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Supabase URL</label>
                <Input
                  placeholder="https://xyz.supabase.co"
                  value={sbUrl}
                  onChange={(e) => setSbUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-zinc-400">Anon key</label>
                <div className="relative">
                  <Input
                    type={showSbKeys ? "text" : "password"}
                    placeholder="eyJhbGciOi..."
                    value={sbAnon}
                    onChange={(e) => setSbAnon(e.target.value)}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSbKeys((v) => !v)}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/5"
                  >
                    {showSbKeys ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Email gerente</label>
                  <Input
                    type="email"
                    placeholder="gerente@negocio.com"
                    value={sbEmail}
                    onChange={(e) => setSbEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Contraseña</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={sbPass}
                    onChange={(e) => setSbPass(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium text-zinc-400">Actualizar cada</label>
                  <select
                    value={sbInterval}
                    onChange={(e) => setSbInterval(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/10 bg-surface-800 px-3 py-2 text-sm text-zinc-100 outline-none"
                  >
                    <option value={0}>Solo manual</option>
                    <option value={1}>Cada 1 min</option>
                    <option value={5}>Cada 5 min</option>
                    <option value={15}>Cada 15 min</option>
                    <option value={30}>Cada 30 min</option>
                    <option value={60}>Cada 1 hora</option>
                  </select>
                </div>
                <label className="flex items-end gap-2 pb-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={sbCosts}
                    onChange={(e) => setSbCosts(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  Incluir costos y ganancia
                </label>
              </div>
              {sbLastPush && (
                <p className="text-[11px] text-zinc-600">Última publicación: {sbLastPush}</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleSavePanelConfig}>
                Guardar
              </Button>
              {sbSession ? (
                <Button variant="ghost" onClick={handlePanelLogout}>
                  Cerrar sesión
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handlePanelLogin} loading={sbBusy}>
                    <Lock size={15} />
                    Iniciar sesión
                  </Button>
                  <Button variant="ghost" onClick={handlePanelSignup} disabled={sbBusy}>
                    Crear cuenta gerente
                  </Button>
                </>
              )}
              <Button variant="primary" onClick={handlePublishNow} loading={sbBusy}>
                <Cloud size={15} />
                Publicar ahora
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
              El auto-sync omite subidas si nada cambió (ahorra datos). En móvil solo sincroniza con la app abierta;
              al volver al frente se actualiza solo.
            </p>
          </Card>
        )}

        {/* About */}
        <Card className="mt-6 p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Info size={16} className="text-zinc-500" />
            Acerca de
          </h2>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <p>
              <strong className="text-zinc-300">TuOrden POS</strong> · v0.2.0
            </p>
            <p>
              Punto de venta con control de inventario por recetas. Los materiales se descuentan
              automáticamente al confirmar cada venta.
            </p>
            <p>Tauri + Rust + React + SQLite · Datos almacenados localmente.</p>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={restorePath !== null}
        onClose={() => setRestorePath(null)}
        onConfirm={doRestore}
        loading={restoring}
        danger
        title="Restaurar base de datos"
        confirmLabel="Restaurar ahora"
        message={
          <>
            Se reemplazará <strong>completamente</strong> la base de datos actual con el contenido
            del respaldo seleccionado. Esta acción no se puede deshacer.
            <br />
            <br />
            <span className="font-mono text-[11px] break-all text-zinc-500">{restorePath}</span>
          </>
        }
      />
    </div>
  );
}
