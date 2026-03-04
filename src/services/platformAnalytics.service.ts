import { supabaseAdmin } from "../config/supabase";
import type {
  RevenueMetrics,
  RevenueComparison,
  SupplierRevenue,
  CategoryRevenue,
  TrendDataPoint,
  OrderMetrics,
  TopProduct,
} from "../types/admin.types";

type CommissionRow = {
  sale_amount: string;
  commission_amount: string;
  supplier_payout: string;
  order_id: string;
  created_at: string;
};

function getPeriodDates(period: string): { start: Date; previousStart: Date } {
  const now = new Date();
  let start: Date;
  let previousStart: Date;

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 1);
      break;
    }
    case "week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    }
    case "month": {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      break;
    }
    case "quarter": {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterMonth, 1);
      previousStart = new Date(now.getFullYear(), quarterMonth - 3, 1);
      break;
    }
    case "year": {
      start = new Date(now.getFullYear(), 0, 1);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      break;
    }
    default: {
      // "all" — no filter
      start = new Date(0);
      previousStart = new Date(0);
      break;
    }
  }

  return { start, previousStart };
}

function aggregateMetrics(rows: CommissionRow[]): RevenueMetrics {
  let totalSales = 0;
  let totalCommission = 0;
  let totalSupplierPayouts = 0;
  const orderIds = new Set<string>();

  for (const row of rows) {
    totalSales += Number(row.sale_amount);
    totalCommission += Number(row.commission_amount);
    totalSupplierPayouts += Number(row.supplier_payout);
    if (row.order_id) orderIds.add(row.order_id);
  }

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    totalSupplierPayouts: Math.round(totalSupplierPayouts * 100) / 100,
    netPlatformRevenue: Math.round(totalCommission * 100) / 100,
    orderCount: orderIds.size,
  };
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

