use rusqlite::{Connection, OptionalExtension};

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  unit TEXT NOT NULL DEFAULT 'u',
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  cost_per_unit REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL DEFAULT 'General',
  price REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  UNIQUE (product_id, material_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  change REAL NOT NULL,
  reason TEXT NOT NULL,
  reference_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_recipe_product ON recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_mov_material ON stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_mov_created ON stock_movements(created_at);
"#;

const MIGRATION_V2: &str = r#"
ALTER TABLE sale_items ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0;

UPDATE sale_items SET unit_cost = COALESCE((
  SELECT SUM(ri.quantity * m.cost_per_unit)
  FROM recipe_items ri
  JOIN materials m ON m.id = ri.material_id
  WHERE ri.product_id = sale_items.product_id
), 0)
WHERE product_id IS NOT NULL;
"#;

const MIGRATION_V3: &str = r#"
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const MIGRATION_V4: &str = r#"
CREATE TABLE IF NOT EXISTS credit_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  total REAL NOT NULL,
  paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS credit_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_sale_id INTEGER NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_sale_id INTEGER NOT NULL REFERENCES credit_sales(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_credit_sales_status ON credit_sales(status);
CREATE INDEX IF NOT EXISTS idx_credit_sales_client ON credit_sales(client_name);
CREATE INDEX IF NOT EXISTS idx_credit_payments_sale ON credit_payments(credit_sale_id);
"#;

const MIGRATION_V5: &str = r#"
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  reference_id INTEGER,
  reference_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
"#;

const MIGRATION_V6: &str = r#"
ALTER TABLE products ADD COLUMN tracks_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN stock REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN min_stock REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN manual_cost REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS productions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_material_cost REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS product_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change REAL NOT NULL,
  reason TEXT NOT NULL,
  reference_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_productions_product ON productions(product_id);
CREATE INDEX IF NOT EXISTS idx_productions_created ON productions(created_at);
CREATE INDEX IF NOT EXISTS idx_pmov_product ON product_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_pmov_created ON product_stock_movements(created_at);
"#;

const MIGRATION_V7: &str = r#"
-- El costo del producto por stock nace de su receta: recalcularlo para los
-- productos existentes que ya tenían receta.
UPDATE products SET manual_cost = (
  SELECT COALESCE(SUM(ri.quantity * m.cost_per_unit), products.manual_cost)
  FROM recipe_items ri JOIN materials m ON m.id = ri.material_id
  WHERE ri.product_id = products.id
)
WHERE tracks_stock = 1
  AND EXISTS (SELECT 1 FROM recipe_items WHERE product_id = products.id);
"#;

const MIGRATION_V8: &str = r#"
-- Materiales elaborados (ej. masa de hamburguesa): un material puede tener
-- receta de otros materiales. recipe_yield = cuánto rinde la receta base
-- en la unidad de stock del material resultado.
ALTER TABLE materials ADD COLUMN is_elaborated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN recipe_yield REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS material_recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  UNIQUE (material_id, component_id)
);

CREATE TABLE IF NOT EXISTS material_productions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  total_material_cost REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_mat_recipe_material ON material_recipe_items(material_id);
CREATE INDEX IF NOT EXISTS idx_mat_recipe_component ON material_recipe_items(component_id);
CREATE INDEX IF NOT EXISTS idx_mat_prod_material ON material_productions(material_id);
CREATE INDEX IF NOT EXISTS idx_mat_prod_created ON material_productions(created_at);
"#;

const MIGRATION_V9: &str = r#"
-- Costos extra por unidad (mano de obra, logistica, otros) que se suman
-- a la receta para que la ganancia quede limpia sin descontarlos despues.
-- amount = costo extra POR unidad de salida (unidad de stock del material
-- o unidad del producto). Se hornea en cost_per_unit / manual_cost / unit_cost.
CREATE TABLE IF NOT EXISTS material_extra_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'otro',
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_extra_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'otro',
  amount REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mat_extra_material ON material_extra_costs(material_id);
CREATE INDEX IF NOT EXISTS idx_prod_extra_product ON product_extra_costs(product_id);
"#;

const MIGRATION_V10: &str = r#"
-- Sync gerente <-> dependiente (Opcion C: catalogo down + ventas up).
-- uuid = identidad estable cross-device (id local sigue AUTOINCREMENT).
-- sync_meta = device_id, business_id, role, token, catalog_version, last_push...
-- synced_sales = ventas ya subidas al relay (cola pendientes = las que faltan).
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS synced_sales (
  local_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'sale',
  batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (local_id, kind)
);

-- Mapa origen->local para resolver pagos a credito que llegan despues.
-- origin_device + origin_kind + origin_local_id = clave estable del dependiente.
CREATE TABLE IF NOT EXISTS sale_origin_map (
  origin_device TEXT NOT NULL,
  origin_kind TEXT NOT NULL,
  origin_local_id INTEGER NOT NULL,
  local_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (origin_device, origin_kind, origin_local_id)
);
"#;

const MIGRATION_V11: &str = r#"
-- Usuarios locales y permisos por seccion. El propietario (is_owner=1) siempre
-- tiene acceso total; los demas usuarios solo a las secciones asignadas.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL DEFAULT 'usuario',
  access_level TEXT NOT NULL DEFAULT 'personalizado',
  pin_hash TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_owner INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner ON users(is_owner) WHERE is_owner = 1;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
"#;

pub(crate) fn seed_users(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?;
    let owner_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE is_owner = 1",
        [],
        |r| r.get(0),
    )?;
    if count > 0 && owner_count > 0 {
        // Si una migración anterior quedó a medias, no conservar el PIN en claro.
        let _ = conn.execute("DELETE FROM app_config WHERE key = 'manager_pin'", []);
        return Ok(());
    }

    let legacy_pin: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'manager_pin'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    let legacy_pin = legacy_pin.filter(|p| !p.trim().is_empty());
    let owner_hash = match legacy_pin.as_deref() {
        Some(pin) => Some(
            crate::security::hash_pin(pin)
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?,
        ),
        None => None,
    };

    // Propietario: conserva el PIN legado si existía; si no, lo crea al iniciar.
    conn.execute(
        "INSERT INTO users (name, role, access_level, pin_hash, active, is_owner)
         VALUES ('Gerente', 'gerente', 'gerente', ?1, 1, 1)",
        rusqlite::params![owner_hash],
    )?;

    if count == 0 {
        // Usuario por defecto para conservar el flujo actual de acceso rápido.
        conn.execute(
            "INSERT INTO users (name, role, access_level, pin_hash, active, is_owner)
             VALUES ('Dependiente', 'usuario', 'dependiente', NULL, 1, 0)",
            [],
        )?;
        let worker_id = conn.last_insert_rowid();
        for section in ["venta", "sincronizacion"] {
            conn.execute(
                "INSERT OR IGNORE INTO user_permissions (user_id, section) VALUES (?1, ?2)",
                rusqlite::params![worker_id, section],
            )?;
        }
    }

    // El PIN legado ya vive como hash en users; no dejar la copia en claro.
    conn.execute("DELETE FROM app_config WHERE key = 'manager_pin'", [])?;
    Ok(())
}

