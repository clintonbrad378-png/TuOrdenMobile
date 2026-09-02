use crate::models::*;
use crate::AppState;
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

const EXPENSE_COLS: &str =
    "id, name, amount, category, description, reference_id, reference_type, created_at, updated_at";

fn map_expense(row: &rusqlite::Row) -> rusqlite::Result<Expense> {
    Ok(Expense {
        id: row.get(0)?,
        name: row.get(1)?,
        amount: row.get(2)?,
        category: row.get(3)?,
        description: row.get(4)?,
        reference_id: row.get(5)?,
        reference_type: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_expense(name: &str, amount: f64, category: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("El nombre del gasto es obligatorio".into());
    }
    if amount <= 0.0 {
        return Err("El monto debe ser mayor a cero".into());
    }
    if category.trim().is_empty() {
        return Err("La categoría es obligatoria".into());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListExpensesParams {
    limit: Option<i64>,
    category: Option<String>,
    from: Option<String>,
    to: Option<String>,
}

impl Default for ListExpensesParams {
    fn default() -> Self {
        Self {
            limit: None,
            category: None,
            from: None,
            to: None,
        }
    }
}

#[tauri::command]
pub async fn list_expenses(
    state: State<'_, AppState>,
    params: Option<ListExpensesParams>,
) -> Result<Vec<Expense>, String> {
    let params = params.unwrap_or_default();
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let mut conditions = Vec::new();
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(cat) = params.category {
        conditions.push("category = ?");
        args.push(Box::new(cat));
    }
    if let Some(from) = params.from {
        conditions.push("date(created_at) >= date(?)");
        args.push(Box::new(from));
    }
    if let Some(to) = params.to {
        conditions.push("date(created_at) <= date(?)");
        args.push(Box::new(to));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let limit = params.limit.unwrap_or(200).clamp(1, 1000);
    let sql = format!(
        "SELECT {EXPENSE_COLS} FROM expenses {where_clause} ORDER BY date(created_at) DESC, id DESC LIMIT ?",
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut arg_refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|a| a.as_ref()).collect();
    arg_refs.push(&limit);

    let rows = stmt
        .query_map(rusqlite::params_from_iter(arg_refs), |r| map_expense(r))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_expense(
    state: State<'_, AppState>,
    input: CreateExpenseInput,
) -> Result<Expense, String> {
    let name = input.name.trim().to_string();
    let category = input.category.trim().to_string();
    validate_expense(&name, input.amount, &category)?;

    let conn = state.db.lock().map_err(|_| "Error interno")?;

    conn.execute(
        "INSERT INTO expenses (name, amount, category, description) VALUES (?1, ?2, ?3, ?4)",
        params![name, input.amount, category, input.description],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    conn.query_row(
        &format!("SELECT {EXPENSE_COLS} FROM expenses WHERE id = ?1"),
        params![id],
        |r| map_expense(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_expense(
    state: State<'_, AppState>,
    id: i64,
    input: UpdateExpenseInput,
) -> Result<Expense, String> {
    let name = input.name.trim().to_string();
    let category = input.category.trim().to_string();
    validate_expense(&name, input.amount, &category)?;

    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let updated = conn
        .execute(
            "UPDATE expenses SET name = ?1, amount = ?2, category = ?3, description = ?4, updated_at = datetime('now','localtime') WHERE id = ?5",
            params![name, input.amount, category, input.description, id],
        )
        .map_err(|e| e.to_string())?;

    if updated == 0 {
        return Err("Gasto no encontrado".into());
    }

    conn.query_row(
        &format!("SELECT {EXPENSE_COLS} FROM expenses WHERE id = ?1"),
        params![id],
        |r| map_expense(r),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_expense(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let deleted = conn
        .execute("DELETE FROM expenses WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if deleted == 0 {
        return Err("Gasto no encontrado".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_net_profit(
    state: State<'_, AppState>,
    from: String,
    to: String,
) -> Result<NetProfitData, String> {
    if from.len() != 10 || to.len() != 10 {
        return Err("Formato de fecha inválido (se espera AAAA-MM-DD)".into());
    }

    let conn = state.db.lock().map_err(|_| "Error interno")?;

    let gross_profit: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(si.subtotal - si.unit_cost * si.quantity), 0)
             FROM sale_items si JOIN sales s ON s.id = si.sale_id
             WHERE date(s.created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let business_expenses: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM expenses
             WHERE category != 'merma' AND date(created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let merma_expenses: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM expenses
             WHERE category = 'merma' AND date(created_at) BETWEEN ?1 AND ?2",
            params![from, to],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let total_expenses = business_expenses + merma_expenses;
    let net_profit = gross_profit - total_expenses;

    Ok(NetProfitData {
        gross_profit,
        business_expenses,
        merma_expenses,
        total_expenses,
        net_profit,
    })
}