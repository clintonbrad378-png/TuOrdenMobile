import { invoke } from "@tauri-apps/api/core";
import type {
  CreateMaterialInput,
  CreateSaleInput,
  DashboardStats,
  DbInfo,
  LicenseKey,
  Material,
  Movement,
  Product,
  ProductInput,
  ReportData,
  Sale,
  SaleDetail,
  SaleSummary,
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

  // Stats & reports
  dashboardStats: () => invoke<DashboardStats>("dashboard_stats"),
  reportData: (from: string, to: string) => invoke<ReportData>("report_data", { from, to }),
  exportSalesCsv: (from: string, to: string, path: string) =>
    invoke<number>("export_sales_csv", { from, to, path }),

  // Backup
  backupDatabase: (path: string) => invoke<string>("backup_database", { path }),
  restoreDatabase: (path: string) => invoke<void>("restore_database", { path }),
  dbInfo: () => invoke<DbInfo>("db_info"),
  // Licensing
  licenseGenerate: (expiresDays?: number) => invoke<LicenseKey>("license_generate", { expiresDays }),
  licenseVerify: (signature: string, message: string) => invoke<LicenseVerify>("license_verify", { signature, message }),
};
