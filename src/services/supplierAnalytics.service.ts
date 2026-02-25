import { supabaseAdmin } from "../config/supabase";
import { SupplierProductService } from "./supplierProduct.service";
import { AppError, notFound, forbidden } from "../utils/errors";

export interface ProductAnalytics {
  product_id: string;
  total_sold: number;
  total_revenue: number;
  order_count: number;
  average_quantity_per_order: number;
  period: string;
}

export interface TopProduct {
  product_id: string;
  name: string;
  total_sold: number;
  total_revenue: number;
}

export interface AggregateAnalytics {
  top_products: TopProduct[];
  summary: {
    total_revenue: number;
    total_orders: number;
    average_order_value: number;
  };
}

function periodToDate(period: string): string | null {
  if (period === "all") return null;

  const now = new Date();
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

export class SupplierAnalyticsService {
  static async getSupplierIdFromUserId(userId: string): Promise<string> {
    return SupplierProductService.getSupplierIdFromUserId(userId);
  }

  /**
   * GET /api/suppliers/products/:id/analytics
   */
  static async getProductAnalytics(
    supplierId: string,
    productId: string,
    period: string,
  ): Promise<ProductAnalytics> {
    // Verify product exists and belongs to this supplier
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (productError) {
      throw new AppError(productError.message, 500, "DATABASE_ERROR");
    }
    if (!product) {
      throw notFound("Product");
    }

    const row = product as { id: string; supplier_id: string };
    if (row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to view analytics for this product");
    }

    // Query order_items joined with orders for date filtering
    const startDate = periodToDate(period);

    let query = supabaseAdmin
      .from("order_items")
      .select("quantity, subtotal, order_id, orders!inner(id, created_at)")
      .eq("product_id", productId)
      .neq("fulfillment_status", "cancelled");

    if (startDate) {
      query = query.gte("orders.created_at", startDate);
    }

    const { data: items, error: itemsError } = await query;

    if (itemsError) {
      throw new AppError(itemsError.message, 500, "DATABASE_ERROR");
    }

    const rows = (items ?? []) as Array<{
      quantity: number;
      subtotal: string;
      order_id: string;
    }>;

    const totalSold = rows.reduce((sum, r) => sum + r.quantity, 0);
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.subtotal), 0);
    const distinctOrders = new Set(rows.map((r) => r.order_id));
    const orderCount = distinctOrders.size;
    const averageQuantity = orderCount > 0 ? totalSold / orderCount : 0;

    return {
      product_id: productId,
      total_sold: totalSold,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      order_count: orderCount,
      average_quantity_per_order: Math.round(averageQuantity * 100) / 100,
      period,
    };
  }

  /**
   * GET /api/suppliers/analytics/dashboard
   */
  static async getDashboardStats(supplierId: string): Promise<{
    revenueThisMonth: number;
    revenueLastMonth: number;
    revenueChangePercent: number;
    ordersThisMonth: number;
    ordersLastMonth: number;
    averageOrderValue: number;
    activeProducts: number;
  }> {
    const now = new Date();
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // Revenue this month from commissions (supplier_payout, excluding reversed)
    const { data: thisMonthData } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout, order_id")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", firstOfThisMonth);

    type RevenueRow = { supplier_payout: string; order_id: string };
    const thisMonthRows = (thisMonthData ?? []) as unknown as RevenueRow[];
    const revenueThisMonth = thisMonthRows.reduce((sum, r) => sum + Number(r.supplier_payout), 0);
    const thisMonthOrderIds = new Set(thisMonthRows.map((r) => r.order_id));
    const ordersThisMonth = thisMonthOrderIds.size;

    // Revenue last month
    const { data: lastMonthData } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout, order_id")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", firstOfLastMonth)
      .lt("created_at", firstOfThisMonth);

    const lastMonthRows = (lastMonthData ?? []) as unknown as RevenueRow[];
    const revenueLastMonth = lastMonthRows.reduce((sum, r) => sum + Number(r.supplier_payout), 0);
    const lastMonthOrderIds = new Set(lastMonthRows.map((r) => r.order_id));
    const ordersLastMonth = lastMonthOrderIds.size;

    // Revenue change %
    const revenueChangePercent =
      revenueLastMonth > 0
        ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 * 100) / 100
        : 0;

    // Average order value (this month)
    const averageOrderValue =
      ordersThisMonth > 0 ? Math.round((revenueThisMonth / ordersThisMonth) * 100) / 100 : 0;

    // Active products count
    const { count: activeProducts } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId)
      .eq("status", "active")
      .eq("is_deleted", false);

    return {
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      revenueLastMonth: Math.round(revenueLastMonth * 100) / 100,
      revenueChangePercent,
      ordersThisMonth,
      ordersLastMonth,
      averageOrderValue,
      activeProducts: activeProducts ?? 0,
    };
  }

  /**
   * GET /api/suppliers/analytics/top-products
   */
  static async getTopProducts(
    supplierId: string,
    limit: number = 5,
  ): Promise<Array<{ productId: string; name: string; totalSold: number; totalRevenue: number }>> {
    const { data: items, error } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity, subtotal, products!inner(name)")
      .eq("supplier_id", supplierId)
      .neq("fulfillment_status", "cancelled");

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    type ItemRow = {
      product_id: string;
      quantity: number;
      subtotal: string;
      products: { name: string };
    };

    const rows = (items ?? []) as unknown as ItemRow[];

    // Aggregate by product
    const productMap = new Map<string, { name: string; totalSold: number; totalRevenue: number }>();

    for (const r of rows) {
      const existing = productMap.get(r.product_id) ?? {
        name: r.products.name,
        totalSold: 0,
        totalRevenue: 0,
      };
      existing.totalSold += r.quantity;
      existing.totalRevenue += Number(r.subtotal);
      productMap.set(r.product_id, existing);
    }

    return [...productMap.entries()]
      .map(([pid, stats]) => ({
        productId: pid,
        name: stats.name,
        totalSold: stats.totalSold,
        totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  }

  /**
   * GET /api/suppliers/analytics/revenue-trend
   */
  static async getRevenueTrend(
    supplierId: string,
    period: "week" | "month" | "3months",
  ): Promise<Array<{ date: string; revenue: number; orderCount: number }>> {
    const now = new Date();
    let startDate: Date;

    if (period === "week") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    }

    const { data, error } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout, order_id, created_at")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    type TrendRow = { supplier_payout: string; order_id: string; created_at: string };
    const rows = (data ?? []) as unknown as TrendRow[];

    // Group by time bucket
    const bucketMap = new Map<string, { revenue: number; orderIds: Set<string> }>();

    for (const r of rows) {
      const d = new Date(r.created_at);
      let bucketKey: string;

      if (period === "3months") {
        // Weekly buckets: use ISO week start (Monday)
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
        bucketKey = weekStart.toISOString().slice(0, 10);
      } else {
        // Daily buckets
        bucketKey = d.toISOString().slice(0, 10);
      }

      const existing = bucketMap.get(bucketKey) ?? { revenue: 0, orderIds: new Set<string>() };
      existing.revenue += Number(r.supplier_payout);
      existing.orderIds.add(r.order_id);
      bucketMap.set(bucketKey, existing);
    }

    return [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({
        date,
        revenue: Math.round(stats.revenue * 100) / 100,
        orderCount: stats.orderIds.size,
      }));
  }

  /**
   * GET /api/suppliers/analytics/order-status
   */
  static async getOrderStatusBreakdown(
    supplierId: string,
  ): Promise<{
    pending: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  }> {
    // Sub-orders (parent_order_id IS NOT NULL) belonging to this supplier
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    type StatusRow = { status: string };
    const rows = (data ?? []) as unknown as StatusRow[];

    const statusBuckets: Record<string, string> = {
      pending: "pending",
      payment_confirmed: "pending",
      awaiting_fulfillment: "pending",
      processing: "processing",
      partially_shipped: "shipped",
      fully_shipped: "shipped",
      shipped: "shipped",
      delivered: "delivered",
      cancelled: "cancelled",
      refunded: "cancelled",
    };

    const counts = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };

    for (const row of rows) {
      const bucket = statusBuckets[row.status] ?? "pending";
      counts[bucket as keyof typeof counts] += 1;
    }

    return counts;
  }

  /**
   * GET /api/suppliers/analytics/products
   */
  static async getAggregateAnalytics(supplierId: string): Promise<AggregateAnalytics> {
    // Fetch all non-cancelled order_items for this supplier, joined with non-cancelled orders
    const { data: items, error } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity, subtotal, order_id, orders!inner(id, status)")
      .eq("supplier_id", supplierId)
      .neq("fulfillment_status", "cancelled")
      .neq("orders.status", "cancelled");

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const rows = (items ?? []) as Array<{
      product_id: string;
      quantity: number;
      subtotal: string;
      order_id: string;
    }>;

    // Aggregate per product
    const productMap = new Map<string, { total_sold: number; total_revenue: number }>();
    const distinctOrders = new Set<string>();
    let totalRevenue = 0;

    for (const r of rows) {
      const existing = productMap.get(r.product_id) ?? { total_sold: 0, total_revenue: 0 };
      existing.total_sold += r.quantity;
      existing.total_revenue += Number(r.subtotal);
      productMap.set(r.product_id, existing);

      distinctOrders.add(r.order_id);
      totalRevenue += Number(r.subtotal);
    }

    // Fetch product names for the aggregated products
    const productIds = [...productMap.keys()];
    const nameMap = new Map<string, string>();

    if (productIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("id, name")
        .in("id", productIds);

      for (const p of (products ?? []) as Array<{ id: string; name: string }>) {
        nameMap.set(p.id, p.name);
      }
    }

    // Build top_products sorted by total_sold descending, top 5
    const topProducts: TopProduct[] = [...productMap.entries()]
      .map(([pid, stats]) => ({
        product_id: pid,
        name: nameMap.get(pid) ?? "Unknown",
        total_sold: stats.total_sold,
        total_revenue: Math.round(stats.total_revenue * 100) / 100,
      }))
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 5);

    const totalOrders = distinctOrders.size;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      top_products: topProducts,
      summary: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_orders: totalOrders,
        average_order_value: Math.round(averageOrderValue * 100) / 100,
      },
    };
  }
}
