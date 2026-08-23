mod commands;
mod db;
mod licensing;
mod models;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::init_db(&dir.join("tuorden.db"))?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::materials::list_materials,
            commands::materials::create_material,
            commands::materials::update_material,
            commands::materials::delete_material,
            commands::materials::adjust_stock,
            commands::materials::list_movements,
            commands::products::list_products,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::set_product_active,
            commands::products::delete_product,
            commands::sales::create_sale,
            commands::sales::list_sales,
            commands::sales::get_sale,
            commands::stats::dashboard_stats,
            commands::stats::report_data,
            commands::reports::export_sales_csv,
            commands::backup::backup_database,
            commands::backup::restore_database,
            commands::backup::db_info,
            licensing::license_generate,
            licensing::license_verify,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
