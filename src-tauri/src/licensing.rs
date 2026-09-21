use crate::AppState;
use base64::{prelude::BASE64_STANDARD, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

const LICENSE_FILE: &str = "license.lic";
/// Marca de demo consumida. Vive en un archivo aparte de `license.lic` y de la
/// BD para que ni borrar la licencia ni restaurar un respaldo la reinicien.
/// Solo se puede pedir una demo por dispositivo (limitación local: reinstalar
/// la app desde cero la pierde, eso se acepta).
const DEMO_FILE: &str = "demo_history.json";
const DEMO_DAYS: u64 = 7;

#[derive(Serialize)]
pub struct LicenseKey {
    pub public_key: String,
    pub expires_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LicenseVerify {
    pub valid: bool,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseCheck {
    pub valid: bool,
    pub message: String,
    pub public_key: Option<String>,
    pub expires_at: Option<String>,
    pub needs_activation: bool,
    pub demo_available: bool,
}

#[derive(Serialize, Deserialize)]
struct LicenseFile {
    public_key: String,
    secret_key: String,
    expires_at: Option<String>,
    created_at: u64,
}

fn license_path(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let guard = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let db_path = guard
        .path()
        .ok_or_else(|| "Ruta de datos no disponible".to_string())?;
    let dir = std::path::Path::new(db_path)
        .parent()
        .ok_or_else(|| "Ruta inválida".to_string())?;
    Ok(dir.join(LICENSE_FILE))
}

fn read_license_file(state: &State<'_, AppState>) -> Result<LicenseFile, String> {
    let path = license_path(state)?;
    if !path.exists() {
        return Err("No hay licencia generada".into());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| format!("Archivo de licencia corrupto: {e}"))
}

#[derive(Serialize, Deserialize)]
struct DemoMarker {
    consumed: bool,
    first_generated_at: u64,
}

fn demo_path(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let lic = license_path(state)?;
    let dir = lic
        .parent()
        .ok_or_else(|| "Ruta inválida".to_string())?;
    Ok(dir.join(DEMO_FILE))
}

/// ¿Ya se consumió la demo en este dispositivo?
fn demo_consumed(state: &State<'_, AppState>) -> bool {
    let path = match demo_path(state) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !path.exists() {
        return false;
    }
    match std::fs::read_to_string(&path) {
        Ok(json) => serde_json::from_str::<DemoMarker>(&json)
            .map(|m| m.consumed)
            .unwrap_or(false),
        Err(_) => false,
    }
}

fn mark_demo_consumed(state: &State<'_, AppState>) -> Result<(), String> {
    let marker = DemoMarker {
        consumed: true,
        first_generated_at: now_secs()?,
    };
    let json = serde_json::to_string_pretty(&marker).map_err(|e| e.to_string())?;
    let path = demo_path(state)?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn now_secs() -> Result<u64, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "Error de reloj del sistema".to_string())?
        .as_secs())
}

fn write_new_license(
    state: &State<'_, AppState>,
    expires_days: Option<u64>,
) -> Result<LicenseKey, String> {
    let mut seed = [0u8; 32];
    OsRng.fill_bytes(&mut seed);
    let signing = SigningKey::from_bytes(&seed);

    let created_at = now_secs()?;
    let expires_at = expires_days.map(|d| (created_at + d * 86_400).to_string());

    let file = LicenseFile {
        public_key: BASE64_STANDARD.encode(signing.verifying_key().as_bytes()),
        secret_key: BASE64_STANDARD.encode(seed),
        expires_at: expires_at.clone(),
        created_at,
    };

    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = license_path(state)?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(LicenseKey {
        public_key: file.public_key,
        expires_at,
    })
}

#[tauri::command]
pub async fn license_generate(
    state: State<'_, AppState>,
    expires_days: Option<u64>,
) -> Result<LicenseKey, String> {
    write_new_license(&state, expires_days)
}

/// Genera la licencia demo (7 días). Solo una vez por dispositivo: si ya se
/// consumió, devuelve error y no toca la licencia vigente.
#[tauri::command]
pub async fn license_generate_demo(state: State<'_, AppState>) -> Result<LicenseKey, String> {
    if demo_consumed(&state) {
        return Err(
            "La licencia demo ya fue utilizada en este dispositivo. Contacta al proveedor para activar tu licencia."
                .into(),
        );
    }
    // Respaldo por si falla el marcado (no dejar al usuario sin su licencia).
    let previous_license = license_path(&state)
        .ok()
        .and_then(|p| std::fs::read(p).ok());
    let key = write_new_license(&state, Some(DEMO_DAYS))?;
    // Si no se puede dejar constancia, se restaura la licencia previa (o se
    // elimina la recién creada si no había) para no regalar demos.
    if let Err(e) = mark_demo_consumed(&state) {
        if let Some(prev) = previous_license {
            let _ = std::fs::write(license_path(&state)?, prev);
        } else if let Ok(p) = license_path(&state) {
            let _ = std::fs::remove_file(p);
        }
        return Err(format!("No se pudo registrar la demo: {e}"));
    }
    Ok(key)
}

#[tauri::command]
pub async fn license_status(state: State<'_, AppState>) -> Result<LicenseKey, String> {
    let file = read_license_file(&state)?;
    Ok(LicenseKey {
        public_key: file.public_key,
        expires_at: file.expires_at,
    })
}

#[derive(Serialize, Deserialize)]
struct LicenseImport {
    public_key: String,
    secret_key: Option<String>,
    expires_at: Option<String>,
    created_at: Option<u64>,
}

#[tauri::command]
pub async fn license_import(
    state: State<'_, AppState>,
    text: String,
) -> Result<LicenseKey, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Pega el texto de la licencia".into());
    }
    // Acepta JSON directo o base64 del JSON (una sola línea, fácil de copiar).
    let json = if trimmed.starts_with('{') {
        trimmed.to_string()
    } else {
        let raw = BASE64_STANDARD
            .decode(trimmed)
            .map_err(|_| "Código de licencia inválido".to_string())?;
        String::from_utf8(raw).map_err(|_| "Código de licencia inválido".to_string())?
    };
    let imp: LicenseImport =
        serde_json::from_str(&json).map_err(|_| "Código de licencia inválido".to_string())?;

    // Validar clave pública (32 bytes ed25519).
    let pk_raw = BASE64_STANDARD
        .decode(imp.public_key.trim())
        .map_err(|_| "Licencia inválida: clave pública incorrecta".to_string())?;
    let pk_bytes: [u8; 32] = pk_raw
        .try_into()
        .map_err(|_| "Licencia inválida: clave pública incorrecta".to_string())?;
    VerifyingKey::from_bytes(&pk_bytes)
        .map_err(|_| "Licencia inválida: clave pública incorrecta".to_string())?;

    let secret_key = imp.secret_key.unwrap_or_default();
    if !secret_key.trim().is_empty() {
        let sk_raw = BASE64_STANDARD
            .decode(secret_key.trim())
            .map_err(|_| "Licencia inválida: clave secreta incorrecta".to_string())?;
        if sk_raw.len() != 32 {
            return Err("Licencia inválida: clave secreta incorrecta".into());
        }
    }

    let created_at = imp.created_at.unwrap_or(now_secs()?);
    if let Some(exp) = &imp.expires_at {
        let exp_u64: u64 = exp
            .parse()
            .map_err(|_| "Licencia inválida: vencimiento incorrecto".to_string())?;
        if now_secs()? > exp_u64 {
            return Err("Esta licencia ya está vencida".into());
        }
    }

    let file = LicenseFile {
        public_key: imp.public_key.trim().to_string(),
        secret_key: secret_key.trim().to_string(),
        expires_at: imp.expires_at,
        created_at,
    };
    let out = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    let path = license_path(&state)?;
    std::fs::write(&path, out).map_err(|e| e.to_string())?;

    Ok(LicenseKey {
        public_key: file.public_key,
        expires_at: file.expires_at,
    })
}

