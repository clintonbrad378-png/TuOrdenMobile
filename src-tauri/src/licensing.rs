use crate::AppState;
use base64::{prelude::BASE64_STANDARD, Engine as _};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

const LICENSE_FILE: &str = "license.lic";

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

fn now_secs() -> Result<u64, String> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "Error de reloj del sistema".to_string())?
        .as_secs())
}

#[tauri::command]
pub async fn license_generate(
    state: State<'_, AppState>,
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
    let path = license_path(&state)?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(LicenseKey {
        public_key: file.public_key,
        expires_at,
    })
}

#[tauri::command]
pub async fn license_status(state: State<'_, AppState>) -> Result<LicenseKey, String> {
    let file = read_license_file(&state)?;
    Ok(LicenseKey {
        public_key: file.public_key,
        expires_at: file.expires_at,
    })
}

#[tauri::command]
pub async fn license_sign(state: State<'_, AppState>, message: String) -> Result<String, String> {
    let file = read_license_file(&state)?;

    let raw = BASE64_STANDARD
        .decode(&file.secret_key)
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
