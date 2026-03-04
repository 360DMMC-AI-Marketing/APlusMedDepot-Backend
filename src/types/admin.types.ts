export type UserStatus = "pending" | "approved" | "suspended" | "rejected";
export type UserRole = "customer" | "supplier" | "admin";

export type UserListItem = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  lastLogin: string | null;
};

export type UserDetail = UserListItem & {
  phone: string | null;
  supplierInfo?: {
    businessName: string;
    taxId: string;
    status: string;
    commissionRate: number;
    currentBalance: number;
    createdAt: string;
  };
  customerStats?: {
    totalOrders: number;
    totalSpent: number;
  };
};

export type AdminActionLog = {
  action: string;
  adminId: string;
  targetUserId: string;
  reason?: string;
  timestamp: string;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ── Admin Order Types ────────────────────────────────────────────────────

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  totalAmount: number;
  taxAmount: number;
  status: string;
  paymentStatus: string;
  itemCount: number;
  subOrderCount: number;
  createdAt: string;
};

export type AdminOrderDetail = {
  id: string;
  orderNumber: string;
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  totalAmount: number;
  taxAmount: number;
  shippingAddress: unknown;
  status: string;
  paymentStatus: string;
  paymentIntentId: string | null;
  items: AdminOrderItem[];
  subOrders: AdminSubOrder[];
  payments: PaymentRecord[];
  commissions: CommissionBreakdown[];
  statusHistory: StatusHistoryEntry[];
  summary: {
    totalItems: number;
    totalPlatformCommission: number;
    totalSupplierPayouts: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderItem = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  fulfillmentStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
};

export type AdminSubOrder = {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  status: string;
  itemCount: number;
};

export type CommissionBreakdown = {
  orderItemId: string;
  productName: string;
  supplierName: string;
  saleAmount: number;
  commissionRate: number;
  commissionAmount: number;
  platformAmount: number;
  supplierAmount: number;
  status: string;
};

export type StatusHistoryEntry = {
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason: string | null;
};

export type PaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type OrderStatusCounts = Record<string, number>;

// ── Admin Product Types ──────────────────────────────────────────────────

export type AdminProductListItem = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  category: string | null;
  status: string;
  supplierName: string;
  supplierId: string;
  isFeatured: boolean;
  createdAt: string;
};

export type AdminProductDetail = {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  stockQuantity: number;
  category: string | null;
  status: string;
  images: string[] | null;
  specifications: Record<string, string> | null;
  weight: number | null;
  dimensions: { length?: number; width?: number; height?: number } | null;
  isFeatured: boolean;
  isDeleted: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminFeedback: string | null;
  supplier: {
    id: string;
    businessName: string;
    status: string;
    commissionRate: number;
  };
  salesStats: {
    totalOrders: number;
    totalSold: number;
    totalRevenue: number;
  };
  createdAt: string;
  updatedAt: string;
};
