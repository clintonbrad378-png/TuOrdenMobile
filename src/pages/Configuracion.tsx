import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Copy,
  Database,
  HardDriveDownload,
  Info,
  Package,
  RotateCcw,
  ShoppingBag,
  Upload,
} from "lucide-react";
import { api } from "../lib/api";
import type { DbInfo } from "../lib/types";
import { errMsg, humanSize, isoToday } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
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

  const load = useCallback(async () => {
    try {
      setInfo(await api.dbInfo());
    } catch (e) {
      toast("error", errMsg(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
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

        {/* About */}
        <Card className="mt-6 p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Info size={16} className="text-zinc-500" />
            Acerca de
          </h2>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            <p>
              <strong className="text-zinc-300">TuOrden POS</strong> · v0.1.0
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