pub fn init_db(path: &std::path::Path) -> Result<Connection, Box<dyn std::error::Error>> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < 1 {
        conn.execute_batch(SCHEMA_V1)?;
        conn.pragma_update(None, "user_version", 1)?;
    }
    if version < 2 {
        conn.execute_batch(MIGRATION_V2)?;
        conn.pragma_update(None, "user_version", 2)?;
    }
    if version < 3 {
        conn.execute_batch(MIGRATION_V3)?;
        conn.pragma_update(None, "user_version", 3)?;
    }
    if version < 4 {
        conn.execute_batch(MIGRATION_V4)?;
        conn.pragma_update(None, "user_version", 4)?;
    }
    if version < 5 {
        conn.execute_batch(MIGRATION_V5)?;
        conn.pragma_update(None, "user_version", 5)?;
    }
    if version < 6 {
        conn.execute_batch(MIGRATION_V6)?;
        conn.pragma_update(None, "user_version", 6)?;
    }
    if version < 7 {
        conn.execute_batch(MIGRATION_V7)?;
        conn.pragma_update(None, "user_version", 7)?;
    }
    if version < 8 {
        conn.execute_batch(MIGRATION_V8)?;
        conn.pragma_update(None, "user_version", 8)?;
    }
    if version < 9 {
        conn.execute_batch(MIGRATION_V9)?;
        // Tolerar reintentos si la columna ya existe (migración parcial previa).
        for sql in [
            "ALTER TABLE material_productions ADD COLUMN total_extra_cost REAL NOT NULL DEFAULT 0",
            "ALTER TABLE productions ADD COLUMN total_extra_cost REAL NOT NULL DEFAULT 0",
        ] {
            match conn.execute_batch(sql) {
                Ok(_) => {},
                Err(e) => {
                    let msg = e.to_string();
                    if !(msg.contains("duplicate column") || msg.contains("already exists")) {
                        return Err(Box::new(e));
                    }
                }
            }
        }
        conn.pragma_update(None, "user_version", 9)?;
    }
    if version < 10 {
        conn.execute_batch(MIGRATION_V10)?;
        // Columnas uuid tolerando reintentos parciales.
        for sql in [
            "ALTER TABLE materials ADD COLUMN uuid TEXT",
            "ALTER TABLE products ADD COLUMN uuid TEXT",
        ] {
            match conn.execute_batch(sql) {
                Ok(_) => {},
                Err(e) => {
                    let msg = e.to_string();
                    if !(msg.contains("duplicate column") || msg.contains("already exists")) {
                        return Err(Box::new(e));
                    }
                }
            }
        }
        // Backfill uuid donde falte (hex random 16 bytes).
        conn.execute_batch(
            "UPDATE materials SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL OR uuid = '';\n\
             UPDATE products SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL OR uuid = '';\n\
             CREATE UNIQUE INDEX IF NOT EXISTS idx_mat_uuid ON materials(uuid);\n\
             CREATE UNIQUE INDEX IF NOT EXISTS idx_prod_uuid ON products(uuid);",
        )?;
        conn.pragma_update(None, "user_version", 10)?;
    }
    if version < 11 {
        conn.execute_batch(MIGRATION_V11)?;
        conn.pragma_update(None, "user_version", 11)?;
    }
    seed_users(conn)?;
    Ok(())
}

