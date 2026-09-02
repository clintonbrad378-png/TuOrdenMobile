use crate::models::*;
use crate::AppState;
use rusqlite::params;
use tauri::State;

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

fn get_expenses_for_period(
    conn: &rusqlite::Connection,
    date_condition: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<(f64, f64), String> {
    let business_expenses: f64 = conn
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE category != 'merma' AND {date_condition}"
            ),
            params,
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let merma_expenses: f64 = conn
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE category = 'merma' AND {date_condition}"
            ),
            params,
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok((business_expenses, merma_expenses))
}

#[tauri::command]
pub async fn dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let (today_total, today_count): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0), COUNT(*) FROM sales WHERE date(created_at) = date('now','localtime')",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let today_items: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) = date('now','localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let week_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales WHERE date(created_at) >= date('now','localtime','-6 days')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let month_total: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0) FROM sales WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m','now','localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Investment = material cost snapshot per item; profit = subtotal - investment.
    let today_investment: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) = date('now','localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let today_profit = today_total - today_investment;

    let week_profit: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.subtotal - si.unit_cost * si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) >= date('now','localtime','-6 days')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let month_profit: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.subtotal - si.unit_cost * si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE strftime('%Y-%m', s.created_at) = strftime('%Y-%m','now','localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut sales_by_day = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "WITH RECURSIVE days(d) AS (
                    SELECT date('now','localtime','-6 days')
                    UNION ALL SELECT date(d,'+1 day') FROM days WHERE d < date('now','localtime')
                 )
                 SELECT d,
                        COALESCE(SUM(s.total), 0),
                        COUNT(s.id)
                 FROM days LEFT JOIN sales s ON date(s.created_at) = d
                 GROUP BY d ORDER BY d",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DayPoint {
                    date: r.get(0)?,
                    total: r.get(1)?,
                    count: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            sales_by_day.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut top_products = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT si.product_name, SUM(si.quantity), SUM(si.subtotal),
                        SUM(si.subtotal - si.unit_cost * si.quantity)
                 FROM sale_items si JOIN sales s ON s.id = si.sale_id
                 WHERE date(s.created_at) >= date('now','localtime','-29 days')
                 GROUP BY si.product_name
                 ORDER BY SUM(si.quantity) DESC
                 LIMIT 5",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(TopProduct {
                    name: r.get(0)?,
                    qty: r.get(1)?,
                    total: r.get(2)?,
                    profit: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            top_products.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut low_stock = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, stock, min_stock, unit FROM materials
                 WHERE min_stock > 0 AND stock <= min_stock
                 ORDER BY CASE WHEN stock <= 0 THEN 0 ELSE 1 END, stock / min_stock ASC
                 LIMIT 10",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(LowStock {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    stock: r.get(2)?,
                    min_stock: r.get(3)?,
                    unit: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            low_stock.push(row.map_err(|e| e.to_string())?);
        }
    }

    let month_start = "date('now','localtime','start of month')";
    let (month_business_expenses, month_merma_expenses) =
        get_expenses_for_period(&conn, &format!("date(created_at) >= {month_start}"), &[])?;
    let month_net_profit = month_profit - month_business_expenses - month_merma_expenses;

    let avg_ticket = if today_count > 0 {
        today_total / today_count as f64
    } else {
        0.0
    };

    Ok(DashboardStats {
        today_total,
        today_count,
        today_items,
        today_investment,
        today_profit,
        today_business_expenses: month_business_expenses,
        today_merma_expenses: month_merma_expenses,
        today_net_profit: month_net_profit,
        week_total,
        week_profit,
        month_total,
        month_profit,
        avg_ticket,
        sales_by_day,
        top_products,
        low_stock,
    })
}

#[tauri::command]
pub async fn report_data(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<ReportData, String> {
    if !valid_date(&from) || !valid_date(&to) {
        return Err("Formato de fecha inválido (se espera AAAA-MM-DD)".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let (total_sales, count_sales): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total), 0), COUNT(*) FROM sales WHERE date(created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let total_items: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Investment (material cost) and profit for the whole period.
    let total_investment: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let total_profit = total_sales - total_investment;

    let mut by_day = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "WITH RECURSIVE days(d) AS (
                    SELECT date(?1)
                    UNION ALL SELECT date(d,'+1 day') FROM days WHERE d < date(?2)
                 )
                 SELECT d,
                        COALESCE(SUM(s.total), 0),
                        COUNT(s.id)
                 FROM days LEFT JOIN sales s ON date(s.created_at) = d
                 GROUP BY d ORDER BY d",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![from, to], |r| {
                Ok(DayPoint {
                    date: r.get(0)?,
                    total: r.get(1)?,
                    count: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            by_day.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut by_product = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT si.product_name, SUM(si.quantity), SUM(si.subtotal),
                        SUM(si.subtotal - si.unit_cost * si.quantity)
                 FROM sale_items si JOIN sales s ON s.id = si.sale_id
                 WHERE date(s.created_at) BETWEEN ?1 AND ?2
                 GROUP BY si.product_name
                 ORDER BY SUM(si.subtotal) DESC
                 LIMIT 20",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![from, to], |r| {
                Ok(TopProduct {
                    name: r.get(0)?,
                    qty: r.get(1)?,
                    total: r.get(2)?,
                    profit: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            by_product.push(row.map_err(|e| e.to_string())?);
        }
    }

    let mut by_payment = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT payment_method, COALESCE(SUM(total), 0), COUNT(*)
                 FROM sales WHERE date(created_at) BETWEEN ?1 AND ?2
                 GROUP BY payment_method ORDER BY SUM(total) DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![from, to], |r| {
                Ok(PaymentTotal {
                    method: r.get(0)?,
                    total: r.get(1)?,
                    count: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            by_payment.push(row.map_err(|e| e.to_string())?);
        }
    }

    let avg_ticket = if count_sales > 0 {
        total_sales / count_sales as f64
    } else {
        0.0
    };

    let (total_business_expenses, total_merma_expenses) =
        get_expenses_for_period(&conn, "date(created_at) BETWEEN ?1 AND ?2", &[&from, &to])?;
    let total_net_profit = total_profit - total_business_expenses - total_merma_expenses;

    Ok(ReportData {
        from,
        to,
        total_sales,
        total_investment,
        total_profit,
        total_business_expenses,
        total_merma_expenses,
        total_net_profit,
        count_sales,
        avg_ticket,
        total_items,
        by_day,
        by_product,
        by_payment,
    })
}
