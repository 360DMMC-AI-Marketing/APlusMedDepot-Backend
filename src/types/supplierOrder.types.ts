export interface SupplierOrderView {
  id: string;
  orderNumber: string;
  masterOrderId: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  taxAmount: number;
  commissionAmount: number;
  payoutAmount: number;
  commissionRate: number;
  status: string;
  paymentStatus: string;
  itemCount: number;
  createdAt: string;
}

export interface SupplierOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface SupplierOrderDetail {
  id: string;
  orderNumber: string;
  masterOrderId: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  taxAmount: number;
  commissionAmount: number;
  payoutAmount: number;
  commissionRate: number;
  status: string;
  paymentStatus: string;
  shippingAddress: unknown;
  items: SupplierOrderItem[];
  statusHistory: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;
    reason: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierOrderStats {
  ordersThisMonth: number;
  ordersLastMonth: number;
  revenueThisMonth: number;
  averageOrderValue: number;
  statusCounts: {
    pending: number;
    processing: number;
    shipped: number;
    delivered: number;
  };
}
