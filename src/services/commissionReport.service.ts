import { supabaseAdmin } from "../config/supabase";
import type {
  PlatformEarnings,
  SupplierCommissionReport,
  CommissionTrendPoint,
  PaginatedResult,
} from "../types/admin.types";

type CommissionRow = {
  sale_amount: string;
  commission_amount: string;
  commission_rate: string;
  supplier_payout: string;
  order_id: string;
  created_at: string;
};

export class CommissionReportService {
  static async getPlatformEarnings(options: {
    period: "week" | "month" | "quarter" | "year";
    startDate?: string;
    endDate?: string;
  }): Promise<PlatformEarnings> {
    const now = new Date();
    let defaultStart: Date;

    switch (options.period) {
      case "week":
        defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        break;
      case "month":
        defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter": {
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        defaultStart = new Date(now.getFullYear(), quarterMonth, 1);
        break;
      }
      case "year":
        defaultStart = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const startDate = options.startDate ?? defaultStart.toISOString();

    let query = supabaseAdmin
      .from("commissions")
      .select(
        "sale_amount, commission_amount, commission_rate, supplier_payout, order_id, created_at",
      )
      .neq("status", "reversed")
      .gte("created_at", startDate)
      .order("created_at", { ascending: true });

    if (options.endDate) query = query.lte("created_at", options.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch platform earnings: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as CommissionRow[];

    let totalGrossSales = 0;
    let totalPlatformCommission = 0;
    let totalSupplierPayouts = 0;
    let rateSum = 0;

    for (const row of rows) {
      totalGrossSales += Number(row.sale_amount);
      totalPlatformCommission += Number(row.commission_amount);
      totalSupplierPayouts += Number(row.supplier_payout);
      rateSum += Number(row.commission_rate);
    }

    const commissionCount = rows.length;
    const averageCommissionRate =
      commissionCount > 0 ? Math.round((rateSum / commissionCount) * 100) / 100 : 0;

    // Build trend — group by week
    const bucketMap = new Map<
      string,
      {
        grossSales: number;
        platformCommission: number;
        supplierPayout: number;
        orderIds: Set<string>;
      }
    >();

    for (const row of rows) {
      const d = new Date(row.created_at);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
      const bucketKey = weekStart.toISOString().slice(0, 10);

      const existing = bucketMap.get(bucketKey) ?? {
        grossSales: 0,
        platformCommission: 0,
        supplierPayout: 0,
        orderIds: new Set<string>(),
      };
      existing.grossSales += Number(row.sale_amount);
      existing.platformCommission += Number(row.commission_amount);
      existing.supplierPayout += Number(row.supplier_payout);
      existing.orderIds.add(row.order_id);
      bucketMap.set(bucketKey, existing);
    }

    const trend: CommissionTrendPoint[] = [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        grossSales: Math.round(stats.grossSales * 100) / 100,
        platformCommission: Math.round(stats.platformCommission * 100) / 100,
        supplierPayout: Math.round(stats.supplierPayout * 100) / 100,
        orderCount: stats.orderIds.size,
      }));

