import { supabaseAdmin } from "../config/supabase";
import { AdminUserService } from "./adminUser.service";
import { AdminOrderService } from "./adminOrder.service";
import { PlatformAnalyticsService } from "./platformAnalytics.service";
import type { DashboardSummary } from "../types/admin.types";

export class AdminDashboardService {
  static async getDashboardSummary(): Promise<DashboardSummary> {
    const [
      pendingResult,
      revenueResult,
      orderMetricsResult,
      statusResult,
      recentResult,
      healthResult,
    ] = await Promise.all([
      // a) Pending actions
      AdminUserService.getPendingCount().catch(() => ({
        users: 0,
        suppliers: 0,
        products: 0,
      })),

      // b) Revenue snapshot
      PlatformAnalyticsService.getRevenueMetrics("month").catch(() => ({
        current: {
          totalSales: 0,
          totalCommission: 0,
          totalSupplierPayouts: 0,
          netPlatformRevenue: 0,
          orderCount: 0,
        },
        previous: {
          totalSales: 0,
          totalCommission: 0,
          totalSupplierPayouts: 0,
          netPlatformRevenue: 0,
          orderCount: 0,
        },
        changePercent: { sales: 0, commission: 0, orders: 0 },
      })),

      // c) Order metrics
      PlatformAnalyticsService.getOrderMetrics("month").catch(() => ({
        totalOrders: 0,
        paidOrders: 0,
        cancelledOrders: 0,
        averageOrderValue: 0,
        conversionRate: 0,
      })),

      // d) Order status counts
      AdminOrderService.getOrdersByStatus().catch(() => ({}) as Record<string, number>),

      // e) Recent orders
      AdminOrderService.listOrders({ page: 1, limit: 5 }).catch(() => ({
        data: [],
        total: 0,
        page: 1,
        limit: 5,
        totalPages: 0,
      })),

      // f) Platform health
      AdminDashboardService.getPlatformHealth().catch(() => ({
        activeUsers: 0,
        activeSuppliers: 0,
        activeProducts: 0,
      })),
    ]);

    const pending = pendingResult;

    return {
      pendingActions: {
        users: pending.users,
        suppliers: pending.suppliers,
        products: pending.products,
        total: pending.users + pending.suppliers + pending.products,
      },
      revenue: {
        thisMonth: revenueResult.current.totalSales,
        lastMonth: revenueResult.previous.totalSales,
        changePercent: revenueResult.changePercent.sales,
      },
      orders: {
        thisMonth: orderMetricsResult.totalOrders,
        averageValue: orderMetricsResult.averageOrderValue,
        byStatus: statusResult,
      },
      recentOrders: recentResult.data,
      platformHealth: healthResult,
    };
  }

  private static async getPlatformHealth(): Promise<{
    activeUsers: number;
    activeSuppliers: number;
    activeProducts: number;
  }> {
    const [usersRes, suppliersRes, productsRes] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      supabaseAdmin
        .from("suppliers")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved"),
      supabaseAdmin
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

    return {
      activeUsers: usersRes.count ?? 0,
      activeSuppliers: suppliersRes.count ?? 0,
      activeProducts: productsRes.count ?? 0,
    };
  }
}
