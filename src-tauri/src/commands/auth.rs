use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

#[tauri::command]
pub async fn manager_pin_exists(state: State<'_, AppState>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'manager_pin'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(val.is_some() && !val.unwrap_or_default().trim().is_empty())
}

#[tauri::command]
pub async fn verify_manager_pin(state: State<'_, AppState>, pin: String) -> Result<bool, String> {
    let pin = pin.trim().to_string();
    if pin.is_empty() {
        return Ok(false);
    }
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'manager_pin'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match stored {
        Some(s) => Ok(s == pin),
        // Sin PIN configurado no hay acceso por defecto: el gerente debe crearlo.
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn set_manager_pin(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    let pin = pin.trim().to_string();
    if pin.len() < 4 {
        return Err("El PIN debe tener al menos 4 dígitos".into());
    }
    if pin.len() > 12 {
        return Err("El PIN no puede tener más de 12 dígitos".into());
    }
    if !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("El PIN solo puede contener números".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    conn.execute(
        "INSERT INTO app_config (key, value) VALUES ('manager_pin', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![pin],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_manager_pin_hint(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'manager_pin'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(p) = stored {
        if p.len() <= 2 {
            return Ok("**".to_string());
        }
        let masked = format!("{}{}{}", &p[0..1], "*".repeat(p.len() - 2), &p[p.len() - 1..]);
        Ok(masked)
    } else {
        Ok(String::new())
    }
}
