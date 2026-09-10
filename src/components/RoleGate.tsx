import { useEffect, useState } from "react";
import { ShieldCheck, ShoppingCart, Lock, Eye, EyeOff, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Button, Card, Input, Spinner } from "./ui";

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const { role, loginGerente, loginDependiente } = useAuth();
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    api
      .managerPinExists()
      .then((exists) => setNeedsSetup(!exists))
      .catch(() => setNeedsSetup(false))
      .finally(() => setCheckingPin(false));
  }, []);

  // If role selected, allow
  if (role !== null) {
    return <>{children}</>;
  }

  const handleGerente = async () => {
    if (!pin.trim()) {
      setError("Ingresa el PIN del gerente");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ok = await loginGerente(pin.trim());
      if (!ok) {
        setError("PIN incorrecto");
      } else {
        setPin("");
        setShowPin(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Error al verificar PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePin = async () => {
    const p1 = newPin.trim();
    const p2 = confirmPin.trim();
    if (!p1 || !p2) {
      setError("Crea tu PIN de gerente (4-12 dígitos)");
      return;
    }
    if (p1 !== p2) {
      setError("El PIN y la confirmación no coinciden");
      return;
    }
    if (p1.length < 4 || p1.length > 12 || !/^\d+$/.test(p1)) {
      setError("El PIN debe ser de 4 a 12 dígitos numéricos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.setManagerPin(p1);
      const ok = await loginGerente(p1);
      if (!ok) {
        setError("PIN creado, pero falló el ingreso. Intenta de nuevo.");
      }
      setNewPin("");
      setConfirmPin("");
      setShowPin(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : "Error al crear el PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleDependiente = () => {
    loginDependiente();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-surface-950">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-accent-500/20 bg-accent-500/15 text-accent-400">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Bienvenido a TuOrden</h1>
            <p className="mt-1.5 text-sm text-zinc-500">Elige cómo deseas ingresar</p>
          </div>

          {checkingPin ? (
            <div className="grid h-40 place-items-center">
              <Spinner className="h-8 w-8" />
            </div>
          ) : !showPin ? (
            <div className="grid gap-4">
              <Card className="p-5 transition-colors hover:border-accent-500/20">
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-500/15 text-accent-400">
                    <Lock size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-zinc-100">Acceso Gerente</h2>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Acceso completo: Dashboard, Ventas, Menú, Materiales, Reportes y Configuración. Requiere PIN.
                    </p>
                    <Button variant="primary" size="sm" className="mt-3 w-full sm:w-auto" onClick={() => setShowPin(true)}>
                      <Lock size={14} />
                      {needsSetup ? "Crear PIN de gerente" : "Ingresar PIN de gerente"}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-5 transition-colors hover:border-white/10">
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-400">
                    <ShoppingCart size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-zinc-100">Modo Dependiente</h2>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Solo acceso a <strong className="text-zinc-300">Ventas</strong>. Ideal para personal de mostrador sin acceso a configuraciones sensibles.
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" onClick={handleDependiente}>
                      <ShoppingCart size={14} />
                      Entrar como dependiente
                    </Button>
                  </div>
                </div>
              </Card>

              <p className="px-2 text-center text-[11px] leading-relaxed text-zinc-600">
                {needsSetup
                  ? "Primera vez: crea tu PIN de gerente para proteger el acceso completo."
                  : "Podrás cambiar de modo en cualquier momento desde el menú."}
              </p>
            </div>
          ) : needsSetup ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Lock size={16} className="text-accent-400" />
                  Crea tu PIN de Gerente
                </h2>
                <button
                  onClick={() => {
                    setShowPin(false);
                    setNewPin("");
                    setConfirmPin("");
                    setError(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Volver
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Solo tú lo conocerás. Guárdalo bien, protege todo el negocio.</p>

              <div className="mt-4 grid gap-3">
                <div className="relative">
                  <Input
                    type={pinVisible ? "text" : "password"}
                    inputMode="numeric"
                    placeholder="Nuevo PIN (4-12 dígitos)"
                    value={newPin}
                    onChange={(e) => {
                      setNewPin(e.target.value.replace(/\D/g, "").slice(0, 12));
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreatePin();
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
                    if (e.key === "Enter") handleCreatePin();
                  }}
                />
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

              <div className="mt-4 flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setShowPin(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" className="flex-1" onClick={handleCreatePin} loading={loading}>
                  {loading ? "Creando..." : "Crear y entrar"}
                </Button>
              </div>

              <div className="mt-4 flex justify-center">
                <button onClick={handleDependiente} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                  <LogOut size={12} />
                  Entrar como dependiente en su lugar
                </button>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Lock size={16} className="text-accent-400" />
                  PIN de Gerente
                </h2>
                <button
                  onClick={() => {
                    setShowPin(false);
                    setPin("");
                    setError(null);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Volver
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Ingresa el PIN para desbloquear todas las secciones</p>

              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={pinVisible ? "text" : "password"}
                    inputMode="numeric"
                    placeholder="PIN (4-12 dígitos)"
                    value={pin}
                    onChange={(e) => {
                      // only digits
                      const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                      setPin(v);
                      if (error) setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGerente();
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
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

              <div className="mt-4 flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setShowPin(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" className="flex-1" onClick={handleGerente} loading={loading}>
                  {loading ? "Verificando..." : "Ingresar"}
                </Button>
              </div>

              <div className="mt-4 rounded-xl bg-surface-800 px-3 py-2.5">
                <p className="text-xs leading-relaxed text-zinc-500">
                  ¿Olvidaste el PIN? Solo el gerente puede cambiarlo desde Configuración con el PIN actual.
                </p>
              </div>

              <div className="mt-4 flex justify-center">
                <button onClick={handleDependiente} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                  <LogOut size={12} />
                  Entrar como dependiente en su lugar
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
