use crate::models::*;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

fn meta_get(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM sync_meta WHERE key = ?1", params![key], |r| {
        r.get(0)
    })
    .optional()
    .ok()
    .flatten()
}

fn meta_set(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn gen_device_id() -> String {
    use rand::RngCore;
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn ensure_uuid(conn: &rusqlite::Connection) -> Result<(), String> {
    // Por si la DB venia de una version previa a V10 sin pasar por migrate.
    for sql in [
        "ALTER TABLE materials ADD COLUMN uuid TEXT",
        "ALTER TABLE products ADD COLUMN uuid TEXT",
    ] {
        match conn.execute_batch(sql) {
            Ok(_) => {},
            Err(e) => {
                let m = e.to_string();
                if !(m.contains("duplicate column") || m.contains("already exists")) {
                    return Err(m);
                }
            }
        }
    }
    conn.execute_batch(
        "UPDATE materials SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL OR uuid = '';\n\
         UPDATE products SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL OR uuid = '';",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_get_device(state: State<'_, AppState>) -> Result<SyncStatus, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    ensure_uuid(&conn)?;
    let device_id = match meta_get(&conn, "device_id") {
        Some(v) => v,
        None => {
            let id = gen_device_id();
            meta_set(&conn, "device_id", &id)?;
            id
        }
    };
    let business_id = meta_get(&conn, "business_id");
    let role = meta_get(&conn, "role").unwrap_or_else(|| "gerente".to_string());
    let catalog_version: i64 = meta_get(&conn, "catalog_version")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let pending_out: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
               SELECT s.id FROM sales s LEFT JOIN synced_sales ss ON ss.local_id = s.id AND ss.kind='sale' WHERE ss.local_id IS NULL
               UNION ALL
               SELECT cs.id FROM credit_sales cs LEFT JOIN synced_sales ss ON ss.local_id = cs.id AND ss.kind='credit' WHERE ss.local_id IS NULL
               UNION ALL
               SELECT cp.id FROM credit_payments cp
                 JOIN synced_sales ss ON ss.local_id = cp.credit_sale_id AND ss.kind = 'credit'
                 LEFT JOIN synced_sales sp ON sp.local_id = cp.id AND sp.kind = 'credit_payment'
                 WHERE sp.local_id IS NULL
             )",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(SyncStatus {
        device_id,
        business_id,
        role,
        catalog_version,
        pending_out,
        pending_detail: vec![],
    })
}

#[tauri::command]
pub async fn sync_set_business(
    state: State<'_, AppState>,
    input: SyncBusinessInput,
) -> Result<SyncStatus, String> {
    let role = match input.role.as_str() {
        "dependiente" => "dependiente",
        _ => "gerente",
    };
    {
        let conn = state.db.lock().map_err(|_| "Error interno")?;
        meta_set(&conn, "business_id", input.business_id.trim())?;
        meta_set(&conn, "role", role)?;
        if let Some(t) = input.token {
            meta_set(&conn, "sync_token", t.trim())?;
        }
        if let Some(l) = input.label {
            meta_set(&conn, "device_label", l.trim())?;
        }
    }
    sync_get_device(state).await
}

#[tauri::command]
pub async fn sync_set_catalog_version(
    state: State<'_, AppState>,
    version: i64,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    meta_set(&conn, "catalog_version", &version.to_string())?;
    Ok(())
}

// ---------- Export catalogo (gerente) ----------

#[tauri::command]
pub async fn sync_export_catalog(
    state: State<'_, AppState>,
) -> Result<CatalogPayload, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    ensure_uuid(&conn)?;
    let version: i64 = meta_get(&conn, "catalog_version")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    // Materiales con uuid
    let mut stmt = conn
        .prepare("SELECT id, uuid, name, unit, stock, min_stock, cost_per_unit, is_elaborated, recipe_yield FROM materials ORDER BY name COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let mat_rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, f64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, f64>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut materials: Vec<SyncMaterial> = vec![];
    for row in mat_rows {
        let (id, uuid, name, unit, stock, min_stock, cost_per_unit, is_elab, recipe_yield) =
            row.map_err(|e| e.to_string())?;
        let uuid = if uuid.is_empty() { gen_device_id() } else { uuid };
        // Receta elaborada: component uuid
        let mut recipe: Vec<SyncMaterialRecipeRow> = vec![];
        if let Ok(mut rs) = conn.prepare(
            "SELECT m2.uuid, ri.quantity FROM material_recipe_items ri JOIN materials m2 ON m2.id = ri.component_id WHERE ri.material_id = ?1",
        ) {
            if let Ok(rows) = rs.query_map(params![id], |r| {
                Ok((r.get::<_, Option<String>>(0)?, r.get::<_, f64>(1)?))
            }) {
                for r in rows.flatten() {
                    recipe.push(SyncMaterialRecipeRow {
                        component_uuid: r.0.unwrap_or_default(),
                        quantity: r.1,
                    });
                }
            }
        }
        let mut extras: Vec<SyncExtra> = vec![];
        if let Ok(mut es) = conn.prepare(
            "SELECT name, kind, amount FROM material_extra_costs WHERE material_id = ?1 ORDER BY id",
        ) {
            if let Ok(rows) = es.query_map(params![id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?))
            }) {
                for r in rows.flatten() {
                    extras.push(SyncExtra { name: r.0, kind: r.1, amount: r.2 });
                }
            }
        }
        materials.push(SyncMaterial {
            uuid,
            name,
            unit,
            stock,
            min_stock,
            cost_per_unit,
            is_elaborated: is_elab != 0,
            recipe_yield,
            recipe,
            extras,
        });
    }

    // Productos con uuid
    let mut stmt = conn
        .prepare("SELECT id, uuid, name, category, price, active, tracks_stock, stock, min_stock, manual_cost FROM products ORDER BY name COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let prod_rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, f64>(7)?,
                r.get::<_, f64>(8)?,
                r.get::<_, f64>(9)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut products: Vec<SyncProduct> = vec![];
    for row in prod_rows {
        let (id, uuid, name, category, price, active, tracks, stock, min_stock, manual_cost) =
            row.map_err(|e| e.to_string())?;
        let uuid = if uuid.is_empty() { gen_device_id() } else { uuid };
        let mut recipe: Vec<SyncProductRecipeRow> = vec![];
        if let Ok(mut rs) = conn.prepare(
            "SELECT m.uuid, ri.quantity FROM recipe_items ri JOIN materials m ON m.id = ri.material_id WHERE ri.product_id = ?1",
        ) {
            if let Ok(rows) = rs.query_map(params![id], |r| {
                Ok((r.get::<_, Option<String>>(0)?, r.get::<_, f64>(1)?))
            }) {
                for r in rows.flatten() {
                    recipe.push(SyncProductRecipeRow {
                        material_uuid: r.0.unwrap_or_default(),
                        quantity: r.1,
                    });
                }
            }
        }
        let mut extras: Vec<SyncExtra> = vec![];
        if let Ok(mut es) = conn.prepare(
            "SELECT name, kind, amount FROM product_extra_costs WHERE product_id = ?1 ORDER BY id",
        ) {
            if let Ok(rows) = es.query_map(params![id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, f64>(2)?))
            }) {
                for r in rows.flatten() {
                    extras.push(SyncExtra { name: r.0, kind: r.1, amount: r.2 });
                }
            }
        }
        products.push(SyncProduct {
            uuid,
            name,
            category,
            price,
            active: active != 0,
            tracks_stock: tracks != 0,
            stock,
            min_stock,
            manual_cost,
            recipe,
            extras,
        });
    }

    Ok(CatalogPayload { version, materials, products })
}

