import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ACCESS_LEVEL_LABELS } from "../lib/access";
import { errMsg } from "../lib/format";
import type { AuthStatus, LoginUser } from "../lib/types";
import { Badge, Button, Card, Input, Spinner, cn } from "./ui";

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [deviceRole, setDeviceRole] = useState("gerente");
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const load = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const [nextStatus, nextUsers] = await Promise.all([
        api.authStatus(),
        api.listLoginUsers(),
      ]);
      let nextDeviceRole = "gerente";
      try {
        nextDeviceRole = (await api.syncGetDevice()).role;
      } catch {}
      setStatus(nextStatus);
      setUsers(nextUsers);
      setDeviceRole(nextDeviceRole);
    } catch (e) {
      setDataError(errMsg(e));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!auth.loading && !auth.user) load();
  }, [auth.loading, auth.user, load]);

  useEffect(() => {
    if (auth.user) {
      setSelected(null);
      setPin("");
      setNewPin("");
      setConfirmPin("");
      setError(null);
    }
  }, [auth.user]);

  if (auth.loading) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-surface-950">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (auth.user) {
    return <>{children}</>;
  }

  const isDependentDevice = deviceRole === "dependiente";
  const visibleUsers = isDependentDevice
    ? users.filter((user) => !user.isOwner || user.hasPin)
    : users;
  const owner = users.find((user) => user.isOwner) ?? null;
  const quickUser = users.find((user) => !user.isOwner && !user.hasPin) ?? null;
  const needsSetup = status ? !status.ownerHasPin && !isDependentDevice : false;

  const doLogin = async (user: LoginUser, pinValue?: string | null) => {
    setSubmitting(true);
    setError(null);
    try {
      await auth.login(user.id, pinValue ?? null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = (user: LoginUser) => {
    setError(null);
    if (user.hasPin) {
      setSelected(user);
      setPin("");
      return;
    }
    void doLogin(user);
  };

  const handlePinSubmit = () => {
    if (!selected) return;
    if (!pin.trim()) {
      setError("Ingresa el PIN");
      return;
    }
    void doLogin(selected, pin.trim());
  };

  const handleCreateOwnerPin = async () => {
    if (!owner) {
      setError("No se encontró el usuario gerente. Reinicia la app.");
      return;
    }
    const p1 = newPin.trim();
    const p2 = confirmPin.trim();
    if (!p1 || !p2) {
      setError("Crea el PIN del gerente (4-12 dígitos)");
      return;
    }
    if (p1 !== p2) {
      setError("El PIN y la confirmación no coinciden");
      return;
    }
    if (p1.length < 4 || p1.length > 12 || !/^\d+$/.test(p1)) {
      setError("El PIN debe tener entre 4 y 12 dígitos numéricos");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.setOwnerPin(p1, null);
      setStatus((current) =>
        current ? { ...current, ownerHasPin: true } : current,
      );
      await auth.login(owner.id, p1);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const renderContent = () => {
    if (loadingData) {
      return (
        <div className="grid h-40 place-items-center">
          <Spinner className="h-8 w-8" />
        </div>
      );
    }

    if (dataError) {
      return (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-100">No se pudo cargar el acceso</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-red-400">{dataError}</p>
          <Button variant="outline" className="mt-4" onClick={load}>
            <RefreshCw size={14} />
            Reintentar
          </Button>
        </Card>
      );
    }

    if (!status?.ownerExists) {
      return (
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-100">Falta inicializar el gerente</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            No se encontró el usuario propietario. Cierra y vuelve a abrir la app para que la
            migración termine de crear los usuarios.
          </p>
          <Button variant="outline" className="mt-4" onClick={load}>
            <RefreshCw size={14} />
            Reintentar
          </Button>
        </Card>
      );
    }

    if (needsSetup) {
      return (
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-accent-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Crea el PIN del gerente</h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
            Este PIN protege Configuración, los respaldos y la administración de usuarios.
            Elige uno de 4 a 12 dígitos.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="relative">
              <Input
                type={pinVisible ? "text" : "password"}
                inputMode="numeric"
                placeholder="Nuevo PIN del gerente"
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 12));
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateOwnerPin();
                }}
                autoFocus
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setPinVisible((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              >
                {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Input
              type={pinVisible ? "text" : "password"}
              inputMode="numeric"
              placeholder="Confirma el PIN"
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 12));
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateOwnerPin();
              }}
            />
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleCreateOwnerPin}
              loading={submitting}
            >
              Crear PIN y entrar
            </Button>
          </div>

          {quickUser && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => void doLogin(quickUser)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              >
                <LogOut size={12} />
                Entrar como {quickUser.name} en su lugar
              </button>
            </div>
          )}
        </Card>
      );
    }

    if (selected) {
      return (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-accent-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Hola, {selected.name}</h2>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setPin("");
                setError(null);
              }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <ChevronLeft size={14} />
              Usuarios
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Ingresa tu PIN para continuar</p>

          <div className="relative mt-4">
            <Input
              type={pinVisible ? "text" : "password"}
              inputMode="numeric"
              placeholder="PIN (4-12 dígitos)"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 12));
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePinSubmit();
              }}
              autoFocus
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setPinVisible((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
            >
              {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="mt-4 flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setSelected(null);
                setPin("");
                setError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handlePinSubmit}
              loading={submitting}
            >
              Ingresar
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="grid gap-3">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {visibleUsers.map((user) => {
          const levelLabel = user.isOwner
            ? "Gerente"
            : (ACCESS_LEVEL_LABELS[user.accessLevel] ?? "Personalizado");
          return (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              disabled={submitting}
              className="group block w-full text-left disabled:opacity-60"
            >
              <Card
                className={cn(
                  "p-4 transition-colors",
                  user.isOwner
                    ? "border-accent-500/20 bg-accent-500/[0.04] hover:border-accent-500/40"
                    : "hover:border-white/15",
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                      user.isOwner
                        ? "bg-accent-500/15 text-accent-400"
                        : "bg-white/[0.06] text-zinc-400",
                    )}
                  >
                    {user.isOwner ? <ShieldCheck size={20} /> : <Users size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-zinc-100">{user.name}</h2>
                      <Badge tone={user.isOwner ? "accent" : "zinc"}>{levelLabel}</Badge>
                      {!user.hasPin && <Badge tone="warn">Sin PIN</Badge>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      {user.isOwner
                        ? "Acceso total, configuración y administración de usuarios."
                        : user.hasPin
                          ? "Entra con tu PIN personal."
                          : "Acceso rápido sin PIN. Solo a tus secciones autorizadas."}
                    </p>
                  </div>
                  {user.hasPin ? (
                    <Lock size={15} className="shrink-0 text-zinc-600 group-hover:text-zinc-400" />
                  ) : (
                    <ShoppingCart
                      size={15}
                      className="shrink-0 text-zinc-600 group-hover:text-zinc-400"
                    />
                  )}
                </div>
              </Card>
            </button>
          );
        })}

        {visibleUsers.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-zinc-300">No hay usuarios activos</p>
            <Button variant="outline" className="mt-3" onClick={load}>
              <RefreshCw size={14} />
              Recargar
            </Button>
          </Card>
        )}

        <div className="flex items-center justify-between px-2 pt-1">
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Pide al gerente que te asigne las secciones que necesitas.
          </p>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            <RefreshCw size={11} />
            Recargar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface-950">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-accent-500/20 bg-accent-500/15 text-accent-400">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Bienvenido a TuOrden</h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              Elige tu usuario para ingresar
            </p>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