pub fn fmt_qty(n: f64) -> String {
    if !n.is_finite() {
        return "0".to_string();
    }
    // 6 decimales: suficiente para lb/oz/kg (0.000001 lb ≈ 0.0004 g) sin el
    // truncamiento a 3 que ocultaba stock real (ej. 539.130434 -> 539.13).
    let rounded = (n * 1_000_000.0).round() / 1_000_000.0;
    if rounded.fract() == 0.0 {
        format!("{:.0}", rounded)
    } else {
        let s = format!("{:.6}", rounded);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::OptionalExtension;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "tuorden-{label}-{}-{nanos}.db",
            std::process::id()
        ))
    }

    fn cleanup(path: &std::path::Path) {
        for suffix in ["", "-wal", "-shm"] {
            let mut name = path.as_os_str().to_os_string();
            name.push(suffix);
            let _ = std::fs::remove_file(name);
        }
    }

    #[test]
    fn migrates_legacy_manager_pin_to_owner_user() {
        let path = test_path("legacy-pin");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 INSERT INTO app_config (key, value) VALUES ('manager_pin', '1234');
                 PRAGMA user_version = 10;",
            )
            .unwrap();
        }
        {
            let conn = init_db(&path).unwrap();
            let (count, has_pin, pin_hash): (i64, i64, String) = conn
                .query_row(
                    "SELECT (SELECT COUNT(*) FROM users),
                            (SELECT pin_hash IS NOT NULL FROM users WHERE is_owner = 1),
                            (SELECT pin_hash FROM users WHERE is_owner = 1)",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .unwrap();
            assert_eq!(count, 2);
            assert_eq!(has_pin, 1);
            assert_ne!(pin_hash, "1234");
            assert!(crate::security::verify_pin("1234", &pin_hash));

            let legacy: Option<String> = conn
                .query_row(
                    "SELECT value FROM app_config WHERE key = 'manager_pin'",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .unwrap();
            assert!(legacy.is_none());
        }
        cleanup(&path);
    }

    #[test]
    fn seed_users_repairs_missing_owner() {
        let path = test_path("repair-owner");
        {
            let conn = init_db(&path).unwrap();
            conn.execute("DELETE FROM users WHERE is_owner = 1", [])
                .unwrap();
        }
        {
            let conn = init_db(&path).unwrap();
            let (count, owners): (i64, i64) = conn
                .query_row(
                    "SELECT (SELECT COUNT(*) FROM users),
                            (SELECT COUNT(*) FROM users WHERE is_owner = 1)",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(count, 2);
            assert_eq!(owners, 1);
        }
        cleanup(&path);
    }

    #[test]
    fn fresh_install_creates_owner_and_default_dependent() {
        let path = test_path("fresh");
        {
            let conn = init_db(&path).unwrap();
            let count: i64 = conn
                .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 2);

            let owner_pin: Option<String> = conn
                .query_row(
                    "SELECT pin_hash FROM users WHERE is_owner = 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert!(owner_pin.is_none());

            let permissions: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM user_permissions up
                     JOIN users u ON u.id = up.user_id
                     WHERE u.access_level = 'dependiente'
                       AND up.section IN ('venta', 'sincronizacion')",
                    [],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(permissions, 2);

            let version: i64 = conn
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .unwrap();
            assert_eq!(version, 11);
        }
        cleanup(&path);
    }
}