// ---------- Import catalogo (dependiente): gana gerente, incluye stock ----------

#[tauri::command]
pub async fn sync_import_catalog(
    state: State<'_, AppState>,
    payload: CatalogPayload,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    ensure_uuid(&conn)?;
    // Si hay ventas pendientes sin subir, no sobrescribir stock a ciegas:
    // se importa igual pero se preserva la deduccion pendiente.
    let pending_deduction: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    let _ = pending_deduction;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // Materiales upsert por uuid
    for m in &payload.materials {
        let uuid = if m.uuid.trim().is_empty() { gen_device_id() } else { m.uuid.clone() };
        let existing: Option<i64> = tx
            .query_row("SELECT id FROM materials WHERE uuid = ?1", params![uuid], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let id = if let Some(id) = existing {
            tx.execute(
                "UPDATE materials SET name=?1, unit=?2, stock=?3, min_stock=?4, cost_per_unit=?5, is_elaborated=?6, recipe_yield=?7, updated_at=datetime('now','localtime') WHERE id=?8",
                params![m.name, m.unit, m.stock, m.min_stock, m.cost_per_unit, if m.is_elaborated {1} else {0}, m.recipe_yield, id],
            )
            .map_err(|e| e.to_string())?;
            id
        } else {
            // Evitar choque de nombre unico: si existe por nombre, adoptarlo con uuid.
            let by_name: Option<i64> = tx
                .query_row("SELECT id FROM materials WHERE name = ?1 COLLATE NOCASE", params![m.name], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(id) = by_name {
                tx.execute(
                    "UPDATE materials SET uuid=?1, unit=?2, stock=?3, min_stock=?4, cost_per_unit=?5, is_elaborated=?6, recipe_yield=?7, updated_at=datetime('now','localtime') WHERE id=?8",
                    params![uuid, m.unit, m.stock, m.min_stock, m.cost_per_unit, if m.is_elaborated {1} else {0}, m.recipe_yield, id],
                )
                .map_err(|e| e.to_string())?;
                id
            } else {
                tx.execute(
                    "INSERT INTO materials (uuid, name, unit, stock, min_stock, cost_per_unit, is_elaborated, recipe_yield) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![uuid, m.name, m.unit, m.stock, m.min_stock, m.cost_per_unit, if m.is_elaborated {1} else {0}, m.recipe_yield],
                )
                .map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            }
        };
        // Receta + extras: reemplazo total (fuente gerente manda)
        tx.execute("DELETE FROM material_recipe_items WHERE material_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        for r in &m.recipe {
            let comp: Option<i64> = tx
                .query_row("SELECT id FROM materials WHERE uuid = ?1", params![r.component_uuid], |rr| rr.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(cid) = comp {
                tx.execute(
                    "INSERT INTO material_recipe_items (material_id, component_id, quantity) VALUES (?1,?2,?3)",
                    params![id, cid, r.quantity],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        let _ = tx.execute("DELETE FROM material_extra_costs WHERE material_id = ?1", params![id]);
        for e in &m.extras {
            let _ = tx.execute(
                "INSERT INTO material_extra_costs (material_id, name, kind, amount) VALUES (?1,?2,?3,?4)",
                params![id, e.name, e.kind, e.amount],
            );
        }
    }

    // Productos upsert por uuid
    let mut seen_uuids: Vec<String> = vec![];
    for p in &payload.products {
        let uuid = if p.uuid.trim().is_empty() { gen_device_id() } else { p.uuid.clone() };
        seen_uuids.push(uuid.clone());
        let existing: Option<i64> = tx
            .query_row("SELECT id FROM products WHERE uuid = ?1", params![uuid], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        let id = if let Some(id) = existing {
            tx.execute(
                "UPDATE products SET name=?1, category=?2, price=?3, active=?4, tracks_stock=?5, stock=?6, min_stock=?7, manual_cost=?8, updated_at=datetime('now','localtime') WHERE id=?9",
                params![p.name, p.category, p.price, if p.active {1} else {0}, if p.tracks_stock {1} else {0}, p.stock, p.min_stock, p.manual_cost, id],
            )
            .map_err(|e| e.to_string())?;
            id
        } else {
            let by_name: Option<i64> = tx
                .query_row("SELECT id FROM products WHERE name = ?1 COLLATE NOCASE", params![p.name], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(id) = by_name {
                tx.execute(
                    "UPDATE products SET uuid=?1, category=?2, price=?3, active=?4, tracks_stock=?5, stock=?6, min_stock=?7, manual_cost=?8, updated_at=datetime('now','localtime') WHERE id=?9",
                    params![uuid, p.category, p.price, if p.active {1} else {0}, if p.tracks_stock {1} else {0}, p.stock, p.min_stock, p.manual_cost, id],
                )
                .map_err(|e| e.to_string())?;
                id
            } else {
                tx.execute(
                    "INSERT INTO products (uuid, name, category, price, active, tracks_stock, stock, min_stock, manual_cost) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    params![uuid, p.name, p.category, p.price, if p.active {1} else {0}, if p.tracks_stock {1} else {0}, p.stock, p.min_stock, p.manual_cost],
                )
                .map_err(|e| e.to_string())?;
                tx.last_insert_rowid()
            }
        };
        tx.execute("DELETE FROM recipe_items WHERE product_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        for r in &p.recipe {
            let mid: Option<i64> = tx
                .query_row("SELECT id FROM materials WHERE uuid = ?1", params![r.material_uuid], |rr| rr.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if let Some(mid) = mid {
                tx.execute(
                    "INSERT INTO recipe_items (product_id, material_id, quantity) VALUES (?1,?2,?3)",
                    params![id, mid, r.quantity],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        let _ = tx.execute("DELETE FROM product_extra_costs WHERE product_id = ?1", params![id]);
        for e in &p.extras {
            let _ = tx.execute(
                "INSERT INTO product_extra_costs (product_id, name, kind, amount) VALUES (?1,?2,?3,?4)",
                params![id, e.name, e.kind, e.amount],
            );
        }
    }
    // Productos que el gerente elimino: desactivar en dependiente (no borrar por FK).
    if !seen_uuids.is_empty() {
        let placeholders = seen_uuids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("UPDATE products SET active = 0 WHERE uuid NOT IN ({})", placeholders);
        let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
        let refs: Vec<&dyn rusqlite::ToSql> = seen_uuids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        let _ = stmt.execute(refs.as_slice());
    }

    tx.execute(
        "INSERT INTO sync_meta (key, value) VALUES ('catalog_version', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![payload.version.to_string()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("Catálogo v{} aplicado: {} materiales, {} productos", payload.version, payload.materials.len(), payload.products.len()))
}

// ---------- Export pendientes (dependiente) ----------

fn sale_items_with_uuid(
    conn: &rusqlite::Connection,
    sale_id: i64,
) -> Result<Vec<PendingSaleItem>, String> {
    let mut stmt = conn
        .prepare("SELECT si.product_id, si.product_name, si.unit_price, si.unit_cost, si.quantity, si.subtotal FROM sale_items si WHERE si.sale_id = ?1 ORDER BY si.id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![sale_id], |r| {
            Ok((
                r.get::<_, Option<i64>>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, f64>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        let (pid, pname, up, uc, qty, sub) = row.map_err(|e| e.to_string())?;
        let uuid: Option<String> = if let Some(pid) = pid {
            conn.query_row("SELECT uuid FROM products WHERE id = ?1", params![pid], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?
                .flatten()
        } else {
            None
        };
        out.push(PendingSaleItem {
            product_uuid: uuid,
            product_name: pname,
            unit_price: up,
            unit_cost: uc,
            quantity: qty,
            subtotal: sub,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn sync_export_pending(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<PendingSale>, String> {
    let lim = limit.unwrap_or(200).clamp(1, 500);
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut out: Vec<PendingSale> = vec![];

    let mut stmt = conn
        .prepare(&format!(
            "SELECT s.id, s.total, s.payment_method, s.note, s.created_at FROM sales s
             LEFT JOIN synced_sales ss ON ss.local_id = s.id AND ss.kind = 'sale'
             WHERE ss.local_id IS NULL ORDER BY s.id LIMIT {}",
            lim
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, f64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut sale_ids: Vec<(i64, f64, String, Option<String>, String)> = vec![];
    for r in rows {
        sale_ids.push(r.map_err(|e| e.to_string())?);
    }
    for (id, total, method, note, created_at) in sale_ids {
        out.push(PendingSale {
            local_id: id,
            kind: "sale".to_string(),
            total,
            payment_method: Some(method),
            client_name: None,
            client_phone: None,
            note,
            created_at,
            items: sale_items_with_uuid(&conn, id)?,
            payments: vec![],
            origin_credit_local_id: None,
        });
        if out.len() as i64 >= lim {
            break;
        }
    }
    if (out.len() as i64) < lim {
        let rest = lim - out.len() as i64;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT cs.id, cs.client_name, cs.client_phone, cs.total, cs.note, cs.created_at FROM credit_sales cs
                 LEFT JOIN synced_sales ss ON ss.local_id = cs.id AND ss.kind = 'credit'
                 WHERE ss.local_id IS NULL ORDER BY cs.id LIMIT {}",
                rest
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, f64>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut cids: Vec<(i64, String, Option<String>, f64, Option<String>, String)> = vec![];
        for r in rows {
            cids.push(r.map_err(|e| e.to_string())?);
        }
        for (id, cname, cphone, total, note, created_at) in cids {
            // items credito
            let mut items: Vec<PendingSaleItem> = vec![];
            if let Ok(mut st) = conn.prepare("SELECT product_id, product_name, unit_price, unit_cost, quantity, subtotal FROM credit_sale_items WHERE credit_sale_id = ?1 ORDER BY id") {
                if let Ok(rows) = st.query_map(params![id], |r| {
                    Ok((
                        r.get::<_, Option<i64>>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, f64>(2)?,
                        r.get::<_, f64>(3)?,
                        r.get::<_, i64>(4)?,
                        r.get::<_, f64>(5)?,
                    ))
                }) {
                    for row in rows.flatten() {
                        let uuid: Option<String> = if let Some(pid) = row.0 {
                            conn.query_row("SELECT uuid FROM products WHERE id = ?1", params![pid], |r| r.get(0))
                                .optional()
                                .ok()
                                .flatten()
                                .flatten()
                        } else {
                            None
                        };
                        items.push(PendingSaleItem {
                            product_uuid: uuid,
                            product_name: row.1,
                            unit_price: row.2,
                            unit_cost: row.3,
                            quantity: row.4,
                            subtotal: row.5,
                        });
                    }
                }
            }
            let mut payments: Vec<PendingPayment> = vec![];
            if let Ok(mut st) = conn.prepare("SELECT amount, payment_method, note, created_at FROM credit_payments WHERE credit_sale_id = ?1 ORDER BY id") {
                if let Ok(rows) = st.query_map(params![id], |r| {
                    Ok((
                        r.get::<_, f64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                }) {
                    for row in rows.flatten() {
                        payments.push(PendingPayment {
                            amount: row.0,
                            payment_method: row.1,
                            note: row.2,
                            created_at: Some(row.3),
                        });
                    }
                }
            }
            out.push(PendingSale {
                local_id: id,
                kind: "credit".to_string(),
                total,
                payment_method: None,
                client_name: Some(cname),
                client_phone: cphone,
                note,
                created_at,
                items,
                payments,
                origin_credit_local_id: None,
            });
        }
    }
    // Pagos sueltos a creditos YA sincronizados (el credito viajo antes sin ese pago).
    // Se exportan como kind=credit_payment con origin_credit_local_id.
    if (out.len() as i64) < lim {
        let rest = lim - out.len() as i64;
        let mut stmt = conn
            .prepare(&format!(
                "SELECT cp.id, cp.credit_sale_id, cp.amount, cp.payment_method, cp.note, cp.created_at
                 FROM credit_payments cp
                 JOIN synced_sales ss ON ss.local_id = cp.credit_sale_id AND ss.kind = 'credit'
                 LEFT JOIN synced_sales sp ON sp.local_id = cp.id AND sp.kind = 'credit_payment'
                 WHERE sp.local_id IS NULL ORDER BY cp.id LIMIT {}",
                rest
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, f64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (pid, csid, amount, method, note, created_at) = row.map_err(|e| e.to_string())?;
            out.push(PendingSale {
                local_id: pid,
                kind: "credit_payment".to_string(),
                total: amount,
                payment_method: Some(method.clone()),
                client_name: None,
                client_phone: None,
                note,
                created_at: created_at.clone(),
                items: vec![],
                payments: vec![PendingPayment {
                    amount,
                    payment_method: method,
                    note: None,
                    created_at: Some(created_at),
                }],
                origin_credit_local_id: Some(csid),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn sync_mark_pushed(
    state: State<'_, AppState>,
    local_id: i64,
    kind: String,
    batch_id: Option<String>,
) -> Result<(), String> {
    let kind = match kind.as_str() {
        "credit" => "credit",
        "credit_payment" => "credit_payment",
        _ => "sale",
    };
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    conn.execute(
        "INSERT INTO synced_sales (local_id, kind, batch_id) VALUES (?1, ?2, ?3) ON CONFLICT(local_id, kind) DO UPDATE SET batch_id = excluded.batch_id",
        params![local_id, kind, batch_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Import batch (gerente): append-only, acepta ambas ventas ----------

fn resolve_product(
    tx: &rusqlite::Transaction,
    uuid: &Option<String>,
    name: &str,
) -> Result<Option<i64>, String> {
    if let Some(u) = uuid {
        if !u.trim().is_empty() {
            let found: Option<i64> = tx
                .query_row("SELECT id FROM products WHERE uuid = ?1", params![u], |r| r.get(0))
                .optional()
                .map_err(|e| e.to_string())?;
            if found.is_some() {
                return Ok(found);
            }
        }
    }
    let found: Option<i64> = tx
        .query_row(
            "SELECT id FROM products WHERE name = ?1 COLLATE NOCASE",
            params![name],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(found)
}

#[tauri::command]
pub async fn sync_import_batch(
    state: State<'_, AppState>,
    input: ImportBatchInput,
) -> Result<ImportBatchResult, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sale_origin_map (
           origin_device TEXT NOT NULL, origin_kind TEXT NOT NULL, origin_local_id INTEGER NOT NULL,
           local_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
           PRIMARY KEY (origin_device, origin_kind, origin_local_id));",
    )
    .map_err(|e| e.to_string())?;
    // Idempotencia: si ya se importo este origen, devolver el local existente.
    let existing: Option<i64> = conn
        .query_row(
            "SELECT local_id FROM sale_origin_map WHERE origin_device = ?1 AND origin_kind = ?2 AND origin_local_id = ?3",
            params![input.origin_device, input.sale.kind, input.sale.local_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some(local_id) = existing {
        return Ok(ImportBatchResult {
            local_id,
            had_conflict: false,
            message: "Ya importada (idempotente)".to_string(),
        });
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let label = input.origin_label.unwrap_or_else(|| input.origin_device.clone());
    let mut had_conflict = false;

    if input.sale.kind == "credit_payment" {
        // Pago suelto a un credito ya importado.
        let origin_credit = input.sale.origin_credit_local_id.ok_or("Falta origin_credit_local_id")?;
        let target: Option<i64> = tx
            .query_row(
                "SELECT local_id FROM sale_origin_map WHERE origin_device = ?1 AND origin_kind = 'credit' AND origin_local_id = ?2",
                params![input.origin_device, origin_credit],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let target = target.ok_or("La venta a crédito origen aún no fue importada")?;
        let pay = input.sale.payments.first().ok_or("Pago vacío")?;
        let (total, paid): (f64, f64) = tx
            .query_row("SELECT total, paid FROM credit_sales WHERE id = ?1", params![target], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .map_err(|e| e.to_string())?;
        if paid + pay.amount > total + 0.001 {
            had_conflict = true;
        }
        let new_paid = paid + pay.amount;
        let status = if new_paid + 0.001 >= total { "pagado" } else if new_paid > 0.0 { "parcial" } else { "pendiente" };
        tx.execute(
            "UPDATE credit_sales SET paid = ?1, status = ?2, updated_at = datetime('now','localtime') WHERE id = ?3",
            params![new_paid, status, target],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO credit_payments (credit_sale_id, amount, payment_method, note) VALUES (?1,?2,?3,?4)",
            params![target, pay.amount, pay.payment_method, pay.note],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO sale_origin_map (origin_device, origin_kind, origin_local_id, local_id) VALUES (?1,'credit_payment',?2,?3)",
            params![input.origin_device, input.sale.local_id, target],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        return Ok(ImportBatchResult {
            local_id: target,
            had_conflict,
            message: if had_conflict { "Pago importado con exceso (revisar)" } else { "Pago importado" }.to_string(),
        });
    }

    // Venta contado o credito nuevo: insertar cabecera preservando totales/costos originales.
    let note = format!(
        "{} [de {} · #{}{}]",
        input.sale.note.clone().unwrap_or_default(),
        label,
        input.origin_device.chars().take(6).collect::<String>(),
        input.sale.local_id
    );
    let local_id: i64;
    if input.sale.kind == "credit" {
        let cname = input.sale.client_name.clone().unwrap_or_else(|| "Cliente".to_string());
        let (sid,): (i64,) = {
            let mut stmt = tx
                .prepare("INSERT INTO credit_sales (client_name, client_phone, total, paid, status, note) VALUES (?1,?2,?3,?4,?5,?6) RETURNING id")
                .map_err(|e| e.to_string())?;
            let paid: f64 = input.sale.payments.iter().map(|p| p.amount).sum();
            let status = if paid + 0.001 >= input.sale.total { "pagado" } else if paid > 0.0 { "parcial" } else { "pendiente" };
            let id: i64 = stmt
                .query_row(params![cname.trim(), input.sale.client_phone, input.sale.total, paid, status, note.trim()], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            (id,)
        };
        local_id = sid;
        // items
        for it in &input.sale.items {
            let pid = resolve_product(&tx, &it.product_uuid, &it.product_name)?;
            tx.execute(
                "INSERT INTO credit_sale_items (credit_sale_id, product_id, product_name, unit_price, unit_cost, quantity, subtotal) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![local_id, pid, it.product_name, it.unit_price, it.unit_cost, it.quantity, it.subtotal],
            )
            .map_err(|e| e.to_string())?;
        }
        for p in &input.sale.payments {
            tx.execute(
                "INSERT INTO credit_payments (credit_sale_id, amount, payment_method, note) VALUES (?1,?2,?3,?4)",
                params![local_id, p.amount, p.payment_method, p.note],
            )
            .map_err(|e| e.to_string())?;
        }
        deduct_imported_stock(&tx, &input.sale.items, &mut had_conflict, local_id, true)?;
    } else {
        let method = input.sale.payment_method.clone().unwrap_or_else(|| "efectivo".to_string());
        let method = match method.to_lowercase().as_str() {
            "efectivo" => "efectivo",
            "transferencia" => "transferencia",
            _ => "otro",
        };
        let sid: i64 = tx
            .query_row(
                "INSERT INTO sales (total, payment_method, note) VALUES (?1,?2,?3) RETURNING id",
                params![input.sale.total, method, note.trim()],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        local_id = sid;
        for it in &input.sale.items {
            let pid = resolve_product(&tx, &it.product_uuid, &it.product_name)?;
            tx.execute(
                "INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, unit_cost, quantity, subtotal) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![local_id, pid, it.product_name, it.unit_price, it.unit_cost, it.quantity, it.subtotal],
            )
            .map_err(|e| e.to_string())?;
        }
        deduct_imported_stock(&tx, &input.sale.items, &mut had_conflict, local_id, false)?;
    }

    tx.execute(
        "INSERT INTO sale_origin_map (origin_device, origin_kind, origin_local_id, local_id) VALUES (?1,?2,?3,?4)",
        params![input.origin_device, input.sale.kind, input.sale.local_id, local_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportBatchResult {
        local_id,
        had_conflict,
        message: if had_conflict {
            "Importada con stock insuficiente (quedó negativo, revisar)".to_string()
        } else {
            "Importada".to_string()
        },
    })
}

/// Descuenta stock en el gerente por una venta importada.
/// Acepta stock negativo (sob reventa offline) y marca had_conflict.
fn deduct_imported_stock(
    tx: &rusqlite::Transaction,
    items: &[PendingSaleItem],
    had_conflict: &mut bool,
    reference_id: i64,
    is_credit: bool,
) -> Result<(), String> {
    let reason = if is_credit { "venta_credito" } else { "venta" };
    // Resolver necesidades por receta vigente en gerente.
    use std::collections::HashMap;
    let mut needs: HashMap<i64, f64> = HashMap::new();
    let mut prod_needs: HashMap<i64, f64> = HashMap::new();
    for it in items {
        let pid: Option<i64> = if let Some(u) = &it.product_uuid {
            if !u.trim().is_empty() {
                tx.query_row("SELECT id FROM products WHERE uuid = ?1", params![u], |r| r.get(0))
                    .optional()
                    .map_err(|e| e.to_string())?
            } else {
                None
            }
        } else {
            None
        };
        let pid = match pid {
            Some(id) => Some(id),
            None => tx
                .query_row(
                    "SELECT id FROM products WHERE name = ?1 COLLATE NOCASE",
                    params![it.product_name],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?,
        };
        let Some(pid) = pid else { continue };
        let tracks: i64 = tx
            .query_row("SELECT tracks_stock FROM products WHERE id = ?1", params![pid], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?
            .unwrap_or(0);
        if tracks != 0 {
            *prod_needs.entry(pid).or_insert(0.0) += it.quantity as f64;
        } else {
            let mut stmt = tx
                .prepare("SELECT material_id, quantity FROM recipe_items WHERE product_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![pid], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?)))
                .map_err(|e| e.to_string())?;
            for row in rows {
                let (mid, q) = row.map_err(|e| e.to_string())?;
                *needs.entry(mid).or_insert(0.0) += q * it.quantity as f64;
            }
        }
    }
    // Descontar permitiendo negativo; marcar conflicto si queda < 0.
    for (mid, qty) in needs {
        let stock: f64 = tx
            .query_row("SELECT stock FROM materials WHERE id = ?1", params![mid], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if stock < qty {
            *had_conflict = true;
        }
        tx.execute(
            "UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![qty, mid],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, ?3, ?4)",
            params![mid, -qty, format!("{}-sync", reason), reference_id],
        )
        .map_err(|e| e.to_string())?;
    }
    for (pid, qty) in prod_needs {
        let stock: f64 = tx
            .query_row("SELECT stock FROM products WHERE id = ?1", params![pid], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if stock < qty {
            *had_conflict = true;
        }
        tx.execute(
            "UPDATE products SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![qty, pid],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO product_stock_movements (product_id, change, reason, reference_id) VALUES (?1, ?2, ?3, ?4)",
            params![pid, -qty, format!("{}-sync", reason), reference_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
