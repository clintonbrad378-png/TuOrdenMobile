use crate::models::*;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const PRODUCT_COLS: &str =
    "id, name, category, price, active, created_at, updated_at, tracks_stock, stock, min_stock, manual_cost";

fn map_product(row: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        name: row.get(1)?,
        category: row.get(2)?,
        price: row.get(3)?,
        active: row.get::<_, i64>(4)? != 0,
        recipe: vec![],
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        tracks_stock: row.get::<_, i64>(7).unwrap_or(0) != 0,
        stock: row.get::<_, f64>(8).unwrap_or(0.0),
        min_stock: row.get::<_, f64>(9).unwrap_or(0.0),
        manual_cost: row.get::<_, f64>(10).unwrap_or(0.0),
    })
}

fn load_recipe(conn: &Connection, product_id: i64) -> Result<Vec<RecipeItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT ri.material_id, m.name, m.unit, ri.quantity, m.cost_per_unit
             FROM recipe_items ri
             JOIN materials m ON m.id = ri.material_id
             WHERE ri.product_id = ?1
             ORDER BY m.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![product_id], |r| {
            Ok(RecipeItem {
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

fn load_products(conn: &Connection, include_inactive: bool) -> Result<Vec<Product>, String> {
    let sql = if include_inactive {
        format!("SELECT {PRODUCT_COLS} FROM products ORDER BY name COLLATE NOCASE")
    } else {
        format!(
            "SELECT {PRODUCT_COLS} FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE"
        )
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| map_product(r))
        .map_err(|e| e.to_string())?;
    let mut products: Vec<Product> =
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    for p in products.iter_mut() {
        p.recipe = load_recipe(conn, p.id)?;
    }
    Ok(products)
}

fn validate_input(input: &ProductInput) -> Result<String, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("El nombre del producto es obligatorio".into());
    }
    if input.price < 0.0 {
        return Err("El precio no puede ser negativo".into());
    }
    if input.manual_cost < 0.0 {
        return Err("El costo fijo no puede ser negativo".into());
    }
    if input.stock < 0.0 || input.min_stock < 0.0 {
        return Err("El stock no puede ser negativo".into());
    }
    for item in &input.recipe {
        if item.quantity <= 0.0 {
            return Err("Las cantidades de la receta deben ser mayores a cero".into());
        }
    }
    Ok(name)
}

fn insert_recipe(
    conn: &Connection,
    product_id: i64,
    recipe: &[RecipeItemInput],
) -> Result<(), String> {
    let mut merged: std::collections::HashMap<i64, f64> = std::collections::HashMap::new();
    for item in recipe {
        *merged.entry(item.material_id).or_insert(0.0) += item.quantity;
    }
    let mut stmt = conn
        .prepare(
            "INSERT INTO recipe_items (product_id, material_id, quantity) VALUES (?1, ?2, ?3)",
        )
        .map_err(|e| e.to_string())?;
    for (material_id, quantity) in merged {
        let exists: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM materials WHERE id = ?1",
                params![material_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err(format!("Material inválido en la receta (id {material_id})"));
        }
        stmt.execute(params![product_id, material_id, quantity])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn recipe_cost(conn: &Connection, product_id: i64) -> Result<f64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(ri.quantity * m.cost_per_unit), 0)
         FROM recipe_items ri JOIN materials m ON m.id = ri.material_id
         WHERE ri.product_id = ?1",
        params![product_id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn sync_manual_cost(conn: &Connection, product_id: i64, tracks_stock: bool, fallback: f64) -> Result<(), String> {
    // El costo del producto por stock NACE de su receta: se recalcula en el
    // servidor para que nunca quede desfasado del costo real de materiales.
    // Solo sin receta (revendido) se respeta el costo manual.
    let cost = if tracks_stock {
        let recipe_n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM recipe_items WHERE product_id = ?1",
                params![product_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if recipe_n > 0 {
            recipe_cost(conn, product_id)?
        } else {
            fallback.max(0.0)
        }
    } else {
        0.0
    };
    conn.execute(
        "UPDATE products SET manual_cost = ?1 WHERE id = ?2",
        params![cost, product_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_products(
    state: State<'_, AppState>,
    include_inactive: Option<bool>,
) -> Result<Vec<Product>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    load_products(&conn, include_inactive.unwrap_or(false))
}

#[tauri::command]
pub async fn create_product(
    state: State<'_, AppState>,
    input: ProductInput,
) -> Result<Product, String> {
    let name = validate_input(&input)?;
    let category = if input.category.trim().is_empty() {
        "General".to_string()
    } else {
        input.category.trim().to_string()
    };

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    conn.execute(
        "INSERT INTO products (name, category, price, active, tracks_stock, stock, min_stock, manual_cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            name,
            category,
            input.price,
            input.active as i64,
            input.tracks_stock as i64,
            if input.tracks_stock { input.stock.max(0.0) } else { 0.0 },
            if input.tracks_stock { input.min_stock.max(0.0) } else { 0.0 },
            if input.tracks_stock { input.manual_cost.max(0.0) } else { 0.0 },
        ],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Ya existe un producto llamado \"{name}\"")
        } else {
            e.to_string()
        }
    })?;
    let id = conn.last_insert_rowid();
    insert_recipe(&conn, id, &input.recipe)?;
    sync_manual_cost(&conn, id, input.tracks_stock, input.manual_cost)?;

    let mut product = conn
        .query_row(
            &format!("SELECT {PRODUCT_COLS} FROM products WHERE id = ?1"),
            params![id],
            |r| map_product(r),
        )
        .map_err(|e| e.to_string())?;
    product.recipe = load_recipe(&conn, id)?;
    Ok(product)
}

#[tauri::command]
pub async fn update_product(
    state: State<'_, AppState>,
    id: i64,
    input: ProductInput,
) -> Result<Product, String> {
    let name = validate_input(&input)?;
    let category = if input.category.trim().is_empty() {
        "General".to_string()
    } else {
        input.category.trim().to_string()
    };

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let updated = conn
        .execute(
            "UPDATE products SET name = ?1, category = ?2, price = ?3, active = ?4, tracks_stock = ?5, min_stock = ?6, manual_cost = ?7, updated_at = datetime('now','localtime') WHERE id = ?8",
            params![
                name,
                category,
                input.price,
                input.active as i64,
                input.tracks_stock as i64,
                if input.tracks_stock { input.min_stock.max(0.0) } else { 0.0 },
                if input.tracks_stock { input.manual_cost.max(0.0) } else { 0.0 },
                id
            ],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                format!("Ya existe un producto llamado \"{name}\"")
            } else {
                e.to_string()
            }
        })?;
    if updated == 0 {
        return Err("Producto no encontrado".into());
    }

    conn.execute("DELETE FROM recipe_items WHERE product_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    insert_recipe(&conn, id, &input.recipe)?;
    sync_manual_cost(&conn, id, input.tracks_stock, input.manual_cost)?;

    let mut product = conn
        .query_row(
            &format!("SELECT {PRODUCT_COLS} FROM products WHERE id = ?1"),
            params![id],
            |r| map_product(r),
        )
        .map_err(|e| e.to_string())?;
    product.recipe = load_recipe(&conn, id)?;
    Ok(product)
}

#[tauri::command]
pub async fn set_product_active(state: State<'_, AppState>, id: i64, active: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let updated = conn
        .execute(
            "UPDATE products SET active = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![active as i64, id],
        )
        .map_err(|e| e.to_string())?;
    if updated == 0 {
        return Err("Producto no encontrado".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_product(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let deleted = conn
        .execute("DELETE FROM products WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Producto no encontrado".into());
    }
    Ok(())
}

fn estimate_for_product(
    conn: &Connection,
    product_id: i64,
) -> Result<ProductionEstimate, String> {
    let (pname, tracks): (String, i64) = conn
        .query_row(
            "SELECT name, tracks_stock FROM products WHERE id = ?1",
            params![product_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Producto no encontrado".to_string())?;
    let _ = tracks;

    let mut stmt = conn
        .prepare(
            "SELECT ri.material_id, m.name, m.unit, m.stock, ri.quantity, m.cost_per_unit
             FROM recipe_items ri JOIN materials m ON m.id = ri.material_id
             WHERE ri.product_id = ?1 ORDER BY m.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![product_id], |r| {
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
        return Ok(ProductionEstimate {
            product_id,
            product_name: pname,
            max_units: 0,
            limiting_material: None,
            items: vec![],
        });
    }

    let mut items = Vec::with_capacity(rows.len());
    let mut max_units = i64::MAX;
    let mut limiting: Option<String> = None;
    for (mid, mname, unit, stock, per_unit, _cost) in rows {
        let mu = if per_unit > 0.0 {
            (stock / per_unit).floor() as i64
        } else {
            0
        };
        let mu = mu.max(0);
        if mu < max_units {
            max_units = mu;
            limiting = Some(mname.clone());
        }
        items.push(ProductionEstimateItem {
            material_id: mid,
            material_name: mname,
            unit,
            stock,
            required_per_unit: per_unit,
            max_units: mu,
        });
    }
    Ok(ProductionEstimate {
        product_id,
        product_name: pname,
        max_units: if max_units == i64::MAX { 0 } else { max_units },
        limiting_material: limiting,
        items,
    })
}

#[tauri::command]
pub async fn estimate_production(
    state: State<'_, AppState>,
    product_id: i64,
) -> Result<ProductionEstimate, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    estimate_for_product(&conn, product_id)
}

#[tauri::command]
pub async fn produce_stock(
    state: State<'_, AppState>,
    input: ProduceStockInput,
) -> Result<Production, String> {
    if !(input.quantity > 0.0) {
        return Err("La cantidad a producir debe ser mayor a cero".into());
    }
    // Solo cantidades enteras de producto terminado (unidades).
    let qty_rounded = input.quantity.round();
    if (input.quantity - qty_rounded).abs() > 1e-9 {
        return Err("La cantidad a producir debe ser un número entero de unidades".into());
    }
    let quantity = qty_rounded;
    if quantity <= 0.0 {
        return Err("La cantidad a producir debe ser mayor a cero".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (pname, tracks, _manual_cost): (String, i64, f64) = tx
        .query_row(
            "SELECT name, tracks_stock, manual_cost FROM products WHERE id = ?1",
            params![input.product_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Producto no encontrado".to_string())?;
    if tracks == 0 {
        return Err("El producto no maneja stock (activa 'Vender por stock' en Menú)".into());
    }

    // Cargar receta.
    let recipe: Vec<(i64, f64)> = {
        let mut stmt = tx
            .prepare("SELECT material_id, quantity FROM recipe_items WHERE product_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![input.product_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let out: Vec<(i64, f64)> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        out
    };
    if recipe.is_empty() {
        return Err("El producto no tiene receta: ajusta su stock manualmente".into());
    }

    // Verificar stock de materiales y calcular costo real de materiales.
    let mut needs: Vec<(i64, f64, String, f64)> = Vec::new();
    let mut total_material_cost = 0.0;
    for (mid, per_unit) in &recipe {
        let (mname, mstock, mcost): (String, f64, f64) = tx
            .query_row(
                "SELECT name, stock, cost_per_unit FROM materials WHERE id = ?1",
                params![mid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Material de la receta no encontrado".to_string())?;
        let need = *per_unit * quantity;
        if mstock < need {
            return Err(format!(
                "Stock insuficiente de {}: necesitas {}, disponible {}",
                mname,
                crate::db::fmt_qty(need),
                crate::db::fmt_qty(mstock)
            ));
        }
        total_material_cost += need * mcost;
        needs.push((*mid, need, mname, mcost));
    }

    // Registrar producción primero para obtener su id y usarlo como referencia.
    // El costo unitario NACE de la receta: costo real de materiales / unidades.
    let batch_unit_cost = if quantity > 0.0 {
        total_material_cost / quantity
    } else {
        0.0
    };
    let (prod_id, created_at): (i64, String) = tx
        .query_row(
            "INSERT INTO productions (product_id, quantity, unit_cost, total_material_cost, note) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, created_at",
            params![
                input.product_id,
                quantity,
                batch_unit_cost,
                total_material_cost,
                input.note
            ],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Descontar materiales con trazabilidad a la producción.
    {
        let mut upd = tx
            .prepare("UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2")
            .map_err(|e| e.to_string())?;
        let mut mov = tx
            .prepare("INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, 'produccion', ?3)")
            .map_err(|e| e.to_string())?;
        for (mid, need, _, _) in &needs {
            upd.execute(params![need, mid]).map_err(|e| e.to_string())?;
            mov.execute(params![mid, -need, prod_id]).map_err(|e| e.to_string())?;
        }
    }

    // Aumentar stock del producto y sincronizar su costo con la receta real.
    tx.execute(
        "UPDATE products SET stock = stock + ?1, manual_cost = ?2, updated_at = datetime('now','localtime') WHERE id = ?3",
        params![quantity, batch_unit_cost, input.product_id],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO product_stock_movements (product_id, change, reason, reference_id) VALUES (?1, ?2, 'produccion', ?3)",
        params![input.product_id, quantity, prod_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Production {
        id: prod_id,
        product_id: input.product_id,
        product_name: pname,
        quantity,
        unit_cost: batch_unit_cost,
        total_material_cost,
        note: input.note.clone(),
        created_at,
    })
}

#[tauri::command]
pub async fn adjust_product_stock(
    state: State<'_, AppState>,
    input: AdjustProductStockInput,
) -> Result<Product, String> {
    if input.change == 0.0 {
        return Err("La cantidad no puede ser cero".into());
    }
    let reason = match input.reason.as_str() {
        "entrada" | "salida" | "merma" | "ajuste" | "produccion" => input.reason.clone(),
        _ => "ajuste".to_string(),
    };
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let (tracks, stock): (i64, f64) = conn
        .query_row(
            "SELECT tracks_stock, stock FROM products WHERE id = ?1",
            params![input.product_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Producto no encontrado".to_string())?;
    if tracks == 0 {
        return Err("El producto no maneja stock".into());
    }
    if stock + input.change < -1e-9 {
        return Err(format!(
            "No puedes retirar más de lo disponible (stock actual: {})",
            crate::db::fmt_qty(stock)
        ));
    }
    conn.execute(
        "UPDATE products SET stock = stock + ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
        params![input.change, input.product_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO product_stock_movements (product_id, change, reason) VALUES (?1, ?2, ?3)",
        params![input.product_id, input.change, reason],
    )
    .map_err(|e| e.to_string())?;
    let mut product = conn
        .query_row(
            &format!("SELECT {PRODUCT_COLS} FROM products WHERE id = ?1"),
            params![input.product_id],
            |r| map_product(r),
        )
        .map_err(|e| e.to_string())?;
    product.recipe = load_recipe(&conn, input.product_id)?;
    Ok(product)
}

#[tauri::command]
pub async fn list_productions(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<Production>, String> {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT pr.id, pr.product_id, p.name, pr.quantity, pr.unit_cost, pr.total_material_cost, pr.note, pr.created_at
             FROM productions pr JOIN products p ON p.id = pr.product_id
             ORDER BY pr.id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |r| {
            Ok(Production {
                id: r.get(0)?,
                product_id: r.get(1)?,
                product_name: r.get(2)?,
                quantity: r.get(3)?,
                unit_cost: r.get(4)?,
                total_material_cost: r.get(5)?,
                note: r.get(6)?,
                created_at: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
