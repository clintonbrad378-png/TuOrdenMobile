import { useState } from "react";
import { ShieldCheck, ShoppingCart, Lock, Eye, EyeOff, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button, Card, Input } from "./ui";

export default function RoleGate({ children }: { children: React.ReactNode }) {
  const { role, loginGerente, loginDependiente } = useAuth();
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          {!showPin ? (
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
                      Ingresar PIN de gerente
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
                Podrás cambiar de modo en cualquier momento desde el menú. El PIN por defecto es <span className="font-mono text-zinc-500">1234</span> (cámbialo en Configuración).
              </p>
            </div>
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
                  ¿Olvidaste el PIN? Puedes restablecerlo desde la base de datos o reinstalando la app (por defecto: 1234).
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
