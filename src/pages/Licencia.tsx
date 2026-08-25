import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  Copy,
  Database,
  Edit,
  Loader2,
  Settings,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { LicenseKey, LicenseVerify } from "../lib/types";
import { errMsg } from "../lib/format";
import { Button, Card, Input, PageHeader, useToast } from "../components/ui";

export default function Licencia() {
  const [license, setLicense] = useState<LicenseKey | null>(null);
  const [verifyResult, setVerifyResult] = useState<LicenseVerify | null>(null);
  const [signInput, setSignInput] = useState<string>("");
  const [msgInput, setMsgInput] = useState<string>("");
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingVerify, setLoadingVerify] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const data = await api.licenseStatus();
      setLicense(data);
    } catch {
      // Sin licencia generada todavía
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setLoadingGenerate(true);
    try {
      const result = await api.licenseGenerate(365);
      setLicense(result);
      toast("success", "Licencia generada y guardada localmente");
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoadingGenerate(false);
    }
  };

  const handleSign = async () => {
    if (!msgInput.trim()) {
      toast("error", "Escribe un mensaje para firmar");
      return;
    }
    try {
      setSignInput(await api.licenseSign(msgInput));
      toast("success", "Mensaje firmado con la clave local");
    } catch (e) {
      toast("error", errMsg(e));
    }
  };

  const handleVerify = async () => {
    if (!signInput.trim() || !msgInput.trim()) {
      toast("error", "Ingrese ambos la firma y el mensaje");
      return;
    }
    setLoadingVerify(true);
    try {
      const result = await api.licenseVerify(signInput, msgInput);
      setVerifyResult(result);
      if (result.valid) {
        toast("success", "Licencia válida");
      } else {
        toast("error", result.message);
      }
    } catch (e) {
      toast("error", errMsg(e));
    } finally {
      setLoadingVerify(false);
    }
  };

  const copyPublicKey = async () => {
    if (!license?.public_key) return;
    try {
      await navigator.clipboard.writeText(license.public_key);
      toast("info", "Clave pública copiada al portapapeles");
    } catch {
      toast("error", "No se pudo copiar la clave pública");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-8 sm:py-8">
        <PageHeader
          title="Licencia del Software"
          subtitle="Sistema de licencias local con codificación ed25519"
        />

        {/* Generate License Section */}
        <Card className="p-6 mb-8">
          <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-200 mb-4">
            <Settings size={16} className="text-accent-400" /> Generar Licencia
          </h2>

          <div className="grid gap-4">
            <Button variant="primary" onClick={handleGenerate} loading={loadingGenerate}>
              <Loader2 size={14} />
              {loadingGenerate ? "Generando..." : "Generar licencia"}
            </Button>
          </div>

          {license && (
            <div className="mt-6 p-5 bg-surface-900 rounded-lg">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">Clave Pública</h3>
              <div className="flex flex-col gap-2">
                <Input
                  value={license.public_key}
                  readOnly
                  className="flex-1 rounded-xl border border-white/[0.06] bg-surface-800 px-4 py-3 text-sm font-mono overflow-x-auto"
                />
                <Button variant="ghost" size="sm" onClick={copyPublicKey}>
                  <Copy size={12} /> Copiar
                </Button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
                {license.expires_at !== null
                  ? `Expira: ${new Date(Number(license.expires_at) * 1000).toLocaleDateString()}`
                  : "Ilimitado"}
              </div>
            </div>
          )}
        </Card>

        {/* Verify License Section */}
        <Card className="p-6 mb-8">
          <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-200 mb-4">
            <Edit size={16} className="text-accent-400" /> Verificar Licencia
          </h2>

          <div className="grid gap-4">
            <Input
              placeholder="Firma (base64)"
              value={signInput}
              onChange={(e) => setSignInput(e.target.value)}
            />
            <Input
              placeholder="Mensaje a verificar"
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
            />
            <Button variant="outline" onClick={handleSign}>
              Firmar mensaje
            </Button>
            <Button variant="primary" onClick={handleVerify} loading={loadingVerify}>
              {loadingVerify ? "Verificando..." : "Verificar"}
            </Button>
          </div>

          {verifyResult && (
            <div className="mt-6 p-5 rounded-lg">
              <div className="flex items-center gap-2">
                {verifyResult.valid ? (
                  <CheckCircle size={14} className="text-green-400" />
                ) : (
                  <X size={14} className="text-red-400" />
                )}
                <span>{verifyResult.message}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Information */}
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-medium text-zinc-200 mb-4">
            <Database size={16} className="text-accent-400" /> Información
          </h2>
          <div className="space-y-2 text-sm text-zinc-400">
            <p>
              El sistema utiliza firma digital ed25519 para asegurar la integridad
              de las licencias generadas localmente. La clave pública se almacena
              en el archivo de licencia y los mensajes se verifican contra ella.
            </p>
            <p>
              Los archivos de licencia se guardan en el directorio de datos de la
              aplicación y pueden ser copiados o transferidos entre instalaciones.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}