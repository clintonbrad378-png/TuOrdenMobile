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
            commands::materials::receive_material,
            commands::materials::waste_material,
            commands::materials::internal_consumption,
            commands::products::list_products,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::set_product_active,
            commands::products::delete_product,
            commands::products::estimate_production,
            commands::products::produce_stock,
            commands::products::adjust_product_stock,
            commands::products::list_productions,
            commands::sales::create_sale,
            commands::sales::update_sale,
            commands::sales::delete_sale,
            commands::sales::list_sales,
            commands::sales::get_sale,
            commands::sales::create_credit_sale,
            commands::sales::list_credit_sales,
            commands::sales::get_credit_sale,
            commands::sales::add_credit_payment,
            commands::stats::dashboard_stats,
            commands::stats::report_data,
            commands::reports::export_sales_csv,
            commands::reports::write_file_base64,
            commands::backup::backup_database,
            commands::backup::restore_database,
            commands::backup::db_info,
            commands::auth::manager_pin_exists,
            commands::auth::verify_manager_pin,
            commands::auth::set_manager_pin,
            commands::auth::get_manager_pin_hint,
            commands::expenses::list_expenses,
            commands::expenses::create_expense,
            commands::expenses::update_expense,
            commands::expenses::delete_expense,
            commands::expenses::get_net_profit,
            licensing::license_generate,
            licensing::license_import,
            licensing::license_status,
            licensing::license_sign,
            licensing::license_verify,
            licensing::license_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
