import { supabaseAdmin } from "../config/supabase";
import type { AuditLogEntry, AuditLogRecord, PaginatedResult } from "../types/admin.types";

type AuditLogRow = {
  id: string;
  admin_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type AuditLogRowWithEmail = AuditLogRow & {
  users: { email: string } | null;
};

function toRecord(row: AuditLogRowWithEmail): AuditLogRecord {
  return {
    id: row.id,
    adminId: row.admin_id,
    adminEmail: row.users?.email ?? "unknown",
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    details: row.details ?? {},
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

const SELECT_WITH_EMAIL =
  "id, admin_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at, users(email)";

export class AuditLogService {
  /**
   * Write an audit log entry. NEVER throws — errors are logged to console.
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await supabaseAdmin.from("audit_logs").insert({
        admin_id: entry.adminId,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId ?? null,
        details: entry.details ?? {},
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
      });
    } catch (err) {
      console.error("Audit log write failed:", err);
    }
  }

  /**
   * List audit logs with pagination and optional filters.
   */
  static async getAuditLogs(options?: {
    page?: number;
    limit?: number;
    action?: string;
    resourceType?: string;
    adminId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResult<AuditLogRecord>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin.from("audit_logs").select(SELECT_WITH_EMAIL, { count: "exact" });

    if (options?.action) {
      query = query.eq("action", options.action);
    }
    if (options?.resourceType) {
      query = query.eq("resource_type", options.resourceType);
    }
    if (options?.adminId) {
      query = query.eq("admin_id", options.adminId);
    }
    if (options?.startDate) {
      query = query.gte("created_at", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("created_at", options.endDate);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list audit logs: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as AuditLogRowWithEmail[];
    const total = count ?? 0;

    return {
      data: rows.map(toRecord),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get audit logs for a specific resource.
   */
  static async getAuditLogsByResource(
    resourceType: string,
    resourceId: string,
  ): Promise<AuditLogRecord[]> {
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select(SELECT_WITH_EMAIL)
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get audit logs by resource: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as AuditLogRowWithEmail[];
    return rows.map(toRecord);
  }

  /**
   * Get activity logs for a specific admin user.
   */
  static async getAdminActivity(
    adminId: string,
    options?: {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PaginatedResult<AuditLogRecord>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("audit_logs")
      .select(SELECT_WITH_EMAIL, { count: "exact" })
      .eq("admin_id", adminId);

    if (options?.startDate) {
      query = query.gte("created_at", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("created_at", options.endDate);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get admin activity: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as AuditLogRowWithEmail[];
    const total = count ?? 0;

    return {
      data: rows.map(toRecord),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
