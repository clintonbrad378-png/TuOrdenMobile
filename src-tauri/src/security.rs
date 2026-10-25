use bcrypt::{hash, verify, DEFAULT_COST};

/// Guarda el PIN como hash bcrypt con sal aleatoria. Nunca se persiste en claro.
pub fn hash_pin(pin: &str) -> Result<String, String> {
    let pin = pin.trim();
    if pin.is_empty() {
        return Err("El PIN no puede estar vacío".into());
    }
    hash(pin, DEFAULT_COST).map_err(|e| format!("No se pudo proteger el PIN: {e}"))
}

pub fn verify_pin(pin: &str, pin_hash: &str) -> bool {
    verify(pin.trim(), pin_hash).unwrap_or(false)
}
