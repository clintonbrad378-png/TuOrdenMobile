use crate::models::{
    AuthStatus, CreateUserInput, LoginUser, UpdateUserInput, User,
};
use crate::security;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const ALL_SECTIONS: &[&str] = &[
    "dashboard",
    "venta",
    "historial",
    "menu",
    "produccion",
    "materiales",
    "entradas",
    "mermas",
    "gastos",
    "reportes",
    "sincronizacion",
    "configuracion",
    "licencia",
];

const ASSIGNABLE_SECTIONS: &[&str] = &[
    "dashboard",
    "venta",
    "historial",
    "menu",
    "produccion",
    "materiales",
    "entradas",
    "mermas",
    "gastos",
    "reportes",
    "sincronizacion",
];

const ACCESS_LEVELS: &[&str] = &["dependiente", "inventario", "finanzas", "personalizado"];

struct UserRow {
    id: i64,
    name: String,
    role: String,
    access_level: String,
    active: bool,
    is_owner: bool,
    has_pin: bool,
    last_login_at: Option<String>,
    created_at: String,
    updated_at: String,
}

fn validate_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("El nombre no puede estar vacío".into());
    }
    if name.chars().count() > 60 {
        return Err("El nombre no puede tener más de 60 caracteres".into());
    }
    Ok(name.to_string())
}

fn validate_pin(pin: &str) -> Result<(), String> {
    let pin = pin.trim();
    if pin.len() < 4 || pin.len() > 12 {
        return Err("El PIN debe tener entre 4 y 12 dígitos".into());
    }
    if !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("El PIN solo puede contener números".into());
    }
    Ok(())
}

fn validate_access_level(level: &str) -> Result<String, String> {
    let level = level.trim().to_lowercase();
    if !ACCESS_LEVELS.contains(&level.as_str()) {
        return Err("Nivel de acceso no válido".into());
    }
    Ok(level)
}

fn sanitize_permissions(permissions: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for raw in permissions {
        let section = raw.trim().to_lowercase();
        if !ASSIGNABLE_SECTIONS.contains(&section.as_str()) {
            return Err(format!("Sección no válida: {section}"));
        }
        if !out.contains(&section) {
            out.push(section);
        }
    }
    if out.is_empty() {
        return Err("Selecciona al menos una sección para este usuario".into());
    }
    out.sort_by_key(|section| {
        ASSIGNABLE_SECTIONS
            .iter()
            .position(|candidate| candidate == section)
            .unwrap_or(usize::MAX)
    });
    Ok(out)
}

fn load_permissions(conn: &Connection, user_id: i64) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT section FROM user_permissions WHERE user_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut permissions = Vec::new();
    for row in rows {
        let section = row.map_err(|e| e.to_string())?;
        if ASSIGNABLE_SECTIONS.contains(&section.as_str()) {
            permissions.push(section);
        }
    }
    permissions.sort_by_key(|section| {
        ASSIGNABLE_SECTIONS
            .iter()
            .position(|candidate| candidate == section)
            .unwrap_or(usize::MAX)
    });
    Ok(permissions)
}