export class PlatformAnalyticsService {
  static async getRevenueMetrics(
    period: "today" | "week" | "month" | "quarter" | "year" | "all" = "month",
  ): Promise<RevenueComparison> {
    const { start, previousStart } = getPeriodDates(period);

    // Fetch all non-reversed commissions from previousStart onwards (covers both periods)
    let query = supabaseAdmin
      .from("commissions")
      .select("sale_amount, commission_amount, supplier_payout, order_id, created_at")
      .neq("status", "reversed");

    if (period !== "all") {
      query = query.gte("created_at", previousStart.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch revenue metrics: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as CommissionRow[];

    const startISO = start.toISOString();
    const previousStartISO = previousStart.toISOString();

    let currentRows: CommissionRow[];
    let previousRows: CommissionRow[];

    if (period === "all") {
      currentRows = rows;
      previousRows = [];
    } else {
      currentRows = rows.filter((r) => r.created_at >= startISO);
      previousRows = rows.filter(
        (r) => r.created_at >= previousStartISO && r.created_at < startISO,
      );
    }

    const current = aggregateMetrics(currentRows);
    const previous = aggregateMetrics(previousRows);

    return {
      current,
      previous,
      changePercent: {
        sales: percentChange(current.totalSales, previous.totalSales),
        commission: percentChange(current.totalCommission, previous.totalCommission),
        orders: percentChange(current.orderCount, previous.orderCount),
      },
    };
  }

  static async getRevenueBySupplier(
    options: {
      limit?: number;
      startDate?: string;
      endDate?: string;
    } = {},
  ): Promise<SupplierRevenue[]> {
    const limit = options.limit ?? 10;

    let query = supabaseAdmin
      .from("commissions")
      .select(
        "supplier_id, sale_amount, commission_amount, supplier_payout, order_id, suppliers(business_name)",
      )
      .neq("status", "reversed");

    if (options.startDate) query = query.gte("created_at", options.startDate);
    if (options.endDate) query = query.lte("created_at", options.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch revenue by supplier: ${error.message}`);
    }

    type Row = {
      supplier_id: string;
      sale_amount: string;
      commission_amount: string;
      supplier_payout: string;
      order_id: string;
      suppliers: { business_name: string } | null;
    };

    const rows = (data ?? []) as unknown as Row[];

    // Aggregate by supplier
    const supplierMap = new Map<
      string,
      {
        name: string;
        totalSales: number;
        platformCommission: number;
        supplierPayout: number;
        orderIds: Set<string>;
      }
    >();

    for (const row of rows) {
      const existing = supplierMap.get(row.supplier_id) ?? {
        name: row.suppliers?.business_name ?? "Unknown",
        totalSales: 0,
        platformCommission: 0,
        supplierPayout: 0,
        orderIds: new Set<string>(),
      };
      existing.totalSales += Number(row.sale_amount);
      existing.platformCommission += Number(row.commission_amount);
      existing.supplierPayout += Number(row.supplier_payout);
      if (row.order_id) existing.orderIds.add(row.order_id);
      supplierMap.set(row.supplier_id, existing);
    }

    return [...supplierMap.entries()]
      .map(([supplierId, stats]) => ({
        supplierId,
        supplierName: stats.name,
        totalSales: Math.round(stats.totalSales * 100) / 100,
        platformCommission: Math.round(stats.platformCommission * 100) / 100,
        supplierPayout: Math.round(stats.supplierPayout * 100) / 100,
        orderCount: stats.orderIds.size,
      }))
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, limit);
  }

  static async getRevenueByCategory(
    options: {
      startDate?: string;
      endDate?: string;
    } = {},
  ): Promise<CategoryRevenue[]> {
    let query = supabaseAdmin
      .from("order_items")
      .select(
        "quantity, subtotal, order_id, products!inner(category), orders!inner(id, payment_status, parent_order_id)",
      )
      .eq("orders.payment_status", "paid")
      .is("orders.parent_order_id", null);

    if (options.startDate) query = query.gte("orders.created_at", options.startDate);
    if (options.endDate) query = query.lte("orders.created_at", options.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch revenue by category: ${error.message}`);
    }

    type Row = {
      quantity: number;
      subtotal: string;
      order_id: string;
      products: { category: string | null };
    };

    const rows = (data ?? []) as unknown as Row[];

    const categoryMap = new Map<
      string,
      { totalSales: number; orderIds: Set<string>; unitsSold: number }
    >();

    for (const row of rows) {
      const cat = row.products?.category ?? "Uncategorized";
      const existing = categoryMap.get(cat) ?? {
        totalSales: 0,
        orderIds: new Set<string>(),
        unitsSold: 0,
      };
      existing.totalSales += Number(row.subtotal);
      existing.orderIds.add(row.order_id);
      existing.unitsSold += row.quantity;
      categoryMap.set(cat, existing);
    }

    return [...categoryMap.entries()]
      .map(([category, stats]) => ({
        category,
        totalSales: Math.round(stats.totalSales * 100) / 100,
        orderCount: stats.orderIds.size,
        unitsSold: stats.unitsSold,
      }))
      .sort((a, b) => b.totalSales - a.totalSales);
  }

  static async getRevenueTrend(options: {
    period: "daily" | "weekly" | "monthly";
    startDate?: string;
    endDate?: string;
  }): Promise<TrendDataPoint[]> {
    const now = new Date();
    let defaultStart: Date;

    if (options.period === "daily") {
      defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    } else if (options.period === "weekly") {
      defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 84);
    } else {
      defaultStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    const startDate = options.startDate ?? defaultStart.toISOString();

    let query = supabaseAdmin
      .from("commissions")
      .select("sale_amount, commission_amount, order_id, created_at")
      .neq("status", "reversed")
      .gte("created_at", startDate)
      .order("created_at", { ascending: true });

    if (options.endDate) query = query.lte("created_at", options.endDate);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch revenue trend: ${error.message}`);
    }

    type Row = {
      sale_amount: string;
      commission_amount: string;
      order_id: string;
      created_at: string;
    };

    const rows = (data ?? []) as unknown as Row[];

    const bucketMap = new Map<
      string,
      { revenue: number; commission: number; orderIds: Set<string> }
    >();

    for (const row of rows) {
      const d = new Date(row.created_at);
      let bucketKey: string;

      if (options.period === "daily") {
        bucketKey = d.toISOString().slice(0, 10);
      } else if (options.period === "weekly") {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
        bucketKey = weekStart.toISOString().slice(0, 10);
      } else {
        bucketKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      }

      const existing = bucketMap.get(bucketKey) ?? {
        revenue: 0,
        commission: 0,
        orderIds: new Set<string>(),
      };
      existing.revenue += Number(row.sale_amount);
      existing.commission += Number(row.commission_amount);
      existing.orderIds.add(row.order_id);
      bucketMap.set(bucketKey, existing);
    }

    return [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        revenue: Math.round(stats.revenue * 100) / 100,
        commission: Math.round(stats.commission * 100) / 100,
        orders: stats.orderIds.size,
      }));
  }

  static async getOrderMetrics(
    period: "today" | "week" | "month" | "quarter" | "year" | "all" = "month",
  ): Promise<OrderMetrics> {
    const { start } = getPeriodDates(period);

    let query = supabaseAdmin
      .from("orders")
      .select("status, payment_status, total_amount")
      .is("parent_order_id", null);

    if (period !== "all") {
      query = query.gte("created_at", start.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch order metrics: ${error.message}`);
    }

