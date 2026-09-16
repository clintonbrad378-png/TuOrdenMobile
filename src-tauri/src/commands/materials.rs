use crate::db::fmt_qty;
use crate::models::*;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiveMaterialInput {
    pub material_id: i64,
    pub quantity: f64,
    pub cost_per_unit: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasteMaterialInput {
    pub material_id: i64,
    pub quantity: f64,
    pub reason: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalConsumptionInput {
    pub product_id: i64,
    pub quantity: i64,
}

const MATERIAL_COLS: &str =
    "id, name, unit, stock, min_stock, cost_per_unit, created_at, updated_at";

fn map_material(row: &rusqlite::Row) -> rusqlite::Result<Material> {
    Ok(Material {
        id: row.get(0)?,
        name: row.get(1)?,
        unit: row.get(2)?,
        stock: row.get(3)?,
        min_stock: row.get(4)?,
        cost_per_unit: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn validate(name: &str, unit: &str, min_stock: f64, cost_per_unit: f64) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("El nombre del material es obligatorio".into());
    }
    if unit.trim().is_empty() {
        return Err("La unidad es obligatoria".into());
    }
    if min_stock < 0.0 {
        return Err("El stock mínimo no puede ser negativo".into());
    }
    if cost_per_unit < 0.0 {
        return Err("El costo por unidad no puede ser negativo".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn list_materials(state: State<'_, AppState>) -> Result<Vec<Material>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {MATERIAL_COLS} FROM materials ORDER BY name COLLATE NOCASE"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| map_material(r))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_material(
    state: State<'_, AppState>,
    input: CreateMaterialInput,
) -> Result<Material, String> {
    let name = input.name.trim().to_string();
    let unit = input.unit.trim().to_string();
    validate(&name, &unit, input.min_stock, input.cost_per_unit)?;
    if input.stock < 0.0 {
        return Err("El stock inicial no puede ser negativo".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    conn.execute(
        "INSERT INTO materials (name, unit, stock, min_stock, cost_per_unit) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, unit, input.stock, input.min_stock, input.cost_per_unit],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Ya existe un material llamado \"{name}\"")
        } else {
            e.to_string()
        }
    })?;
    let id = conn.last_insert_rowid();

    if input.stock != 0.0 {
        conn.execute(
            "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, 'inicial')",
            params![id, input.stock],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.query_row(
        &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
        params![id],
        |r| map_material(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_material(
    state: State<'_, AppState>,
    id: i64,
    input: UpdateMaterialInput,
) -> Result<Material, String> {
    let name = input.name.trim().to_string();
    let unit = input.unit.trim().to_string();
    validate(&name, &unit, input.min_stock, input.cost_per_unit)?;

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let updated = conn
        .execute(
            "UPDATE materials SET name = ?1, unit = ?2, min_stock = ?3, cost_per_unit = ?4, updated_at = datetime('now','localtime') WHERE id = ?5",
            params![name, unit, input.min_stock, input.cost_per_unit, id],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                format!("Ya existe un material llamado \"{name}\"")
            } else {
                e.to_string()
            }
        })?;
    if updated == 0 {
        return Err("Material no encontrado".into());
    }

    conn.query_row(
        &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
        params![id],
        |r| map_material(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_material(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let deleted = conn
        .execute("DELETE FROM materials WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Material no encontrado".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn adjust_stock(
    state: State<'_, AppState>,
    material_id: i64,
    change: f64,
    reason: String,
) -> Result<Material, String> {
    if change == 0.0 {
        return Err("La cantidad no puede ser cero".into());
    }
    let reason = match reason.as_str() {
        "entrada" => "entrada",
        "salida" => "salida",
        _ => "ajuste",
    }
    .to_string();

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let stock: f64 = conn
        .query_row(
            "SELECT stock FROM materials WHERE id = ?1",
            params![material_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;

    if stock + change < 0.0 {
        return Err(format!(
            "No puedes retirar más de lo disponible (stock actual: {})",
            fmt_qty(stock)
        ));
    }

    conn.execute(
        "UPDATE materials SET stock = stock + ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![change, material_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, ?3)",
        params![material_id, change, reason],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
        params![material_id],
        |r| map_material(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_movements(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<Movement>, String> {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT sm.id, m.name, sm.change, sm.reason, sm.created_at
             FROM stock_movements sm
             JOIN materials m ON m.id = sm.material_id
             ORDER BY sm.id DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(Movement {
                id: r.get(0)?,
                material_name: r.get(1)?,
                change: r.get(2)?,
                reason: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn receive_material(
    state: State<'_, AppState>,
    input: ReceiveMaterialInput,
) -> Result<Material, String> {
    if input.quantity <= 0.0 {
        return Err("La cantidad debe ser mayor a cero".into());
    }
    if input.cost_per_unit < 0.0 {
        return Err("El costo por unidad no puede ser negativo".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let (current_stock, current_cost): (f64, f64) = conn
        .query_row(
            "SELECT stock, cost_per_unit FROM materials WHERE id = ?1",
            params![input.material_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;

    let new_stock = current_stock + input.quantity;
    let new_cost = if new_stock > 0.0 {
        const PRECISION: f64 = 1000.0;
        let total_value = current_stock * current_cost + input.quantity * input.cost_per_unit;
        (total_value * PRECISION / new_stock).round() / PRECISION
    } else {
        input.cost_per_unit
    };

    conn.execute(
        "UPDATE materials SET stock = ?1, cost_per_unit = ?2, updated_at = datetime('now','localtime') WHERE id = ?3",
        params![new_stock, new_cost, input.material_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, 'entrada')",
        params![input.material_id, input.quantity],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
        params![input.material_id],
        |r| map_material(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn waste_material(
    state: State<'_, AppState>,
    input: WasteMaterialInput,
) -> Result<Material, String> {
    if input.quantity <= 0.0 {
        return Err("La cantidad debe ser mayor a cero".into());
    }
    if input.reason.trim().is_empty() {
        return Err("El motivo es obligatorio".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let (stock, current_cost, material_name): (f64, f64, String) = conn
        .query_row(
            "SELECT stock, cost_per_unit, name FROM materials WHERE id = ?1",
            params![input.material_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;

    if stock < input.quantity {
        return Err(format!(
            "No puedes desperdiciar más de lo disponible (stock actual: {})",
            fmt_qty(stock)
        ));
    }

    conn.execute(
        "UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![input.quantity, input.material_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, 'merma')",
        params![input.material_id, -input.quantity],
    )
    .map_err(|e| e.to_string())?;

    let merma_amount = input.quantity * current_cost;
    let merma_name = format!("Merma: {}", material_name);
    let merma_description = format!("Motivo: {}", input.reason);

    conn.execute(
        "INSERT INTO expenses (name, amount, category, description) VALUES (?1, ?2, 'merma', ?3)",
        params![merma_name, merma_amount, merma_description],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
        params![input.material_id],
        |r| map_material(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn internal_consumption(
    state: State<'_, AppState>,
    input: InternalConsumptionInput,
) -> Result<(), String> {
    if input.quantity <= 0 {
        return Err("La cantidad debe ser mayor a cero".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;

    // Si el producto se vende por stock, el consumo interno descuenta unidades
    // del producto terminado, no los materiales.
    let tracks: i64 = conn
        .query_row(
            "SELECT tracks_stock FROM products WHERE id = ?1",
            params![input.product_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Producto no encontrado".to_string())?;
    if tracks != 0 {
        let stock: f64 = conn
            .query_row(
                "SELECT stock FROM products WHERE id = ?1",
                params![input.product_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let need = input.quantity as f64;
        if stock < need {
            return Err(format!(
                "Stock insuficiente del producto (disponible: {}, requerido: {})",
                fmt_qty(stock),
                fmt_qty(need)
            ));
        }
        conn.execute(
            "UPDATE products SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![need, input.product_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO product_stock_movements (product_id, change, reason) VALUES (?1, ?2, 'consumo_interno')",
            params![input.product_id, -need],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let recipe_rows: Vec<(i64, f64)> = {
        let mut stmt = conn
            .prepare("SELECT material_id, quantity FROM recipe_items WHERE product_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![input.product_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    if recipe_rows.is_empty() {
        return Err("El producto no tiene receta definida".into());
    }

    for (material_id, qty_per_unit) in &recipe_rows {
        let total_qty: f64 = *qty_per_unit * input.quantity as f64;
        let mat_id: i64 = *material_id;
        let stock: f64 = conn
            .query_row(
                "SELECT stock FROM materials WHERE id = ?1",
                params![mat_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Material no encontrado".to_string())?;

        if stock < total_qty {
            let name: String = conn
                .query_row(
                    "SELECT name FROM materials WHERE id = ?1",
                    params![mat_id],
                    |r| r.get::<_, String>(0),
                )
                .map_err(|e| e.to_string())?;
            return Err(format!(
                "Stock insuficiente de {} (disponible: {}, requerido: {})",
                name,
                fmt_qty(stock),
                fmt_qty(total_qty)
            ));
        }
    }

    for (material_id, qty_per_unit) in &recipe_rows {
        let total_qty: f64 = *qty_per_unit * input.quantity as f64;
        let mat_id: i64 = *material_id;
        conn.execute(
            "UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![total_qty, mat_id],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, 'consumo_interno')",
            params![mat_id, -total_qty],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