fn load_user(conn: &Connection, user_id: i64) -> Result<User, String> {
    let row = conn
        .query_row(
            "SELECT id, name, role, access_level, active, is_owner,
                    CASE WHEN pin_hash IS NULL OR pin_hash = '' THEN 0 ELSE 1 END,
                    last_login_at, created_at, updated_at
             FROM users WHERE id = ?1",
            params![user_id],
            |r| {
                Ok(UserRow {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    role: r.get(2)?,
                    access_level: r.get(3)?,
                    active: r.get::<_, i64>(4)? != 0,
                    is_owner: r.get::<_, i64>(5)? != 0,
                    has_pin: r.get::<_, i64>(6)? != 0,
                    last_login_at: r.get(7)?,
                    created_at: r.get(8)?,
                    updated_at: r.get(9)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Usuario no encontrado".to_string())?;

    let permissions = if row.is_owner {
        ALL_SECTIONS.iter().map(|s| s.to_string()).collect()
    } else {
        load_permissions(conn, user_id)?
    };

    Ok(User {
        id: row.id,
        name: row.name,
        role: row.role,
        access_level: row.access_level,
        active: row.active,
        is_owner: row.is_owner,
        has_pin: row.has_pin,
        permissions,
        last_login_at: row.last_login_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn require_owner(conn: &Connection, actor_id: i64) -> Result<(), String> {
    let found: Option<i64> = conn
        .query_row(
            "SELECT id FROM users WHERE id = ?1 AND is_owner = 1 AND active = 1",
            params![actor_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if found.is_none() {
        return Err("Solo el gerente puede administrar usuarios".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let owner: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, pin_hash FROM users WHERE is_owner = 1 LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (owner_exists, owner_has_pin) = match owner {
        Some((_, hash)) => (
            true,
            hash.map(|h| !h.trim().is_empty()).unwrap_or(false),
        ),
        None => (false, false),
    };
    Ok(AuthStatus {
        owner_exists,
        owner_has_pin,
    })
}

#[tauri::command]
pub async fn list_login_users(state: State<'_, AppState>) -> Result<Vec<LoginUser>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, role, access_level, is_owner,
                    CASE WHEN pin_hash IS NULL OR pin_hash = '' THEN 0 ELSE 1 END
             FROM users WHERE active = 1
             ORDER BY is_owner DESC, name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(LoginUser {
                id: r.get(0)?,
                name: r.get(1)?,
                role: r.get(2)?,
                access_level: r.get(3)?,
                is_owner: r.get::<_, i64>(4)? != 0,
                has_pin: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn login_user(
    state: State<'_, AppState>,
    user_id: i64,
    pin: Option<String>,
) -> Result<User, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let row: Option<(bool, bool, Option<String>)> = conn
        .query_row(
            "SELECT active, is_owner, pin_hash FROM users WHERE id = ?1",
            params![user_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)? != 0,
                    r.get::<_, i64>(1)? != 0,
                    r.get(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (active, is_owner, stored_hash) = row.ok_or_else(|| "Usuario no encontrado".to_string())?;
    if !active {
        return Err("Este usuario está desactivado".into());
    }

    let stored_hash = stored_hash.filter(|h| !h.trim().is_empty());
    if let Some(hash) = stored_hash.as_deref() {
        let pin = pin.unwrap_or_default();
        if pin.trim().is_empty() {
            return Err("Ingresa el PIN".into());
        }
        if !security::verify_pin(&pin, hash) {
            return Err("PIN incorrecto".into());
        }
    } else if is_owner {
        return Err("El gerente todavía no tiene un PIN configurado".into());
    }

    conn.execute(
        "UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?1",
        params![user_id],
    )
    .map_err(|e| e.to_string())?;

    load_user(&conn, user_id)
}

#[tauri::command]
pub async fn get_session_user(state: State<'_, AppState>, user_id: i64) -> Result<User, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let active: Option<bool> = conn
        .query_row(
            "SELECT active FROM users WHERE id = ?1",
            params![user_id],
            |r| Ok(r.get::<_, i64>(0)? != 0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match active {
        Some(true) => load_user(&conn, user_id),
        _ => Err("La sesión ya no está disponible".into()),
    }
}

#[tauri::command]
pub async fn set_owner_pin(
    state: State<'_, AppState>,
    pin: String,
    current_pin: Option<String>,
) -> Result<(), String> {
    validate_pin(&pin)?;
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let owner: Option<(i64, Option<String>)> = conn
        .query_row(
            "SELECT id, pin_hash FROM users WHERE is_owner = 1 LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (owner_id, stored_hash) = owner.ok_or_else(|| "No se encontró el usuario gerente".to_string())?;

    if let Some(hash) = stored_hash.filter(|h| !h.trim().is_empty()) {
        let current = current_pin.unwrap_or_default();
        if current.trim().is_empty() {
            return Err("Ingresa el PIN actual".into());
        }
        if !security::verify_pin(&current, &hash) {
            return Err("PIN actual incorrecto".into());
        }
    }

    let new_hash = security::hash_pin(&pin)?;
    conn.execute(
        "UPDATE users SET pin_hash = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![new_hash, owner_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_users(state: State<'_, AppState>, actor_id: i64) -> Result<Vec<User>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    require_owner(&conn, actor_id)?;
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM users ORDER BY is_owner DESC, name COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    ids.into_iter().map(|id| load_user(&conn, id)).collect()
}

#[tauri::command]
pub async fn create_user(
    state: State<'_, AppState>,
    actor_id: i64,
    input: CreateUserInput,
) -> Result<User, String> {
    let name = validate_name(&input.name)?;
    let access_level = validate_access_level(&input.access_level)?;
    let permissions = sanitize_permissions(&input.permissions)?;
    let pin_hash = match input.pin.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(pin) => {
            validate_pin(pin)?;
            Some(security::hash_pin(pin)?)
        }
        None => None,
    };

    let mut conn = state.db.lock().map_err(|_| "Error interno")?;
    require_owner(&conn, actor_id)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO users (name, role, access_level, pin_hash, active, is_owner)
         VALUES (?1, 'usuario', ?2, ?3, 1, 0)",
        params![name, access_level, pin_hash],
    )
    .map_err(|e| e.to_string())?;
    let user_id = tx.last_insert_rowid();
    for section in &permissions {
        tx.execute(
            "INSERT INTO user_permissions (user_id, section) VALUES (?1, ?2)",
            params![user_id, section],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    load_user(&conn, user_id)
}

#[tauri::command]
pub async fn update_user(
    state: State<'_, AppState>,
    actor_id: i64,
    id: i64,
    input: UpdateUserInput,
) -> Result<User, String> {
    let name = validate_name(&input.name)?;
    let access_level = validate_access_level(&input.access_level)?;
    let permissions = sanitize_permissions(&input.permissions)?;
    let pin_update = if input.remove_pin {
        Some(None)
    } else {
        match input.pin.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            Some(pin) => {
                validate_pin(pin)?;
                Some(Some(security::hash_pin(pin)?))
            }
            None => None,
        }
    };

    let mut conn = state.db.lock().map_err(|_| "Error interno")?;
    require_owner(&conn, actor_id)?;
    let target_owner: Option<bool> = conn
        .query_row(
            "SELECT is_owner FROM users WHERE id = ?1",
            params![id],
            |r| Ok(r.get::<_, i64>(0)? != 0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match target_owner {
        None => return Err("Usuario no encontrado".into()),
        Some(true) => {
            return Err("El propietario se administra desde la tarjeta PIN de Gerente".into())
        }
        Some(false) => {}
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE users
         SET name = ?1, access_level = ?2, active = ?3, updated_at = datetime('now','localtime')
         WHERE id = ?4",
        params![name, access_level, input.active, id],
    )
    .map_err(|e| e.to_string())?;
    if let Some(pin_hash) = pin_update {
        tx.execute(
            "UPDATE users SET pin_hash = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![pin_hash, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("DELETE FROM user_permissions WHERE user_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for section in &permissions {
        tx.execute(
            "INSERT INTO user_permissions (user_id, section) VALUES (?1, ?2)",
            params![id, section],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    load_user(&conn, id)
}

#[tauri::command]
pub async fn set_user_active(
    state: State<'_, AppState>,
    actor_id: i64,
    id: i64,
    active: bool,
) -> Result<User, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    require_owner(&conn, actor_id)?;
    let target_owner: Option<bool> = conn
        .query_row(
            "SELECT is_owner FROM users WHERE id = ?1",
            params![id],
            |r| Ok(r.get::<_, i64>(0)? != 0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match target_owner {
        None => return Err("Usuario no encontrado".into()),
        Some(true) => return Err("No puedes desactivar al propietario".into()),
        Some(false) => {}
    }
    conn.execute(
        "UPDATE users SET active = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![active, id],
    )
    .map_err(|e| e.to_string())?;
    load_user(&conn, id)
}

#[tauri::command]
pub async fn delete_user(
    state: State<'_, AppState>,
    actor_id: i64,
    id: i64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    require_owner(&conn, actor_id)?;
    let target_owner: Option<bool> = conn
        .query_row(
            "SELECT is_owner FROM users WHERE id = ?1",
            params![id],
            |r| Ok(r.get::<_, i64>(0)? != 0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match target_owner {
        None => return Err("Usuario no encontrado".into()),
        Some(true) => return Err("No puedes eliminar al propietario".into()),
        Some(false) => {}
    }
    conn.execute("DELETE FROM users WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
