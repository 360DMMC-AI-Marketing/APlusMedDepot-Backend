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
