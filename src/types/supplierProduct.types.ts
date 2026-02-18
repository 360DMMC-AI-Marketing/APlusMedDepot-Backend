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
