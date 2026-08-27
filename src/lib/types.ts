export interface Material {
  id: number;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaterialInput {
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
}

export interface UpdateMaterialInput {
  name: string;
  unit: string;
  minStock: number;
  costPerUnit: number;
}

export interface Movement {
  id: number;
  materialName: string;
  change: number;
  reason: string;
  createdAt: string;
}

export interface RecipeItem {
  materialId: number;
  materialName: string;
  unit: string;
  quantity: number;
  costPerUnit: number;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  active: boolean;
  recipe: RecipeItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeItemInput {
  materialId: number | null;
  quantity: number;
}

export interface ProductInput {
  name: string;
  category: string;
  price: number;
  active: boolean;
  recipe: { materialId: number; quantity: number }[];
}

export interface Sale {
  id: number;
  total: number;
  paymentMethod: string;
  note: string | null;
  createdAt: string;
}

export interface SaleSummary {
  id: number;
  total: number;
  paymentMethod: string;
  itemCount: number;
  createdAt: string;
}

export interface SaleItemRow {
  id: number;
  productId: number | null;
  productName: string;
  unitPrice: number;
  unitCost: number;
  quantity: number;
  subtotal: number;
}

export interface SaleDetail extends Sale {
  items: SaleItemRow[];
}

export interface CreateSaleInput {
  items: { productId: number; quantity: number }[];
  paymentMethod: string;
  note: string | null;
}

export interface DayPoint {
  date: string;
  total: number;
  count: number;
}

export interface TopProduct {
  name: string;
  qty: number;
  total: number;
  profit: number;
}

export interface LowStock {
  id: number;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
}

export interface DashboardStats {
  todayTotal: number;
  todayCount: number;
  todayItems: number;
  todayInvestment: number;
  todayProfit: number;
  weekTotal: number;
  weekProfit: number;
  monthTotal: number;
  monthProfit: number;
  avgTicket: number;
  salesByDay: DayPoint[];
  topProducts: TopProduct[];
  lowStock: LowStock[];
}

export interface PaymentTotal {
  method: string;
  total: number;
  count: number;
}

export interface ReportData {
  from: string;
  to: string;
  totalSales: number;
  totalInvestment: number;
  totalProfit: number;
  countSales: number;
  avgTicket: number;
  totalItems: number;
  byDay: DayPoint[];
  byProduct: TopProduct[];
  byPayment: PaymentTotal[];
}

export interface DbInfo {
  path: string;
  sizeBytes: number;
  materials: number;
  products: number;
  sales: number;
}

export interface LicenseKey {
  public_key: string;
  expires_at: string | null;
}

export interface LicenseVerify {
  valid: boolean;
  message: string;
}

export interface LicenseGenerate {
  expires_days: number | null;
}

export interface LicenseCheck {
  valid: boolean;
  message: string;
  publicKey: string | null;
  expiresAt: string | null;
  needsActivation: boolean;
}