#[tauri::command]
pub async fn license_sign(state: State<'_, AppState>, message: String) -> Result<String, String> {
    let file = read_license_file(&state)?;

    if file.secret_key.trim().is_empty() {
        return Err("Esta licencia es solo de activación y no permite firmar".into());
    }
    let raw = BASE64_STANDARD
        .decode(file.secret_key.trim())
        .map_err(|e| format!("Clave inválida: {e}"))?;
    let seed: [u8; 32] = raw
        .try_into()
        .map_err(|_| "Clave con longitud incorrecta".to_string())?;
    let signing = SigningKey::from_bytes(&seed);

    let signature = signing.sign(message.as_bytes());
    Ok(BASE64_STANDARD.encode(signature.to_bytes()))
}

#[tauri::command]
pub async fn license_verify(
    state: State<'_, AppState>,
    signature_b64: String,
    message: String,
) -> Result<LicenseVerify, String> {
    let file = read_license_file(&state)?;

    // Expiry check.
    if let Some(exp) = &file.expires_at {
        let exp: u64 = exp.parse().map_err(|_| "Fecha de expiración inválida".to_string())?;
        if now_secs()? > exp {
            return Ok(LicenseVerify {
                valid: false,
                message: "La licencia ha expirado".into(),
            });
        }
    }

    // Public key.
    let pk_raw = BASE64_STANDARD
        .decode(&file.public_key)
        .map_err(|e| format!("Clave pública inválida: {e}"))?;
    let pk_bytes: [u8; 32] = pk_raw
        .try_into()
        .map_err(|_| "Clave pública con longitud incorrecta".to_string())?;
    let verifying_key = VerifyingKey::from_bytes(&pk_bytes)
        .map_err(|e| format!("Clave pública inválida: {e}"))?;

    // Signature.
    let sig_raw = BASE64_STANDARD
        .decode(&signature_b64)
        .map_err(|e| format!("Firma inválida: {e}"))?;
    let sig_bytes: [u8; 64] = sig_raw
        .try_into()
        .map_err(|_| "La firma debe tener 64 bytes".to_string())?;
    let signature =
        Signature::from_slice(&sig_bytes).map_err(|e| format!("Firma inválida: {e}"))?;

    match verifying_key.verify(message.as_bytes(), &signature) {
        Ok(()) => Ok(LicenseVerify {
            valid: true,
            message: "Licencia válida".into(),
        }),
        Err(_) => Ok(LicenseVerify {
            valid: false,
            message: "Firma inválida o mensaje alterado".into(),
        }),
    }
}

