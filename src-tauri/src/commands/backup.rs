use crate::models::DbInfo;
use crate::{db, AppState};
use rusqlite::{Connection, OpenFlags};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn backup_database(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta destino: {e}"))?;
    }

    let mut dst = Connection::open(&path).map_err(|e| format!("No se pudo crear el respaldo: {e}"))?;
    {
        let backup = rusqlite::backup::Backup::new(&conn, &mut dst)
            .map_err(|e| format!("No se pudo iniciar el respaldo: {e}"))?;
        backup
            .run_to_completion(64, Duration::from_millis(5), None)
            .map_err(|e| format!("Error durante el respaldo: {e}"))?;
    }
    drop(dst);

    Ok(path)
}

#[tauri::command]
pub async fn restore_database(
    state: State<'_, AppState>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    // Validate the file is a TuOrden database before touching the live one.
    {
        let chk = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "No se pudo abrir el archivo seleccionado")?;
        let tables: i64 = chk
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                 AND name IN ('materials','products','recipe_items','sales','sale_items','stock_movements')",
                [],
                |r| r.get(0),
            )
            .map_err(|_| "El archivo no es un respaldo válido de TuOrden".to_string())?;
        if tables < 6 {
            return Err("El archivo no es un respaldo válido de TuOrden".into());
        }
    }

    let mut guard = state.db.lock().map_err(|_| "Error interno")?;
    let db_path = guard
        .path()
        .filter(|p| !p.is_empty())
        .ok_or("No se encontró la ruta de la base de datos")?
        .to_string();

    // Close current connection cleanly, copy the backup over it, reopen.
    let old_conn =
        std::mem::replace(&mut *guard, Connection::open_in_memory().map_err(|e| e.to_string())?);
    old_conn.close().map_err(|(_, e)| e.to_string())?;

    std::fs::copy(&path, &db_path).map_err(|e| format!("No se pudo restaurar la copia: {e}"))?;

    *guard = db::init_db(std::path::Path::new(&db_path)).map_err(|e| e.to_string())?;

    let _ = app.emit("db-restored", ());
    Ok(())
}

#[tauri::command]
pub async fn db_info(state: State<'_, AppState>) -> Result<DbInfo, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let path = conn.path().unwrap_or_default().to_string();

    let size_bytes = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(0);

    let count = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0))
            .map_err(|e| e.to_string())
    };

    Ok(DbInfo {
        path,
        size_bytes,
        materials: count("SELECT COUNT(*) FROM materials")?,
        products: count("SELECT COUNT(*) FROM products")?,
        sales: count("SELECT COUNT(*) FROM sales")?,
    })
}
