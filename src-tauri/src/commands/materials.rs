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
    "id, name, unit, stock, min_stock, cost_per_unit, created_at, updated_at, is_elaborated, recipe_yield";

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
        is_elaborated: row.get::<_, i64>(8).unwrap_or(0) != 0,
        recipe_yield: row.get::<_, f64>(9).unwrap_or(0.0),
        recipe: vec![],
    })
}

fn load_material_recipe(
    conn: &rusqlite::Connection,
    material_id: i64,
) -> Result<Vec<MaterialRecipeItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT mri.component_id, m.name, m.unit, mri.quantity, m.cost_per_unit
             FROM material_recipe_items mri
             JOIN materials m ON m.id = mri.component_id
             WHERE mri.material_id = ?1
             ORDER BY m.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![material_id], |r| {
            Ok(MaterialRecipeItem {
                material_id: r.get(0)?,
                material_name: r.get(1)?,
                unit: r.get(2)?,
                quantity: r.get(3)?,
                cost_per_unit: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// ¿Agregar component_id como insumo de material_id crearía un ciclo?
fn would_create_cycle(
    conn: &rusqlite::Connection,
    material_id: i64,
    component_id: i64,
) -> Result<bool, String> {
    if material_id == component_id {
        return Ok(true);
    }
    let exists: Option<i64> = conn
        .query_row(
            "WITH RECURSIVE deps(id) AS (
               SELECT component_id FROM material_recipe_items WHERE material_id = ?1
               UNION
               SELECT mri.component_id FROM material_recipe_items mri JOIN deps d ON mri.material_id = d.id
             )
             SELECT 1 FROM deps WHERE id = ?2 LIMIT 1",
            params![component_id, material_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(exists.is_some())
}

fn insert_material_recipe(
    conn: &rusqlite::Connection,
    material_id: i64,
    recipe: &[MaterialRecipeItemInput],
) -> Result<(), String> {
    use std::collections::HashMap;
    let mut merged: HashMap<i64, f64> = HashMap::new();
    for item in recipe {
        if !(item.quantity > 0.0) || !item.quantity.is_finite() {
            return Err("Las cantidades de la receta del material deben ser mayores a cero".into());
        }
        if item.component_id == material_id {
            return Err("Un material elaborado no puede usarse a sí mismo como ingrediente".into());
        }
        *merged.entry(item.component_id).or_insert(0.0) += item.quantity;
    }
    for (component_id, _) in merged.iter() {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM materials WHERE id = ?1",
                params![component_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err(format!("Material inválido en la receta (id {component_id})"));
        }
        if would_create_cycle(conn, material_id, *component_id)? {
            return Err("Esa combinación crearía una receta circular".into());
        }
    }
    let mut stmt = conn
        .prepare(
            "INSERT INTO material_recipe_items (material_id, component_id, quantity) VALUES (?1, ?2, ?3)",
        )
        .map_err(|e| e.to_string())?;
    for (component_id, quantity) in merged {
        stmt.execute(params![material_id, component_id, quantity])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
    let mut mats: Vec<Material> =
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    for m in mats.iter_mut() {
        m.recipe = load_material_recipe(&conn, m.id)?;
    }
    Ok(mats)
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
    if input.is_elaborated {
        if !(input.recipe_yield > 0.0) {
            return Err("El rendimiento de la receta debe ser mayor a cero (ej. rinde 10 lb)".into());
        }
        if input.recipe.is_empty() {
            return Err("Un material elaborado necesita al menos un ingrediente".into());
        }
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO materials (name, unit, stock, min_stock, cost_per_unit, is_elaborated, recipe_yield) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            name,
            unit,
            input.stock,
            input.min_stock,
            input.cost_per_unit,
            if input.is_elaborated { 1 } else { 0 },
            if input.is_elaborated { input.recipe_yield } else { 0.0 },
        ],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Ya existe un material llamado \"{name}\"")
        } else {
            e.to_string()
        }
    })?;
    let id = tx.last_insert_rowid();

    if input.is_elaborated {
        insert_material_recipe(&tx, id, &input.recipe)?;
    }

    if input.stock != 0.0 {
        tx.execute(
            "INSERT INTO stock_movements (material_id, change, reason) VALUES (?1, ?2, 'inicial')",
            params![id, input.stock],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    let mut mat = conn
        .query_row(
            &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
            params![id],
            |r| map_material(r),
        )
        .map_err(|e| e.to_string())?;
    mat.recipe = load_material_recipe(&conn, id)?;
    Ok(mat)
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
    if input.is_elaborated {
        if !(input.recipe_yield > 0.0) {
            return Err("El rendimiento de la receta debe ser mayor a cero".into());
        }
        if input.recipe.is_empty() {
            return Err("Un material elaborado necesita al menos un ingrediente".into());
        }
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    // El costo del elaborado nace de sus producciones: no se deja pisar al
    // editar la receta (la UI lo deshabilita, pero se defiende aquí también).
    let existing_cost: f64 = conn
        .query_row(
            "SELECT cost_per_unit FROM materials WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;
    let effective_cost = if input.is_elaborated {
        existing_cost.max(0.0)
    } else {
        input.cost_per_unit
    };

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let updated = tx
        .execute(
            "UPDATE materials SET name = ?1, unit = ?2, min_stock = ?3, cost_per_unit = ?4, is_elaborated = ?5, recipe_yield = ?6, updated_at = datetime('now','localtime') WHERE id = ?7",
            params![
                name,
                unit,
                input.min_stock,
                effective_cost,
                if input.is_elaborated { 1 } else { 0 },
                if input.is_elaborated { input.recipe_yield } else { 0.0 },
                id
            ],
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

    tx.execute(
        "DELETE FROM material_recipe_items WHERE material_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    if input.is_elaborated {
        insert_material_recipe(&tx, id, &input.recipe)?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    let mut mat = conn
        .query_row(
            &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
            params![id],
            |r| map_material(r),
        )
        .map_err(|e| e.to_string())?;
    mat.recipe = load_material_recipe(&conn, id)?;
    Ok(mat)
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

    let mut mat = conn
        .query_row(
            &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
            params![material_id],
            |r| map_material(r),
        )
        .map_err(|e| e.to_string())?;
    mat.recipe = load_material_recipe(&conn, material_id)?;
    Ok(mat)
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

    let mut mat = conn
        .query_row(
            &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
            params![input.material_id],
            |r| map_material(r),
        )
        .map_err(|e| e.to_string())?;
    mat.recipe = load_material_recipe(&conn, input.material_id)?;
    Ok(mat)
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

    let mut mat = conn
        .query_row(
            &format!("SELECT {MATERIAL_COLS} FROM materials WHERE id = ?1"),
            params![input.material_id],
            |r| map_material(r),
        )
        .map_err(|e| e.to_string())?;
    mat.recipe = load_material_recipe(&conn, input.material_id)?;
    Ok(mat)
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

fn estimate_material_for(
    conn: &rusqlite::Connection,
    material_id: i64,
) -> Result<MaterialProductionEstimate, String> {
    let (mname, unit, is_elab, recipe_yield): (String, String, i64, f64) = conn
        .query_row(
            "SELECT name, unit, is_elaborated, recipe_yield FROM materials WHERE id = ?1",
            params![material_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;
    if is_elab == 0 {
        return Err("El material no es elaborado (no tiene receta)".into());
    }
    if !(recipe_yield > 0.0) {
        return Err("El material elaborado no tiene rendimiento definido".into());
    }

    let mut stmt = conn
        .prepare(
            "SELECT mri.component_id, m.name, m.unit, m.stock, m.cost_per_unit, mri.quantity
             FROM material_recipe_items mri JOIN materials m ON m.id = mri.component_id
             WHERE mri.material_id = ?1 ORDER BY m.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![material_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, f64>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, f64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Ok(MaterialProductionEstimate {
            material_id,
            material_name: mname,
            unit,
            recipe_yield,
            max_output: 0.0,
            limiting_material: None,
            total_batch_cost: 0.0,
            unit_cost: 0.0,
            items: vec![],
        });
    }

    // required_per_unit = base_quantity / recipe_yield (en unidad de stock del insumo
    // por cada 1 unidad de material elaborado).
    let mut items = Vec::with_capacity(rows.len());
    let mut max_output = f64::INFINITY;
    let mut limiting: Option<String> = None;
    let mut total_batch_cost = 0.0;
    for (cid, cname, cunit, cstock, ccost, base_qty) in rows {
        let per_unit = base_qty / recipe_yield;
        let possible = if per_unit > 0.0 { cstock / per_unit } else { 0.0 };
        if possible < max_output {
            max_output = possible;
            limiting = Some(cname.clone());
        }
        total_batch_cost += base_qty * ccost;
        items.push(MaterialProductionEstimateItem {
            material_id: cid,
            material_name: cname,
            unit: cunit,
            stock: cstock,
            cost_per_unit: ccost,
            base_quantity: base_qty,
            required_per_unit: per_unit,
            max_output: possible,
        });
    }
    let max_output = if max_output.is_finite() { max_output.max(0.0) } else { 0.0 };
    let unit_cost = if recipe_yield > 0.0 {
        total_batch_cost / recipe_yield
    } else {
        0.0
    };
    Ok(MaterialProductionEstimate {
        material_id,
        material_name: mname,
        unit,
        recipe_yield,
        max_output,
        limiting_material: limiting,
        total_batch_cost,
        unit_cost,
        items,
    })
}

#[tauri::command]
pub async fn estimate_material_production(
    state: State<'_, AppState>,
    material_id: i64,
) -> Result<MaterialProductionEstimate, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    estimate_material_for(&conn, material_id)
}

#[tauri::command]
pub async fn produce_material(
    state: State<'_, AppState>,
    input: ProduceMaterialInput,
) -> Result<MaterialProduction, String> {
    if !(input.quantity > 0.0) || !input.quantity.is_finite() {
        return Err("La cantidad a elaborar debe ser mayor a cero".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (mname, unit, is_elab, recipe_yield): (String, String, i64, f64) = tx
        .query_row(
            "SELECT name, unit, is_elaborated, recipe_yield FROM materials WHERE id = ?1",
            params![input.material_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Material no encontrado".to_string())?;
    if is_elab == 0 {
        return Err("El material no es elaborado: define su receta primero".into());
    }
    if !(recipe_yield > 0.0) {
        return Err("El material elaborado no tiene rendimiento definido".into());
    }

    // Receta base (cantidades para recipe_yield unidades de resultado).
    let recipe: Vec<(i64, f64)> = {
        let mut stmt = tx
            .prepare(
                "SELECT component_id, quantity FROM material_recipe_items WHERE material_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![input.material_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    if recipe.is_empty() {
        return Err("El material elaborado no tiene ingredientes".into());
    }

    let factor = input.quantity / recipe_yield;
    let mut needs: Vec<(i64, f64, String, f64)> = Vec::new();
    let mut total_material_cost = 0.0;
    for (cid, base_qty) in &recipe {
        let (cname, cstock, ccost): (String, f64, f64) = tx
            .query_row(
                "SELECT name, stock, cost_per_unit FROM materials WHERE id = ?1",
                params![cid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Material de la receta no encontrado".to_string())?;
        let need = *base_qty * factor;
        if cstock + 1e-9 < need {
            return Err(format!(
                "Stock insuficiente de {}: necesitas {}, disponible {}",
                cname,
                crate::db::fmt_qty(need),
                crate::db::fmt_qty(cstock)
            ));
        }
        total_material_cost += need * ccost;
        needs.push((*cid, need, cname, ccost));
    }

    // Costo por unidad del lote: total / cantidad creada (idea del usuario).
    let batch_unit_cost = if input.quantity > 0.0 {
        total_material_cost / input.quantity
    } else {
        0.0
    };
    let (prod_id, created_at): (i64, String) = tx
        .query_row(
            "INSERT INTO material_productions (material_id, quantity, unit_cost, total_material_cost, note) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, created_at",
            params![
                input.material_id,
                input.quantity,
                batch_unit_cost,
                total_material_cost,
                input.note
            ],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    {
        let mut upd = tx
            .prepare("UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2")
            .map_err(|e| e.to_string())?;
        let mut mov = tx
            .prepare("INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, 'produccion_material', ?3)")
            .map_err(|e| e.to_string())?;
        for (cid, need, _, _) in &needs {
            upd.execute(params![need, cid]).map_err(|e| e.to_string())?;
            mov.execute(params![cid, -need, prod_id]).map_err(|e| e.to_string())?;
        }
    }

    // Sumar resultado, actualizar su costo por unidad al costo real del lote
    // y dejar trazabilidad positiva.
    tx.execute(
        "UPDATE materials SET stock = stock + ?1, cost_per_unit = ?2, updated_at = datetime('now','localtime') WHERE id = ?3",
        params![input.quantity, batch_unit_cost, input.material_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, 'elaboracion', ?3)",
        params![input.material_id, input.quantity, prod_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(MaterialProduction {
        id: prod_id,
        material_id: input.material_id,
        material_name: mname,
        quantity: input.quantity,
        unit,
        unit_cost: batch_unit_cost,
        total_material_cost,
        note: input.note.clone(),
        created_at,
    })
}

#[tauri::command]
pub async fn list_material_productions(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<MaterialProduction>, String> {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT mp.id, mp.material_id, m.name, mp.quantity, m.unit, mp.unit_cost, mp.total_material_cost, mp.note, mp.created_at
             FROM material_productions mp JOIN materials m ON m.id = mp.material_id
             ORDER BY mp.id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(MaterialProduction {
                id: r.get(0)?,
                material_id: r.get(1)?,
                material_name: r.get(2)?,
                quantity: r.get(3)?,
                unit: r.get(4)?,
                unit_cost: r.get(5)?,
                total_material_cost: r.get(6)?,
                note: r.get(7)?,
                created_at: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