    type Row = { status: string; payment_status: string; total_amount: string };
    const rows = (data ?? []) as unknown as Row[];

    const totalOrders = rows.length;
    let paidOrders = 0;
    let cancelledOrders = 0;
    let paidTotal = 0;

    for (const row of rows) {
      if (row.payment_status === "paid") {
        paidOrders++;
        paidTotal += Number(row.total_amount);
      }
      if (row.status === "cancelled") {
        cancelledOrders++;
      }
    }

    const averageOrderValue = paidOrders > 0 ? Math.round((paidTotal / paidOrders) * 100) / 100 : 0;
    const conversionRate =
      totalOrders > 0 ? Math.round((paidOrders / totalOrders) * 100 * 100) / 100 : 0;

    return {
      totalOrders,
      paidOrders,
      cancelledOrders,
      averageOrderValue,
      conversionRate,
    };
  }

  static async getTopProducts(limit: number = 10): Promise<TopProduct[]> {
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select(
        "product_id, quantity, subtotal, products!inner(name, category, supplier_id, suppliers!inner(business_name)), orders!inner(payment_status)",
      )
      .eq("orders.payment_status", "paid");

    if (error) {
      throw new Error(`Failed to fetch top products: ${error.message}`);
    }

    type Row = {
      product_id: string;
      quantity: number;
      subtotal: string;
      products: {
        name: string;
        category: string | null;
        supplier_id: string;
        suppliers: { business_name: string };
      };
    };

    const rows = (data ?? []) as unknown as Row[];

    const productMap = new Map<
      string,
      {
        name: string;
        category: string;
        supplierName: string;
        totalSold: number;
        totalRevenue: number;
      }
    >();

    for (const row of rows) {
      const existing = productMap.get(row.product_id) ?? {
        name: row.products.name,
        category: row.products.category ?? "Uncategorized",
        supplierName: row.products.suppliers.business_name,
        totalSold: 0,
        totalRevenue: 0,
      };
      existing.totalSold += row.quantity;
      existing.totalRevenue += Number(row.subtotal);
      productMap.set(row.product_id, existing);
    }

    return [...productMap.entries()]
      .map(([productId, stats]) => ({
        productId,
        productName: stats.name,
        category: stats.category,
        supplierName: stats.supplierName,
        totalSold: stats.totalSold,
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }
}
