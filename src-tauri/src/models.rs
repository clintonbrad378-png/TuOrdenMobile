use serde::{Deserialize, Serialize};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCost {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub amount: f64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExtraCostInput {
    pub name: String,
    pub kind: String,
    pub amount: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: i64,
    pub name: String,
    pub unit: String,
    pub stock: f64,
    pub min_stock: f64,
    pub cost_per_unit: f64,
    pub created_at: String,
    pub updated_at: String,
    pub is_elaborated: bool,
    pub recipe_yield: f64,
    pub recipe: Vec<MaterialRecipeItem>,
    #[serde(default)]
    pub extra_costs: Vec<ExtraCost>,
    #[serde(default)]
    pub extra_cost_per_unit: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialRecipeItem {
    pub material_id: i64,
    pub material_name: String,
    pub unit: String,
    pub quantity: f64,
    pub cost_per_unit: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialRecipeItemInput {
    pub component_id: i64,
    pub quantity: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaterialInput {
    pub name: String,
    pub unit: String,
    pub stock: f64,
    pub min_stock: f64,
    pub cost_per_unit: f64,
    #[serde(default)]
    pub is_elaborated: bool,
    #[serde(default)]
    pub recipe_yield: f64,
    #[serde(default)]
    pub recipe: Vec<MaterialRecipeItemInput>,
    #[serde(default)]
    pub extra_costs: Vec<ExtraCostInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMaterialInput {
    pub name: String,
    pub unit: String,
    pub min_stock: f64,
    pub cost_per_unit: f64,
    #[serde(default)]
    pub is_elaborated: bool,
    #[serde(default)]
    pub recipe_yield: f64,
    #[serde(default)]
    pub recipe: Vec<MaterialRecipeItemInput>,
    #[serde(default)]
    pub extra_costs: Vec<ExtraCostInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Movement {
    pub id: i64,
    pub material_name: String,
    pub change: f64,
    pub reason: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeItem {
    pub material_id: i64,
    pub material_name: String,
    pub unit: String,
    pub quantity: f64,
    pub cost_per_unit: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: i64,
    pub name: String,
    pub category: String,
    pub price: f64,
    pub active: bool,
    pub recipe: Vec<RecipeItem>,
    pub created_at: String,
    pub updated_at: String,
    pub tracks_stock: bool,
    pub stock: f64,
    pub min_stock: f64,
    pub manual_cost: f64,
    #[serde(default)]
    pub extra_costs: Vec<ExtraCost>,
    #[serde(default)]
    pub extra_cost_per_unit: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeItemInput {
    pub material_id: i64,
    pub quantity: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInput {
    pub name: String,
    pub category: String,
    pub price: f64,
    pub active: bool,
    pub recipe: Vec<RecipeItemInput>,
    #[serde(default)]
    pub tracks_stock: bool,
    #[serde(default)]
    pub stock: f64,
    #[serde(default)]
    pub min_stock: f64,
    #[serde(default)]
    pub manual_cost: f64,
    #[serde(default)]
    pub extra_costs: Vec<ExtraCostInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sale {
    pub id: i64,
    pub total: f64,
    pub payment_method: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleSummary {
    pub id: i64,
    pub total: f64,
    pub payment_method: String,
    pub item_count: i64,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemRow {
    pub id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub unit_price: f64,
    pub unit_cost: f64,
    pub quantity: i64,
    pub subtotal: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleDetail {
    #[serde(flatten)]
    pub sale: Sale,
    pub items: Vec<SaleItemRow>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemInput {
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSaleInput {
    pub items: Vec<SaleItemInput>,
    pub payment_method: String,
    pub note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSaleInput {
    pub id: i64,
    pub items: Vec<SaleItemInput>,
    pub payment_method: String,
    pub note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSale {
    pub id: i64,
    pub client_name: String,
    pub client_phone: Option<String>,
    pub total: f64,
    pub paid: f64,
    pub status: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleSummary {
    pub id: i64,
    pub client_name: String,
    pub client_phone: Option<String>,
    pub total: f64,
    pub paid: f64,
    pub balance: f64,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleItemRow {
    pub id: i64,
    pub credit_sale_id: i64,
    pub product_id: Option<i64>,
    pub product_name: String,
    pub unit_price: f64,
    pub unit_cost: f64,
    pub quantity: i64,
    pub subtotal: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleDetail {
    #[serde(flatten)]
    pub credit_sale: CreditSale,
    pub items: Vec<CreditSaleItemRow>,
    pub payments: Vec<CreditPayment>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPayment {
    pub id: i64,
    pub credit_sale_id: i64,
    pub amount: f64,
    pub payment_method: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditSaleItemInput {
    pub product_id: i64,
    pub quantity: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCreditSaleInput {
    pub client_name: String,
    pub client_phone: Option<String>,
    pub items: Vec<CreditSaleItemInput>,
    pub note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPaymentInput {
    pub credit_sale_id: i64,
    pub amount: f64,
    pub payment_method: String,
    pub note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayPoint {
    pub date: String,
    pub total: f64,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopProduct {
    pub name: String,
    pub qty: i64,
    pub total: f64,
    pub profit: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LowStock {
    pub id: i64,
    pub name: String,
    pub stock: f64,
    pub min_stock: f64,
    pub unit: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LowProductStock {
    pub id: i64,
    pub name: String,
    pub stock: f64,
    pub min_stock: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub today_total: f64,
    pub today_count: i64,
    pub today_items: i64,
    pub today_investment: f64,
    pub today_profit: f64,
    pub today_business_expenses: f64,
    pub today_merma_expenses: f64,
    pub today_net_profit: f64,
    pub week_total: f64,
    pub week_profit: f64,
    pub month_total: f64,
    pub month_profit: f64,
    pub avg_ticket: f64,
    pub sales_by_day: Vec<DayPoint>,
    pub top_products: Vec<TopProduct>,
    pub low_stock: Vec<LowStock>,
    pub low_product_stock: Vec<LowProductStock>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentTotal {
    pub method: String,
    pub total: f64,
    pub count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportData {
    pub from: String,
    pub to: String,
    pub total_sales: f64,
    pub total_investment: f64,
    pub total_profit: f64,
    pub total_business_expenses: f64,
    pub total_merma_expenses: f64,
    pub total_net_profit: f64,
    pub count_sales: i64,
    pub avg_ticket: f64,
    pub total_items: i64,
    pub by_day: Vec<DayPoint>,
    pub by_product: Vec<TopProduct>,
    pub by_payment: Vec<PaymentTotal>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbInfo {
    pub path: String,
    pub size_bytes: u64,
    pub materials: i64,
    pub products: i64,
    pub sales: i64,
}

// ---- Sync gerente <-> dependiente (Opcion C) ----
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncExtra {
    pub name: String,
    pub kind: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncMaterialRecipeRow {
    pub component_uuid: String,
    pub quantity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncMaterial {
    pub uuid: String,
    pub name: String,
    pub unit: String,
    pub stock: f64,
    pub min_stock: f64,
    pub cost_per_unit: f64,
    pub is_elaborated: bool,
    pub recipe_yield: f64,
    #[serde(default)]
    pub recipe: Vec<SyncMaterialRecipeRow>,
    #[serde(default)]
    pub extras: Vec<SyncExtra>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncProductRecipeRow {
    pub material_uuid: String,
    pub quantity: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncProduct {
    pub uuid: String,
    pub name: String,
    pub category: String,
    pub price: f64,
    pub active: bool,
    pub tracks_stock: bool,
    pub stock: f64,
    pub min_stock: f64,
    pub manual_cost: f64,
    #[serde(default)]
    pub recipe: Vec<SyncProductRecipeRow>,
    #[serde(default)]
    pub extras: Vec<SyncExtra>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPayload {
    pub version: i64,
    #[serde(default)]
    pub materials: Vec<SyncMaterial>,
    #[serde(default)]
    pub products: Vec<SyncProduct>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingSaleItem {
    pub product_uuid: Option<String>,
    pub product_name: String,
    pub unit_price: f64,
    pub unit_cost: f64,
    pub quantity: i64,
    pub subtotal: f64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingPayment {
    pub amount: f64,
    pub payment_method: String,
    pub note: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingSale {
    pub local_id: i64,
    pub kind: String,
    pub total: f64,
    pub payment_method: Option<String>,
    pub client_name: Option<String>,
    pub client_phone: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub items: Vec<PendingSaleItem>,
    #[serde(default)]
    pub payments: Vec<PendingPayment>,
    /// Para kind=credit_payment: local_id de la venta a credito origen (en el dependiente)
    pub origin_credit_local_id: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchInput {
    pub origin_device: String,
    pub origin_label: Option<String>,
    pub sale: PendingSale,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchResult {
    pub local_id: i64,
    pub had_conflict: bool,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub device_id: String,
    pub business_id: Option<String>,
    pub role: String,
    pub catalog_version: i64,
    pub pending_out: i64,
    pub pending_detail: Vec<PendingSale>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncBusinessInput {
    pub business_id: String,
    pub role: String,
    pub token: Option<String>,
    pub label: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Expense {
    pub id: i64,
    pub name: String,
    pub amount: f64,
    pub category: String,
    pub description: Option<String>,
    pub reference_id: Option<i64>,
    pub reference_type: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExpenseInput {
    pub name: String,
    pub amount: f64,
    pub category: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExpenseInput {
    pub name: String,
    pub amount: f64,
    pub category: String,
    pub description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetProfitData {
    pub gross_profit: f64,
    pub business_expenses: f64,
    pub merma_expenses: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Production {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub quantity: f64,
    pub unit_cost: f64,
    pub total_material_cost: f64,
    #[serde(default)]
    pub total_extra_cost: f64,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProduceStockInput {
    pub product_id: i64,
    pub quantity: f64,
    pub note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustProductStockInput {
    pub product_id: i64,
    pub change: f64,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionEstimateItem {
    pub material_id: i64,
    pub material_name: String,
    pub unit: String,
    pub stock: f64,
    pub required_per_unit: f64,
    pub max_units: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionEstimate {
    pub product_id: i64,
    pub product_name: String,
    pub max_units: i64,
    pub limiting_material: Option<String>,
    pub items: Vec<ProductionEstimateItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialProduction {
    pub id: i64,
    pub material_id: i64,
    pub material_name: String,
    pub quantity: f64,
    pub unit: String,
    pub unit_cost: f64,
    pub total_material_cost: f64,
    #[serde(default)]
    pub total_extra_cost: f64,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProduceMaterialInput {
    pub material_id: i64,
    pub quantity: f64,
    pub note: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialProductionEstimateItem {
    pub material_id: i64,
    pub material_name: String,
    pub unit: String,
    pub stock: f64,
    pub cost_per_unit: f64,
    pub base_quantity: f64,
    pub required_per_unit: f64,
    pub max_output: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialProductionEstimate {
    pub material_id: i64,
    pub material_name: String,
    pub unit: String,
    pub recipe_yield: f64,
    pub max_output: f64,
    pub limiting_material: Option<String>,
    pub total_batch_cost: f64,
    pub unit_cost: f64,
    #[serde(default)]
    pub extra_cost_per_unit: f64,
    #[serde(default)]
    pub total_extra_batch_cost: f64,
    pub items: Vec<MaterialProductionEstimateItem>,
}
