use crate::models::*;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use std::collections::HashMap;
use tauri::State;

fn normalize_payment(method: &str) -> String {
    match method.to_lowercase().as_str() {
        "efectivo" => "efectivo".into(),
        "transferencia" => "transferencia".into(),
        _ => "otro".into(),
    }
}

fn valid_date(s: &str) -> bool {
    s.len() == 10
        && s.as_bytes().iter().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                *b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
}

struct LineRow {
    name: String,
    price: f64,
    qty: i64,
    subtotal: f64,
    unit_cost: f64,
}

#[tauri::command]
pub async fn create_sale(
    state: State<'_, AppState>,
    input: CreateSaleInput,
) -> Result<Sale, String> {
    if input.items.is_empty() {
        return Err("El carrito está vacío".into());
    }
    let method = normalize_payment(&input.payment_method);

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // Aggregate material needs and build sale lines from DB prices.
    let mut needs: HashMap<i64, f64> = HashMap::new();
    let mut lines: Vec<LineRow> = Vec::with_capacity(input.items.len());
    let mut total = 0f64;

    let mut prod_stmt = tx
        .prepare("SELECT name, price FROM products WHERE id = ?1 AND active = 1")
        .map_err(|e| e.to_string())?;
    for item in &input.items {
        if item.quantity <= 0 {
            return Err("Las cantidades deben ser mayores a cero".into());
        }
        let (name, price): (String, f64) = prod_stmt
            .query_row(params![item.product_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Producto no disponible (id {})", item.product_id))?;

        let subtotal = price * item.quantity as f64;
        total += subtotal;
        lines.push(LineRow {
            name,
            price,
            qty: item.quantity,
            subtotal,
            unit_cost: 0.0,
        });
    }
    drop(prod_stmt);

    // Snapshot the recipe cost per product at the moment of the sale.
    {
        let mut cost_stmt = tx
            .prepare(
                "SELECT COALESCE(SUM(ri.quantity * m.cost_per_unit), 0)
                 FROM recipe_items ri JOIN materials m ON m.id = ri.material_id
                 WHERE ri.product_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        for (item, line) in input.items.iter().zip(lines.iter_mut()) {
            line.unit_cost = cost_stmt
                .query_row(params![item.product_id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
        }
    }

    let mut recipe_stmt = tx
        .prepare("SELECT material_id, quantity FROM recipe_items WHERE product_id = ?1")
        .map_err(|e| e.to_string())?;
    for item in &input.items {
        let rows = recipe_stmt
            .query_map(params![item.product_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (material_id, qty_per_unit) = row.map_err(|e| e.to_string())?;
            *needs.entry(material_id).or_insert(0.0) += qty_per_unit * item.quantity as f64;
        }
    }
    drop(recipe_stmt);

    // Verify stock before touching anything.
    let mut shortages: Vec<String> = Vec::new();
    {
        let mut mat_stmt = tx
            .prepare("SELECT name, stock FROM materials WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        for (material_id, needed) in &needs {
            let (mname, stock): (String, f64) = mat_stmt
                .query_row(params![material_id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Material no encontrado en la receta".to_string())?;
            if stock < *needed {
                shortages.push(format!(
                    "{}: necesitas {}, disponible {}",
                    mname,
                    crate::db::fmt_qty(*needed),
                    crate::db::fmt_qty(stock)
                ));
            }
        }
    }
    if !shortages.is_empty() {
        return Err(format!(
            "Stock insuficiente · {}",
            shortages.join("  ·  ")
        ));
    }

    // Insert sale header.
    let (sale_id, created_at): (i64, String) = tx
        .query_row(
            "INSERT INTO sales (total, payment_method, note) VALUES (?1, ?2, ?3) RETURNING id, created_at",
            params![total, method, input.note],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Deduct stock + record movements.
    {
        let mut upd = tx
            .prepare("UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2")
            .map_err(|e| e.to_string())?;
        let mut mov = tx
            .prepare(
                "INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, 'venta', ?3)",
            )
            .map_err(|e| e.to_string())?;
        for (material_id, needed) in &needs {
            upd.execute(params![needed, material_id])
                .map_err(|e| e.to_string())?;
            mov.execute(params![material_id, -needed, sale_id])
                .map_err(|e| e.to_string())?;
        }
    }

    // Insert sale items snapshot.
    {
        let mut ins = tx
            .prepare(
                "INSERT INTO sale_items (sale_id, product_id, product_name, unit_price, unit_cost, quantity, subtotal) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;
        for (item, line) in input.items.iter().zip(lines.iter()) {
            ins.execute(params![
                sale_id,
                item.product_id,
                line.name,
                line.price,
                line.unit_cost,
                line.qty,
                line.subtotal
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(Sale {
        id: sale_id,
        total,
        payment_method: method,
        note: input.note.clone(),
        created_at,
    })
}

#[tauri::command]
pub async fn list_sales(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<Vec<SaleSummary>, String> {
    if !valid_date(&from) || !valid_date(&to) {
        return Err("Formato de fecha inválido (se espera AAAA-MM-DD)".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.total, s.payment_method,
                    (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id),
                    s.created_at
             FROM sales s
             WHERE date(s.created_at) BETWEEN ?1 AND ?2
             ORDER BY s.id DESC
             LIMIT 1000",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            Ok(SaleSummary {
                id: r.get(0)?,
                total: r.get(1)?,
                payment_method: r.get(2)?,
                item_count: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sale(state: State<'_, AppState>, id: i64) -> Result<SaleDetail, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let sale = conn
        .query_row(
            "SELECT id, total, payment_method, note, created_at FROM sales WHERE id = ?1",
            params![id],
            |r| {
                Ok(Sale {
                    id: r.get(0)?,
                    total: r.get(1)?,
                    payment_method: r.get(2)?,
                    note: r.get(3)?,
                    created_at: r.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Venta no encontrada".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, product_id, product_name, unit_price, unit_cost, quantity, subtotal
             FROM sale_items WHERE sale_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], |r| {
            Ok(SaleItemRow {
                id: r.get(0)?,
                product_id: r.get(1)?,
                product_name: r.get(2)?,
                unit_price: r.get(3)?,
                unit_cost: r.get(4)?,
                quantity: r.get(5)?,
                subtotal: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(SaleDetail { sale, items })
}

struct CreditLineRow {
    name: String,
    price: f64,
    qty: i64,
    subtotal: f64,
    unit_cost: f64,
}

#[tauri::command]
pub async fn create_credit_sale(
    state: State<'_, AppState>,
    input: CreateCreditSaleInput,
) -> Result<CreditSale, String> {
    if input.items.is_empty() {
        return Err("El carrito está vacío".into());
    }
    if input.client_name.trim().is_empty() {
        return Err("El nombre del cliente es obligatorio".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let mut needs: HashMap<i64, f64> = HashMap::new();
    let mut lines: Vec<CreditLineRow> = Vec::with_capacity(input.items.len());
    let mut total = 0f64;

    let mut prod_stmt = tx
        .prepare("SELECT name, price FROM products WHERE id = ?1 AND active = 1")
        .map_err(|e| e.to_string())?;
    for item in &input.items {
        if item.quantity <= 0 {
            return Err("Las cantidades deben ser mayores a cero".into());
        }
        let (name, price): (String, f64) = prod_stmt
            .query_row(params![item.product_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Producto no disponible (id {})", item.product_id))?;

        let subtotal = price * item.quantity as f64;
        total += subtotal;
        lines.push(CreditLineRow {
            name,
            price,
            qty: item.quantity,
            subtotal,
            unit_cost: 0.0,
        });
    }
    drop(prod_stmt);

    {
        let mut cost_stmt = tx
            .prepare(
                "SELECT COALESCE(SUM(ri.quantity * m.cost_per_unit), 0)
                 FROM recipe_items ri JOIN materials m ON m.id = ri.material_id
                 WHERE ri.product_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        for (item, line) in input.items.iter().zip(lines.iter_mut()) {
            line.unit_cost = cost_stmt
                .query_row(params![item.product_id], |r| r.get(0))
                .map_err(|e| e.to_string())?;
        }
    }

    let mut recipe_stmt = tx
        .prepare("SELECT material_id, quantity FROM recipe_items WHERE product_id = ?1")
        .map_err(|e| e.to_string())?;
    for item in &input.items {
        let rows = recipe_stmt
            .query_map(params![item.product_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (material_id, qty_per_unit) = row.map_err(|e| e.to_string())?;
            *needs.entry(material_id).or_insert(0.0) += qty_per_unit * item.quantity as f64;
        }
    }
    drop(recipe_stmt);

    let mut shortages: Vec<String> = Vec::new();
    {
        let mut mat_stmt = tx
            .prepare("SELECT name, stock FROM materials WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        for (material_id, needed) in &needs {
            let (mname, stock): (String, f64) = mat_stmt
                .query_row(params![material_id], |r| Ok((r.get(0)?, r.get(1)?)))
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Material no encontrado en la receta".to_string())?;
            if stock < *needed {
                shortages.push(format!(
                    "{}: necesitas {}, disponible {}",
                    mname,
                    crate::db::fmt_qty(*needed),
                    crate::db::fmt_qty(stock)
                ));
            }
        }
    }
    if !shortages.is_empty() {
        return Err(format!(
            "Stock insuficiente · {}",
            shortages.join("  ·  ")
        ));
    }

    let (sale_id, created_at): (i64, String) = tx
        .query_row(
            "INSERT INTO credit_sales (client_name, client_phone, total, paid, status, note) VALUES (?1, ?2, ?3, 0, 'pendiente', ?4) RETURNING id, created_at",
            params![input.client_name.trim(), input.client_phone, total, input.note],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    {
        let mut upd = tx
            .prepare("UPDATE materials SET stock = stock - ?1, updated_at = datetime('now','localtime') WHERE id = ?2")
            .map_err(|e| e.to_string())?;
        let mut mov = tx
            .prepare(
                "INSERT INTO stock_movements (material_id, change, reason, reference_id) VALUES (?1, ?2, 'venta_credito', ?3)",
            )
            .map_err(|e| e.to_string())?;
        for (material_id, needed) in &needs {
            upd.execute(params![needed, material_id])
                .map_err(|e| e.to_string())?;
            mov.execute(params![material_id, -needed, sale_id])
                .map_err(|e| e.to_string())?;
        }
    }

    {
        let mut ins = tx
            .prepare(
                "INSERT INTO credit_sale_items (credit_sale_id, product_id, product_name, unit_price, unit_cost, quantity, subtotal) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;
        for (item, line) in input.items.iter().zip(lines.iter()) {
            ins.execute(params![
                sale_id,
                item.product_id,
                line.name,
                line.price,
                line.unit_cost,
                line.qty,
                line.subtotal
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(CreditSale {
        id: sale_id,
        client_name: input.client_name.trim().to_string(),
        client_phone: input.client_phone,
        total,
        paid: 0.0,
        status: "pendiente".to_string(),
        note: input.note,
        created_at: created_at.clone(),
        updated_at: created_at,
    })
}

#[tauri::command]
pub async fn list_credit_sales(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<CreditSaleSummary>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let where_clause = if let Some(s) = status {
        if ["pendiente", "parcial", "pagado"].contains(&s.as_str()) {
            format!("WHERE cs.status = '{}'", s)
        } else {
            "".to_string()
        }
    } else {
        "WHERE cs.status != 'pagado'".to_string()
    };

    let query = format!(
        "SELECT cs.id, cs.client_name, cs.client_phone, cs.total, cs.paid, cs.status, cs.created_at
         FROM credit_sales cs
         {}
         ORDER BY cs.id DESC
         LIMIT 500",
        where_clause
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            let total: f64 = r.get(3)?;
            let paid: f64 = r.get(4)?;
            Ok(CreditSaleSummary {
                id: r.get(0)?,
                client_name: r.get(1)?,
                client_phone: r.get(2)?,
                total,
                paid,
                balance: total - paid,
                status: r.get(5)?,
                created_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_credit_sale(state: State<'_, AppState>, id: i64) -> Result<CreditSaleDetail, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let credit_sale = conn
        .query_row(
            "SELECT id, client_name, client_phone, total, paid, status, note, created_at, updated_at FROM credit_sales WHERE id = ?1",
            params![id],
            |r| {
                Ok(CreditSale {
                    id: r.get(0)?,
                    client_name: r.get(1)?,
                    client_phone: r.get(2)?,
                    total: r.get(3)?,
                    paid: r.get(4)?,
                    status: r.get(5)?,
                    note: r.get(6)?,
                    created_at: r.get(7)?,
                    updated_at: r.get(8)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Venta a crédito no encontrada".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, credit_sale_id, product_id, product_name, unit_price, unit_cost, quantity, subtotal
             FROM credit_sale_items WHERE credit_sale_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], |r| {
            Ok(CreditSaleItemRow {
                id: r.get(0)?,
                credit_sale_id: r.get(1)?,
                product_id: r.get(2)?,
                product_name: r.get(3)?,
                unit_price: r.get(4)?,
                unit_cost: r.get(5)?,
                quantity: r.get(6)?,
                subtotal: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, credit_sale_id, amount, payment_method, note, created_at
             FROM credit_payments WHERE credit_sale_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], |r| {
            Ok(CreditPayment {
                id: r.get(0)?,
                credit_sale_id: r.get(1)?,
                amount: r.get(2)?,
                payment_method: r.get(3)?,
                note: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let payments = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(CreditSaleDetail { credit_sale, items, payments })
}

#[tauri::command]
pub async fn add_credit_payment(
    state: State<'_, AppState>,
    input: CreditPaymentInput,
) -> Result<CreditSale, String> {
    if input.amount <= 0.0 {
        return Err("El monto debe ser mayor a cero".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let (total, paid, client_name, client_phone, note, created_at): (f64, f64, String, Option<String>, Option<String>, String) = tx
        .query_row(
            "SELECT total, paid, client_name, client_phone, note, created_at FROM credit_sales WHERE id = ?1",
            params![input.credit_sale_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Venta a crédito no encontrada".to_string())?;

    let new_paid = paid + input.amount;
    if new_paid > total {
        return Err(format!("El pago excede el saldo pendiente (saldo: {})", crate::db::fmt_qty(total - paid)));
    }

    let new_status = if new_paid >= total { "pagado" } else if new_paid > 0.0 { "parcial" } else { "pendiente" };

    tx.execute(
        "UPDATE credit_sales SET paid = ?1, status = ?2, updated_at = datetime('now','localtime') WHERE id = ?3",
        params![new_paid, new_status, input.credit_sale_id],
    )
    .map_err(|e| e.to_string())?;

    let method = normalize_payment(&input.payment_method);
    tx.execute(
        "INSERT INTO credit_payments (credit_sale_id, amount, payment_method, note) VALUES (?1, ?2, ?3, ?4)",
        params![input.credit_sale_id, input.amount, method, input.note],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(CreditSale {
        id: input.credit_sale_id,
        client_name,
        client_phone,
        total,
        paid: new_paid,
        status: new_status.to_string(),
        note,
        created_at: created_at.clone(),
        updated_at: created_at,
    })
}
