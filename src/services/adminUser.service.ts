import { supabaseAdmin } from "../config/supabase";
import { AppError, conflict, forbidden, notFound } from "../utils/errors";
import { logAdminAction } from "../utils/securityLogger";
import { sendEmail } from "./email.service";
import { AuditLogService } from "./auditLog.service";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import type {
  UserListItem,
  UserDetail,
  UserStatus,
  UserRole,
  PaginatedResult,
} from "../types/admin.types";
import type { AuditContext } from "../middleware/auditMiddleware";

export type RejectionData = {
  reasons: string[];
  customReason?: string;
  sendEmail?: boolean;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  last_login: string | null;
};

type SupplierRow = {
  business_name: string;
  tax_id: string | null;
  status: string;
  commission_rate: string | null;
  current_balance: string | null;
  created_at: string;
};

const USER_LIST_FIELDS = "id, email, role, status, first_name, last_name, created_at, last_login";

function toUserListItem(row: UserRow): UserListItem {
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    firstName: row.first_name,
    lastName: row.last_name,
    createdAt: row.created_at,
    lastLogin: row.last_login,
  };
}

export class AdminUserService {
  static async listUsers(options?: {
    page?: number;
    limit?: number;
    status?: UserStatus;
    role?: UserRole;
    search?: string;
    sortBy?: "created_at" | "email" | "status";
    sortOrder?: "asc" | "desc";
  }): Promise<PaginatedResult<UserListItem>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? "created_at";
    const sortOrder = options?.sortOrder ?? "desc";
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("users").select(USER_LIST_FIELDS, { count: "exact" });