    return {
      totalGrossSales: Math.round(totalGrossSales * 100) / 100,
      totalPlatformCommission: Math.round(totalPlatformCommission * 100) / 100,
      totalSupplierPayouts: Math.round(totalSupplierPayouts * 100) / 100,
      commissionCount,
      averageCommissionRate,
      trend,
    };
  }

  static async getCommissionBySupplierReport(options: {
    startDate: string;
    endDate: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<SupplierCommissionReport>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    const { data: commissions, error: commError } = await supabaseAdmin
      .from("commissions")
      .select(
        "supplier_id, sale_amount, commission_amount, commission_rate, supplier_payout, order_id, suppliers(business_name)",
      )
      .neq("status", "reversed")
      .gte("created_at", options.startDate)
      .lte("created_at", options.endDate);

    if (commError) {
      throw new Error(`Failed to fetch commission report: ${commError.message}`);
    }

    type Row = {
      supplier_id: string;
      sale_amount: string;
      commission_amount: string;
      commission_rate: string;
      supplier_payout: string;
      order_id: string;
      suppliers: { business_name: string } | null;
    };

    const rows = (commissions ?? []) as unknown as Row[];

    // Aggregate by supplier
    const supplierMap = new Map<
      string,
      {
        name: string;
        totalSales: number;
        totalCommission: number;
        totalOwed: number;
        rateSum: number;
        count: number;
        orderIds: Set<string>;
      }
    >();

    for (const row of rows) {
      const existing = supplierMap.get(row.supplier_id) ?? {
        name: row.suppliers?.business_name ?? "Unknown",
        totalSales: 0,
        totalCommission: 0,
        totalOwed: 0,
        rateSum: 0,
        count: 0,
        orderIds: new Set<string>(),
      };
      existing.totalSales += Number(row.sale_amount);
      existing.totalCommission += Number(row.commission_amount);
      existing.totalOwed += Number(row.supplier_payout);
      existing.rateSum += Number(row.commission_rate);
      existing.count++;
      existing.orderIds.add(row.order_id);
      supplierMap.set(row.supplier_id, existing);
    }

    // Fetch current balances for these suppliers
    const supplierIds = [...supplierMap.keys()];
    const balanceMap = new Map<string, number>();

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabaseAdmin
        .from("suppliers")
        .select("id, current_balance")
        .in("id", supplierIds);

      for (const s of (suppliers ?? []) as Array<{ id: string; current_balance: string }>) {
        balanceMap.set(s.id, Number(s.current_balance));
      }
    }

    const allReports = [...supplierMap.entries()]
      .map(([supplierId, stats]) => ({
        supplierId,
        supplierName: stats.name,
        totalSales: Math.round(stats.totalSales * 100) / 100,
        totalCommission: Math.round(stats.totalCommission * 100) / 100,
        totalOwed: Math.round(stats.totalOwed * 100) / 100,
        currentBalance: balanceMap.get(supplierId) ?? 0,
        commissionRate: stats.count > 0 ? Math.round((stats.rateSum / stats.count) * 100) / 100 : 0,
        orderCount: stats.orderIds.size,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    const total = allReports.length;
    const startIdx = (page - 1) * limit;
    const paged = allReports.slice(startIdx, startIdx + limit);

    return {
      data: paged,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getCommissionTrend(options: {
    granularity: "daily" | "weekly" | "monthly";
    startDate?: string;
    endDate?: string;
  }): Promise<CommissionTrendPoint[]> {
    const now = new Date();
    let defaultStart: Date;

    if (options.granularity === "daily") {
      defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    } else if (options.granularity === "weekly") {
      defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 84);
    } else {
      defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const startDate = options.startDate ?? defaultStart.toISOString();

    let query = supabaseAdmin
      .from("commissions")
      .select("sale_amount, commission_amount, supplier_payout, order_id, created_at")
      .neq("status", "reversed")
      .gte("created_at", startDate)
      .order("created_at", { ascending: true });

    if (options.endDate) query = query.lte("created_at", options.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch commission trend: ${error.message}`);
    }

    type Row = {
      sale_amount: string;
      commission_amount: string;
      supplier_payout: string;
      order_id: string;
      created_at: string;
    };

    const rows = (data ?? []) as unknown as Row[];

    const bucketMap = new Map<
      string,
      {
        grossSales: number;
        platformCommission: number;
        supplierPayout: number;
        orderIds: Set<string>;
      }
    >();

    for (const row of rows) {
      const d = new Date(row.created_at);
      let bucketKey: string;

      if (options.granularity === "daily") {
        bucketKey = d.toISOString().slice(0, 10);
      } else if (options.granularity === "weekly") {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
        bucketKey = weekStart.toISOString().slice(0, 10);
      } else {
        bucketKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      }

      const existing = bucketMap.get(bucketKey) ?? {
        grossSales: 0,
        platformCommission: 0,
        supplierPayout: 0,
        orderIds: new Set<string>(),
      };
      existing.grossSales += Number(row.sale_amount);
      existing.platformCommission += Number(row.commission_amount);
      existing.supplierPayout += Number(row.supplier_payout);
      existing.orderIds.add(row.order_id);
      bucketMap.set(bucketKey, existing);
    }

    return [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        grossSales: Math.round(stats.grossSales * 100) / 100,
        platformCommission: Math.round(stats.platformCommission * 100) / 100,
        supplierPayout: Math.round(stats.supplierPayout * 100) / 100,
        orderCount: stats.orderIds.size,
      }));
  }
}
