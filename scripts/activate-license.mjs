#!/usr/bin/env node
/**
 * Genera el código de activación de licencia para TuOrden POS (proveedor).
 *
 * Compatible con `src-tauri/src/licensing.rs :: license_import`, que acepta:
 *   - JSON directo: {"public_key":"...","secret_key":"","expires_at":"<unix>","created_at":<unix>}
 *   - o base64(JSON) en una sola línea (lo que pega el cliente en la app).
 *
 * Uso:
 *   node scripts/activate-license.mjs --pk <CLAVE_PUBLICA_B64> [--days 365]
 *   node scripts/activate-license.mjs --qr "TUORDEN|PK:<B64>|EXP:...|ACTIVAR" [--days 365]
 *   node scripts/activate-license.mjs --pk <B64> --permanent
 *   node scripts/activate-license.mjs --help
 *
 * Ejemplos:
 *   node scripts/activate-license.mjs --pk "ABC...==" --days 365
 *   node scripts/activate-license.mjs --qr "TUORDEN|PK:ABC...==|EXP:01/01/2026|ACTIVAR" --days 365
 *   npm run license:activate -- --pk "ABC...==" --days 365
 */

function printHelp() {
  console.log(`
TuOrden POS - Generador de licencias (proveedor)

Uso:
  node scripts/activate-license.mjs --pk <BASE64> [--days N | --permanent]
  node scripts/activate-license.mjs --qr "<QR>" [--days N | --permanent]

Opciones:
  --pk <b64>       Clave pública base64 del dispositivo (la muestra la app / QR PK:...).
  --qr "<texto>"   Contenido del QR: TUORDEN|PK:<b64>|EXP:...|ACTIVAR (se extrae PK:).
  --days N         Días de vigencia desde hoy (por defecto 365).
  --permanent      Licencia sin vencimiento (expires_at = null).
  --created <s>    created_at unix manual (por defecto: ahora).
  --json           Además del código, imprime el JSON intermedio.
  --help, -h       Muestra esta ayuda.

Salida:
  Imprime el CÓDIGO base64 de una sola línea para pegar en
  la app (Licencia > Activar licencia / LicenseGate > Tengo un código).
`);
}

function parseArgs(argv) {
  const out = { days: "365", permanent: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--pk") out.pk = argv[++i];
    else if (a.startsWith("--pk=")) out.pk = a.slice(5);
    else if (a === "--qr") out.qr = argv[++i];
    else if (a.startsWith("--qr=")) out.qr = a.slice(5);
    else if (a === "--days") out.days = argv[++i];
    else if (a.startsWith("--days=")) out.days = a.slice(7);
    else if (a === "--permanent") out.permanent = true;
    else if (a === "--created") out.created = argv[++i];
    else if (a.startsWith("--created=")) out.created = a.slice(10);
    else if (a === "--json") out.json = true;
    else {
      console.error(`Argumento desconocido: ${a}\n`);
      printHelp();
      process.exit(1);
    }
  }
  return out;
}

function extractPkFromQr(qr) {
  // Formato app: TUORDEN|PK:<b64>|EXP:<fecha>|ACTIVAR  (LicenseGate.tsx)
  // o fallback: TUORDEN-SIN-LICENCIA|SOLICITAR-ACTIVACION|<iso> (sin pk -> error).
  const m = qr.match(/PK:([^|]+)/);
  if (!m) throw new Error("El QR no contiene 'PK:...'. Pide al cliente su clave pública.");
  return m[1].trim();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let publicKey = (args.pk || "").trim();
  if (args.qr) {
    publicKey = extractPkFromQr(args.qr.trim());
  }
  if (!publicKey) {
    console.error("Error: debes pasar --pk <CLAVE> o --qr \"TUORDEN|PK:...\"\n");
    printHelp();
    process.exit(1);
  }

  // Validar base64 de 32 bytes (ed25519), igual que licensing.rs.
  let raw;
  try {
    raw = Buffer.from(publicKey, "base64");
  } catch {
    console.error("Error: la clave pública no es base64 válido.");
    process.exit(1);
  }
  // Re-encode canónico para detectar caracteres inválidos.
  if (Buffer.from(publicKey, "base64").toString("base64") !== publicKey.replace(/\s+/g, "")) {
    console.error("Error: la clave pública no es base64 estándar válido.");
    process.exit(1);
  }
  if (raw.length !== 32) {
    console.error(`Error: clave pública inválida (debe ser 32 bytes ed25519, trae ${raw.length}).`);
    process.exit(1);
  }

  const now = args.created ? Number(args.created) : Math.floor(Date.now() / 1000);
  if (!Number.isInteger(now) || now <= 0) {
    console.error("Error: --created debe ser un timestamp unix válido.");
    process.exit(1);
  }

  let expires_at = null;
  let label;
  if (args.permanent) {
    expires_at = null;
    label = "permanente (sin vencimiento)";
  } else {
    const days = Number(args.days);
    if (!Number.isInteger(days) || days <= 0) {
      console.error("Error: --days debe ser un entero > 0 (o usa --permanent).");
      process.exit(1);
    }
    expires_at = String(now + days * 86400);
    label = `${days} días (expira ${new Date(Number(expires_at) * 1000).toLocaleDateString()})`;
  }

  // Formato que espera license_import en Rust. secret_key vacío = licencia
  // solo-activación (no permite firmar, solo valida vigencia).
  const payload = {
    public_key: publicKey,
    secret_key: "",
    expires_at,
    created_at: now,
  };
  const json = JSON.stringify(payload);
  const code = Buffer.from(json, "utf8").toString("base64");

  console.log("Licencia generada:", label);
  console.log("Public key:", publicKey);
  if (args.json) {
    console.log("JSON:", json);
  }
  console.log("");
  console.log("--- PEGA ESTE CÓDIGO EN LA APP (una sola línea) ---");
  console.log(code);
  console.log("---------------------------------------------------");
}

try {
  main();
} catch (e) {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exit(1);
}