#[tauri::command]
pub async fn license_check(state: State<'_, AppState>) -> Result<LicenseCheck, String> {
    let path = license_path(&state)?;
    // Dispositivos actualizados que ya tenían licencia: se considera la demo
    // consumida aunque no exista el marcador (evita una demo extra).
    if path.exists() && !demo_consumed(&state) {
        let _ = mark_demo_consumed(&state);
    }
    let demo_available = !demo_consumed(&state);
    if !path.exists() {
        return Ok(LicenseCheck {
            valid: false,
            message: "No hay licencia activa. Solicite activación.".into(),
            public_key: None,
            expires_at: None,
            needs_activation: true,
            demo_available,
        });
    }

    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let file: LicenseFile =
        serde_json::from_str(&json).map_err(|e| format!("Archivo de licencia corrupto: {e}"))?;

    if let Some(exp) = &file.expires_at {
        let exp_u64: u64 = exp
            .parse()
            .map_err(|_| "Fecha de expiración inválida".to_string())?;
        if now_secs()? > exp_u64 {
            return Ok(LicenseCheck {
                valid: false,
                message: "La licencia ha expirado".into(),
                public_key: Some(file.public_key),
                expires_at: file.expires_at,
                needs_activation: true,
                demo_available,
            });
        }
    }

    Ok(LicenseCheck {
        valid: true,
        message: "Licencia válida".into(),
        public_key: Some(file.public_key),
        expires_at: file.expires_at,
        needs_activation: false,
        demo_available,
    })
}
