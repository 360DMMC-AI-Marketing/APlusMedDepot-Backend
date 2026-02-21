export type SupplierProductStatus =
  | "pending"
  | "active"
  | "inactive"
  | "rejected"
  | "needs_revision";

export interface SupplierProductDimensions {
  length?: number;
  width?: number;
  height?: number;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  stockQuantity: number;
  category: string | null;
  status: SupplierProductStatus;
  images: string[];
  specifications: Record<string, string>;
  weight: number | null;
  dimensions: SupplierProductDimensions | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProductPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface SupplierProductListResponse {
  products: SupplierProduct[];
  pagination: SupplierProductPagination;
  filters_applied: Record<string, unknown>;
}

export interface SupplierProductStats {
  total_products: number;
  active_count: number;
  pending_count: number;
  rejected_count: number;
  out_of_stock_count: number;
  total_inventory_value: number;
}

export interface CreateSupplierProductRequest {
  name: string;
  description?: string;
  sku: string;
  price: number;
  stock_quantity: number;
  category?: string;
  specifications?: Record<string, string>;
  weight?: number;
  dimensions?: SupplierProductDimensions;
}

export interface UpdateSupplierProductRequest {
  name?: string;
  description?: string;
  sku?: string;
  price?: number;
  stock_quantity?: number;
  category?: string;
  specifications?: Record<string, string>;
  weight?: number;
  dimensions?: SupplierProductDimensions;
}
