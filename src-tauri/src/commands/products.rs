use crate::models::*;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

const PRODUCT_COLS: &str = "id, name, category, price, active, created_at, updated_at";

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
        "INSERT INTO products (name, category, price, active) VALUES (?1, ?2, ?3, ?4)",
        params![name, category, input.price, input.active as i64],
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
            "UPDATE products SET name = ?1, category = ?2, price = ?3, active = ?4, updated_at = datetime('now','localtime') WHERE id = ?5",
            params![name, category, input.price, input.active as i64, id],
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
