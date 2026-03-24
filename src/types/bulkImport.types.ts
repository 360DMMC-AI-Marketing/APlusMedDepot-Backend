export interface BulkProductInput {
  name: string;
  description?: string;
  sku: string;
  price: number;
  originalPrice?: number | null;
  stockQuantity: number;
  category: string;
  specifications?: Record<string, string>;
}

export interface BulkImportResult {
  imported: number;
  failed: number;
  total: number;
  errors: Array<{ row: number; sku: string; reason: string }>;
}
