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
