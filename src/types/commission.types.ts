export interface CommissionResult {
  commissionId: string;
  orderItemId: string;
  supplierId: string;
  saleAmount: number;
  commissionAmount: number;
  supplierAmount: number;
}

export interface CommissionRecord {
  id: string;
  orderItemId: string;
  orderId: string;
  supplierId: string;
  supplierName?: string;
  productName?: string;
  saleAmount: number;
  commissionRate: number;
  commissionAmount: number;
  platformAmount: number;
  supplierPayout: number;
  status: string;
  createdAt: string;
}

export interface CommissionSummary {
  totalSales: number;
  totalCommission: number;
  totalPayout: number;
  currentBalance: number;
  orderCount: number;
}