    if (options?.status) {
      query = query.eq("status", options.status);
    }
    if (options?.role) {
      query = query.eq("role", options.role);
    }
    if (options?.search) {
      query = query.or(
        `email.ilike.%${options.search}%,first_name.ilike.%${options.search}%,last_name.ilike.%${options.search}%`,
      );
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as UserRow[];
    const total = count ?? 0;

    return {
      data: rows.map(toUserListItem),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getUserDetail(userId: string): Promise<UserDetail> {
    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, role, status, first_name, last_name, phone, created_at, last_login")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      throw notFound("User");
    }

    const user = userData as unknown as UserRow;
    const detail: UserDetail = {
      ...toUserListItem(user),
      phone: user.phone,
    };

    if (user.role === "supplier") {
      const { data: supplierData } = await supabaseAdmin
        .from("suppliers")
        .select("business_name, tax_id, status, commission_rate, current_balance, created_at")
        .eq("user_id", userId)
        .single();

      if (supplierData) {
        const supplier = supplierData as unknown as SupplierRow;
        detail.supplierInfo = {
          businessName: supplier.business_name,
          taxId: supplier.tax_id ?? "",
          status: supplier.status,
          commissionRate: Number(supplier.commission_rate ?? 15),
          currentBalance: Number(supplier.current_balance ?? 0),
          createdAt: supplier.created_at,
        };
      }
    }

    if (user.role === "customer") {
      const { data: ordersData } = await supabaseAdmin
        .from("orders")
        .select("id, total_amount")
        .eq("customer_id", userId)
        .is("parent_order_id", null);

      const orders = (ordersData ?? []) as unknown as { id: string; total_amount: string }[];
      detail.customerStats = {
        totalOrders: orders.length,
        totalSpent: orders.reduce((sum, o) => sum + Number(o.total_amount), 0),
      };
    }

    return detail;
  }

  static async approveUser(
    userId: string,
    adminId: string,
    auditCtx?: AuditContext,
    options?: { commissionRate?: number },
  ): Promise<void> {
    const user = await this.fetchUserOrThrow(userId);

    if (user.status !== "pending") {
      throw conflict("User is not in pending status");
    }

    // Validate commission rate if provided
    if (options?.commissionRate !== undefined) {
      if (options.commissionRate < 1 || options.commissionRate > 50) {
        throw new AppError("Commission rate must be between 1 and 50", 400, "VALIDATION_ERROR");
      }
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to approve user: ${error.message}`);
    }

    if (user.role === "supplier") {
      const supplierUpdate: Record<string, unknown> = { status: "approved" };
      if (options?.commissionRate !== undefined) {
        supplierUpdate.commission_rate = options.commissionRate;
      }
      await supabaseAdmin.from("suppliers").update(supplierUpdate).eq("user_id", userId);
    }

    void sendEmail(
      user.email,
      "Your APlusMedDepot Account Has Been Approved",
      baseLayout({
        title: "Account Approved",
        preheader: "Your account has been approved",
        body: `
          <p>Welcome to APlusMedDepot!</p>
          <p>Your account has been approved. You can now log in and start using our platform.</p>
        `,
      }),
    );

    logAdminAction({
      action: "user_approved",
      adminId,
      targetUserId: userId,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "user_approved",
      resourceType: "user",
      resourceId: userId,
      details: { role: user.role, commissionRate: options?.commissionRate },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  static async rejectUser(
    userId: string,
    adminId: string,
    reason: string | RejectionData,
    auditCtx?: AuditContext,
  ): Promise<void> {
    const user = await this.fetchUserOrThrow(userId);

    if (user.status !== "pending") {
      throw conflict("User is not in pending status");
    }

    // Normalize old format (string) to new format (RejectionData)
    const rejectionData: RejectionData =
      typeof reason === "string" ? { reasons: [reason], sendEmail: true } : reason;

    const allReasons = [...rejectionData.reasons, rejectionData.customReason].filter(
      Boolean,
    ) as string[];
    const combinedReason = allReasons.join("; ");

    const { error } = await supabaseAdmin
      .from("users")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to reject user: ${error.message}`);
    }

    if (user.role === "supplier") {
      await supabaseAdmin.from("suppliers").update({ status: "rejected" }).eq("user_id", userId);
    }

    if (rejectionData.sendEmail !== false) {
      const reasonBullets = allReasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("\n");
      void sendEmail(
        user.email,
        "APlusMedDepot Application Update",
        baseLayout({
          title: "Application Update",
          preheader: "Update on your account application",
          body: `
            <p>Hi ${escapeHtml(user.first_name ?? "there")},</p>
            <p>After reviewing your application, we were unable to approve it at this time.</p>
            <p><strong>Reasons:</strong></p>
            <ul>${reasonBullets}</ul>
            <p>If you have questions or would like to resubmit, please contact our support team.</p>
          `,
        }),
      );
    }

    logAdminAction({
      action: "user_rejected",
      adminId,
      targetUserId: userId,
      reason: combinedReason,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "user_rejected",
      resourceType: "user",
      resourceId: userId,
      details: {
        reasons: rejectionData.reasons,
        customReason: rejectionData.customReason,
        sendEmail: rejectionData.sendEmail,
        role: user.role,
      },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  static async suspendUser(
    userId: string,
    adminId: string,
    reason: string,
    auditCtx?: AuditContext,
  ): Promise<void> {
    const user = await this.fetchUserOrThrow(userId);

    if (user.status !== "approved") {
      throw conflict("Only approved users can be suspended");
    }

    if (user.role === "admin") {
      throw forbidden("Cannot suspend admin users");
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ status: "suspended", updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to suspend user: ${error.message}`);
    }

    if (user.role === "supplier") {
      await supabaseAdmin.from("suppliers").update({ status: "suspended" }).eq("user_id", userId);
    }

    void sendEmail(
      user.email,
      "APlusMedDepot Account Suspended",
      baseLayout({
        title: "Account Suspended",
        preheader: "Your account has been suspended",
        body: `
          <p>Your account has been suspended.</p>
          <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
          <p>If you have questions, please contact our support team.</p>
        `,
      }),
    );

    logAdminAction({
      action: "user_suspended",
      adminId,
      targetUserId: userId,
      reason,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "user_suspended",
      resourceType: "user",
      resourceId: userId,
      details: { reason, role: user.role },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  static async reactivateUser(
    userId: string,
    adminId: string,
    auditCtx?: AuditContext,
  ): Promise<void> {
    const user = await this.fetchUserOrThrow(userId);

    if (user.status !== "suspended") {
      throw conflict("Only suspended users can be reactivated");
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      throw new Error(`Failed to reactivate user: ${error.message}`);
    }

    if (user.role === "supplier") {
      await supabaseAdmin.from("suppliers").update({ status: "approved" }).eq("user_id", userId);
    }

    void sendEmail(
      user.email,
      "APlusMedDepot Account Reactivated",
      baseLayout({
        title: "Account Reactivated",
        preheader: "Your account has been reactivated",
        body: `
          <p>Your account has been reactivated. You can now log in and use the platform again.</p>
        `,
      }),
    );

    logAdminAction({
      action: "user_reactivated",
      adminId,
      targetUserId: userId,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "user_reactivated",
      resourceType: "user",
      resourceId: userId,
      details: { role: user.role },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  static async getPendingCount(): Promise<{
    users: number;
    suppliers: number;
    products: number;
  }> {
    const [usersRes, suppliersRes, productsRes] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    return {
      users: usersRes.count ?? 0,
      suppliers: suppliersRes.count ?? 0,
      products: productsRes.count ?? 0,
    };
  }

  private static async fetchUserOrThrow(userId: string): Promise<UserRow> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, email, role, status, first_name, last_name, phone, created_at, last_login")
      .eq("id", userId)
      .single();

    if (error || !data) {
      throw notFound("User");
    }

    return data as unknown as UserRow;
  }
}
