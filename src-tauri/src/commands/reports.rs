use crate::AppState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::params;
use std::io::Write;
use tauri::State;

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains(';') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

#[tauri::command]
pub async fn export_sales_csv(
    state: State<'_, AppState>,
    from: String,
    to: String,
    path: String,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|_| "Error interno")?;
    let mut stmt = conn
        .prepare(
            "SELECT s.created_at, s.id, si.product_name, si.quantity, si.unit_price, si.subtotal, s.payment_method
             FROM sales s JOIN sale_items si ON si.sale_id = s.id
             WHERE date(s.created_at) BETWEEN ?1 AND ?2
             ORDER BY s.created_at, s.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![from, to], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, f64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut out = String::from("\u{FEFF}");
    out.push_str("Fecha;Id venta;Producto;Cantidad;Precio unitario;Subtotal;Metodo de pago\r\n");
    let mut count = 0i64;
    for row in rows {
        let (created_at, id, product, qty, price, subtotal, method) =
            row.map_err(|e| e.to_string())?;
        out.push_str(&format!(
            "{};{};{};{};{:.2};{:.2};{}\r\n",
            created_at,
            id,
            csv_escape(&product),
            qty,
            price,
            subtotal,
            csv_escape(&method)
        ));
        count += 1;
    }

    let mut file = std::fs::File::create(&path).map_err(|e| format!("No se pudo crear el archivo: {e}"))?;
    file.write_all(out.as_bytes())
        .map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;

    Ok(count)
}

#[tauri::command]
pub async fn write_file_base64(path: String, content_base64: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(content_base64.trim())
        .map_err(|e| format!("Contenido base64 inválido: {e}"))?;

    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("No se pudo crear la carpeta destino: {e}"))?;
        }
    }

    std::fs::write(&path, bytes).map_err(|e| format!("No se pudo escribir el archivo: {e}"))?;
    Ok(())
}
