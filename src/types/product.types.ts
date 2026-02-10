export type ProductStatus = "draft" | "pending_review" | "active" | "inactive" | "out_of_stock";

export interface Dimensions {
  length?: number;
  width?: number;
  height?: number;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  stockQuantity: number;
  category: string | null;
  status: ProductStatus;
  images: string[];
  specifications: Record<string, string>;
  weight: number | null;
  dimensions: Dimensions | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  supplierName?: string | null;
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  sku: string;
  price: number;
  stockQuantity: number;
  category?: string;
  images?: string[];
  specifications?: Record<string, string>;
  weight?: number;
  dimensions?: Dimensions;
  status?: ProductStatus;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  sku?: string;
  price?: number;
  stockQuantity?: number;
  category?: string;
  images?: string[];
  specifications?: Record<string, string>;
  weight?: number;
  dimensions?: Dimensions;
  status?: ProductStatus;
}

export interface ProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  supplierId?: string;
  status?: ProductStatus;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "name" | "price" | "created_at";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
