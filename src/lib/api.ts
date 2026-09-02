import { invoke } from "@tauri-apps/api/core";
import type {
  CreateCreditSaleInput,
  CreateExpenseInput,
  CreateMaterialInput,
  CreateSaleInput,
  CreditPaymentInput,
  CreditSale,
  CreditSaleDetail,
  CreditSaleSummary,
  DashboardStats,
  DbInfo,
  Expense,
  LicenseCheck,
  LicenseKey,
  ListExpensesParams,
  Material,
  Movement,
  NetProfitData,
  Product,
  ProductInput,
  ReportData,
  Sale,
  SaleDetail,
  SaleSummary,
  UpdateExpenseInput,
  UpdateMaterialInput,
  LicenseVerify,
} from "./types";

export const api = {
  // Materials
  listMaterials: () => invoke<Material[]>("list_materials"),
  createMaterial: (input: CreateMaterialInput) =>
    invoke<Material>("create_material", { input }),
  updateMaterial: (id: number, input: UpdateMaterialInput) =>
    invoke<Material>("update_material", { id, input }),
  deleteMaterial: (id: number) => invoke<void>("delete_material", { id }),
  adjustStock: (materialId: number, change: number, reason: string) =>
    invoke<Material>("adjust_stock", { materialId, change, reason }),
  receiveMaterial: (input: { materialId: number; quantity: number; costPerUnit: number }) =>
    invoke<Material>("receive_material", { input }),
  wasteMaterial: (input: { materialId: number; quantity: number; reason: string }) =>
    invoke<Material>("waste_material", { input }),
  internalConsumption: (input: { productId: number; quantity: number }) =>
    invoke<void>("internal_consumption", { input }),
  listMovements: (limit?: number) => invoke<Movement[]>("list_movements", { limit }),

  // Products
  listProducts: (includeInactive?: boolean) =>
    invoke<Product[]>("list_products", { includeInactive }),
  createProduct: (input: ProductInput) => invoke<Product>("create_product", { input }),
  updateProduct: (id: number, input: ProductInput) =>
    invoke<Product>("update_product", { id, input }),
  setProductActive: (id: number, active: boolean) =>
    invoke<void>("set_product_active", { id, active }),
  deleteProduct: (id: number) => invoke<void>("delete_product", { id }),

  // Sales
  createSale: (input: CreateSaleInput) => invoke<Sale>("create_sale", { input }),
  listSales: (from: string, to: string) => invoke<SaleSummary[]>("list_sales", { from, to }),
  getSale: (id: number) => invoke<SaleDetail>("get_sale", { id }),

  // Credit Sales
  createCreditSale: (input: CreateCreditSaleInput) => invoke<CreditSale>("create_credit_sale", { input }),
  listCreditSales: (status?: string) => invoke<CreditSaleSummary[]>("list_credit_sales", { status }),
  getCreditSale: (id: number) => invoke<CreditSaleDetail>("get_credit_sale", { id }),
  addCreditPayment: (input: CreditPaymentInput) => invoke<CreditSale>("add_credit_payment", { input }),

  // Stats & reports
  dashboardStats: () => invoke<DashboardStats>("dashboard_stats"),
  reportData: (from: string, to: string) => invoke<ReportData>("report_data", { from, to }),
  exportSalesCsv: (from: string, to: string, path: string) =>
    invoke<number>("export_sales_csv", { from, to, path }),
  writeFileBase64: (path: string, contentBase64: string) =>
    invoke<void>("write_file_base64", { path, contentBase64 }),

  // Backup
  backupDatabase: (path: string) => invoke<string>("backup_database", { path }),
  restoreDatabase: (path: string) => invoke<void>("restore_database", { path }),
  dbInfo: () => invoke<DbInfo>("db_info"),
  // Licensing
  licenseGenerate: (expiresDays?: number) => invoke<LicenseKey>("license_generate", { expiresDays }),
  licenseStatus: () => invoke<LicenseKey>("license_status"),
  licenseSign: (message: string) => invoke<string>("license_sign", { message }),
  licenseVerify: (signature: string, message: string) =>
    invoke<LicenseVerify>("license_verify", { signatureB64: signature, message }),
  licenseCheck: () => invoke<LicenseCheck>("license_check"),

  // Expenses
  listExpenses: (params?: ListExpensesParams) => invoke<Expense[]>("list_expenses", { params }),
  createExpense: (input: CreateExpenseInput) => invoke<Expense>("create_expense", { input }),
  updateExpense: (id: number, input: UpdateExpenseInput) =>
    invoke<Expense>("update_expense", { id, input }),
  deleteExpense: (id: number) => invoke<void>("delete_expense", { id }),
  getNetProfit: (from: string, to: string) => invoke<NetProfitData>("get_net_profit", { from, to }),

  // Auth - manager PIN
  managerPinExists: () => invoke<boolean>("manager_pin_exists"),
  verifyManagerPin: (pin: string) => invoke<boolean>("verify_manager_pin", { pin }),
  setManagerPin: (pin: string) => invoke<void>("set_manager_pin", { pin }),
  getManagerPinHint: () => invoke<string>("get_manager_pin_hint"),
};
