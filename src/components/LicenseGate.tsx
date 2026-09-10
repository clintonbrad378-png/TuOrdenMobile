import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ShieldAlert, RefreshCw, KeyRound, QrCode } from "lucide-react";
import { api } from "../lib/api";
import type { LicenseCheck } from "../lib/types";
import { Button, Card, Spinner } from "./ui";

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [check, setCheck] = useState<LicenseCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const doCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const result = await api.licenseCheck();
      setCheck(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));
      setCheck(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    doCheck();
  }, [doCheck]);

  const handleGenerateDemo = async () => {
    setGenerating(true);
    try {
      await api.licenseGenerate(7);
      await doCheck();
    } catch (e) {
      setError(e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e));
    } finally {
      setGenerating(false);
    }
  };

  if (checking) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-zinc-500">Verificando licencia...</p>
        </div>
      </div>
    );
  }

  // If valid -> allow app
  if (check?.valid && !check.needsActivation) {
    return <>{children}</>;
  }

  // Blocked: show QR activation screen
  const publicKey = check?.publicKey ?? null;
  const expiresAt = check?.expiresAt ?? null;
  const message = check?.message ?? error ?? "Licencia no válida";

  // QR payload
  let qrValue: string;
  if (publicKey) {
    const exp = expiresAt ? new Date(Number(expiresAt) * 1000).toLocaleDateString() : "sin vencimiento";
    qrValue = `TUORDEN|PK:${publicKey}|EXP:${exp}|ACTIVAR`;
  } else {
    qrValue = `TUORDEN-SIN-LICENCIA|SOLICITAR-ACTIVACION|${new Date().toISOString()}`;
  }

  const isExpired = message.toLowerCase().includes("expir");

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-surface-950">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20">
              <ShieldAlert size={28} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-50">
              {isExpired ? "Licencia expirada" : "Licencia requerida"}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              {message}
            </p>
            {isExpired && publicKey && expiresAt && (
              <p className="mt-1 text-xs text-zinc-600">
                Expiró el {new Date(Number(expiresAt) * 1000).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* QR Card */}
          <Card className="p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <QrCode size={16} className="text-accent-400" />
              Código de activación
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Muestra este QR al administrador para activar tu licencia. Contiene la clave pública del dispositivo.
            </p>

            <div className="mt-5 flex flex-col items-center">
              <div className="rounded-2xl bg-white p-4 shadow-xl">
                <QRCodeSVG
                  value={qrValue}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <p className="mt-3 max-w-[280px] break-all text-center font-mono text-[10px] leading-relaxed text-zinc-600">
                {qrValue}
              </p>
              {publicKey && (
                <div className="mt-4 w-full rounded-xl border border-white/[0.06] bg-surface-800 px-3 py-2.5">
                  <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Clave pública</p>
                  <p className="mt-1 break-all font-mono text-xs text-zinc-300">{publicKey}</p>
                  {expiresAt && (
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Expira: {new Date(Number(expiresAt) * 1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-2">
              <Button variant="primary" onClick={doCheck}>
                <RefreshCw size={16} />
                Verificar de nuevo
              </Button>
              <Button variant="outline" onClick={handleGenerateDemo} loading={generating}>
                <KeyRound size={16} />
                {generating ? "Generando..." : "Generar licencia demo (7 días)"}
              </Button>
              {error && !check && (
                <p className="pt-1 text-center text-xs text-red-400">{error}</p>
              )}
            </div>

            <div className="mt-5 rounded-xl bg-amber-500/10 px-3 py-3 ring-1 ring-amber-500/15">
              <p className="text-xs leading-relaxed text-amber-200/80">
                <strong className="font-semibold text-amber-300">¿Cómo activar?</strong> Contacta al proveedor con este QR o genera una licencia demo para pruebas locales. La licencia se guarda en el dispositivo y habilita todas las funciones.
              </p>
            </div>
          </Card>

          <p className="mt-4 text-center text-[11px] text-zinc-600">
            TuOrden POS · Licencia local ed25519 · Si ya activaste, pulsa Verificar de nuevo
          </p>
        </div>
      </div>
    </div>
  );
}
