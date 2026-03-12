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
  originalPrice: number | null;
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
  originalPrice: number | null;
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

// ── Platform Analytics Types ────────────────────────────────────────────

export type RevenueMetrics = {
  totalSales: number;
  totalCommission: number;
  totalSupplierPayouts: number;
  netPlatformRevenue: number;
  orderCount: number;
};

export type RevenueComparison = {
  current: RevenueMetrics;
  previous: RevenueMetrics;
  changePercent: {
    sales: number;
    commission: number;
    orders: number;
  };
};

export type SupplierRevenue = {
  supplierId: string;
  supplierName: string;
  totalSales: number;
  platformCommission: number;
  supplierPayout: number;
  orderCount: number;
};

export type CategoryRevenue = {
  category: string;
  totalSales: number;
  orderCount: number;
  unitsSold: number;
};

export type TrendDataPoint = {
  date: string;
  revenue: number;
  commission: number;
  orders: number;
};

export type OrderMetrics = {
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  conversionRate: number;
};

export type TopProduct = {
  productId: string;
  productName: string;
  category: string;
  supplierName: string;
  totalSold: number;
  totalRevenue: number;
};

// ── Admin Dashboard Types ───────────────────────────────────────────────

export type DashboardSummary = {
  pendingActions: {
    users: number;
    suppliers: number;
    products: number;
    total: number;
  };
  revenue: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number;
  };
  orders: {
    thisMonth: number;
    averageValue: number;
    byStatus: Record<string, number>;
  };
  recentOrders: AdminOrderListItem[];
  platformHealth: {
    activeUsers: number;
    activeSuppliers: number;
    activeProducts: number;
  };
};

// ── Commission Report Types ─────────────────────────────────────────────

export type PlatformEarnings = {
  totalGrossSales: number;
  totalPlatformCommission: number;
  totalSupplierPayouts: number;
  commissionCount: number;
  averageCommissionRate: number;
  trend: CommissionTrendPoint[];
};

export type SupplierCommissionReport = {
  supplierId: string;
  supplierName: string;
  totalSales: number;
  totalCommission: number;
  totalOwed: number;
  currentBalance: number;
  commissionRate: number;
  orderCount: number;
};

export type CommissionTrendPoint = {
  date: string;
  grossSales: number;
  platformCommission: number;
  supplierPayout: number;
  orderCount: number;
};

// ── Notification Types ──────────────────────────────────────────────────

export type NotificationType =
  | "order_confirmed"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "payment_received"
  | "payment_failed"
  | "refund_processed"
  | "product_approved"
  | "product_rejected"
  | "product_changes_requested"
  | "account_approved"
  | "account_rejected"
  | "account_suspended"
  | "payout_processed"
  | "new_supplier_order"
  | "system_announcement"
  | "admin_message";

export type NotificationRecord = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  emailSent: boolean;
  createdAt: string;
};

// ── Audit Log Types ───────────────────────────────────────────────────

export const AUDIT_ACTIONS = {
  USER_APPROVED: "user_approved",
  USER_REJECTED: "user_rejected",
  USER_SUSPENDED: "user_suspended",
  USER_REACTIVATED: "user_reactivated",
  PRODUCT_APPROVED: "product_approved",
  PRODUCT_REJECTED: "product_rejected",
  PRODUCT_FEATURED: "product_featured",
  PRODUCT_UNFEATURED: "product_unfeatured",
  PRODUCT_CHANGES_REQUESTED: "product_changes_requested",
  ORDER_STATUS_UPDATED: "order_status_updated",
  PAYOUT_CREATED: "payout_created",
  NOTIFICATION_SENT: "notification_sent",
  SETTINGS_UPDATED: "settings_updated",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditLogEntry = {
  adminId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditLogRecord = {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};
