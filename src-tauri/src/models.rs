use serde::{Deserialize, Serialize};

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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMaterialInput {
    pub name: String,
    pub unit: String,
    pub stock: f64,
    pub min_stock: f64,
    pub cost_per_unit: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMaterialInput {
    pub name: String,
    pub unit: String,
    pub min_stock: f64,
    pub cost_per_unit: f64,
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
