use crate::AppState;
use ed25519::Keypair;
use ed25519::Signature;
use ed25519::VerifyingKey;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::State;
use base64::{Engine as _, prelude::BASE64_STANDARD};

const LICENSE_FILE: &str = "license.lic";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicenseKey {
    pub public_key: String,
    pub expires_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LicenseVerify {
    pub valid: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LicenseGenerate {
    pub expires_days: Option<u64>,
}

fn load_db_path(state: &State<'_, AppState>) -> Result<std::path::PathBuf, String> {
    let db_guard = state.db.lock().map_err(|_| "Error locking DB")?;
    let path = db_guard.path().to_path_buf();
    Ok(path)
}

#[tauri::command]
pub async fn license_generate(state: State<'_, AppState>, expires_days: Option<u64>) -> Result<LicenseKey, String> {
    let mut rng = rand::thread_rng();
    let keypair = Keypair::generate(&mut rng);
    let public_key_bytes = keypair.public_key().to_bytes();
    let public_key_b64 = BASE64_STANDARD.encode(public_key_bytes);

    let expires_at = expires_days.map(|d| {
        let now = std::time::SystemTime::now();
        let expiry = now + std::time::Duration::from_secs(d as u64 * 24 * 60 * 60);
        expiry
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default()
    });

    let license = LicenseKey {
        public_key: public_key_b64,
        expires_at,
    };

    let db_path = load_db_path(&state)?;
    let license_path = db_path.join(LICENSE_FILE);
    let license_json = serde_json::to_string(&license).map_err(|e| e.to_string())?;
    std::fs::write(&license_path, license_json).map_err(|e| e.to_string())?;

    Ok(license)
}

#[tauri::command]
pub async fn license_verify(state: State<'_, AppState>, signature_b64: String, message: String) -> Result<LicenseVerify, String> {
    let db_path = load_db_path(&state)?;
    let license_path = db_path.join(LICENSE_FILE);

    if !license_path.exists() {
        return Ok(LicenseVerify {
            valid: false,
            message: "No hay licencia registrada".into(),
        });
    }

    let license_json = std::fs::read_to_string(&license_path).map_err(|e| e.to_string())?;
    let license: LicenseKey = serde_json::from_str(&license_json).map_err(|e| e.to_string())?;

    let public_key_bytes = BASE64_STANDARD.decode(&license.public_key).map_err(|e| format!("Error decodificando clave pública: {}", e))?;
    let verifying_key = VerifyingKey::from_bytes(&public_key_bytes)
        .map_err(|e| format!("Clave pública inválida: {}", e))?;

    let signature_bytes = BASE64_STANDARD.decode(&signature_b64).map_err(|e| format!("Error decodificando firma: {}", e))?;
    let signature = Signature::from_slice(&signature_bytes).map_err(|e| format!("Error en firma: {}", e))?;

    let is_valid = verifying_key.verify(message.as_bytes(), &signature).is_ok();

    if is_valid {
        Ok(LicenseVerify {
            valid: true,
            message: "Licencia válida".into(),
        })
    } else {
        Ok(LicenseVerify {
            valid: false,
            message: "Firma inválida".into(),
        })
    }
}