import { supabaseAdmin } from "../config/supabase";
import { forbidden, notFound } from "../utils/errors";
import type {
  SupplierOrderView,
  SupplierOrderDetail,
  SupplierOrderItem,
  SupplierOrderStats,
} from "../types/supplierOrder.types";

const DEFAULT_COMMISSION_RATE = 15;

type SubOrderRow = {
  id: string;
  order_number: string;
  parent_order_id: string;
  customer_id: string;
  total_amount: string;
  tax_amount: string;
  status: string;
  payment_status: string;
  shipping_address: unknown;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  fulfillment_status: string;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  products: { name: string } | null;
};

type StatusHistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  reason: string | null;
  created_at: string;
};

export class SupplierOrderService {
  static async getSupplierOrders(
    supplierId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ data: SupplierOrderView[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch supplier commission rate
    const commissionRate = await this.getSupplierCommissionRate(supplierId);
    const rate = commissionRate / 100;

    // Build query for sub-orders
    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, parent_order_id, customer_id, total_amount, tax_amount, status, payment_status, created_at, updated_at",
        { count: "exact" },
      )
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null);

    if (options?.status) {
      query = query.eq("status", options.status);
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
      throw new Error(`Failed to fetch supplier orders: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as SubOrderRow[];
    const total = count ?? 0;

    // Enrich with customer names and item counts
    const views: SupplierOrderView[] = [];

    for (const row of rows) {
      // Fetch item count for this supplier on the master order
      const { data: itemsData } = await supabaseAdmin
        .from("order_items")
        .select("id")
        .eq("order_id", row.parent_order_id)
        .eq("supplier_id", supplierId);

      const itemCount = (itemsData ?? []).length;

      // Fetch customer name
      const customerName = await this.getCustomerName(row.customer_id);

      const totalAmount = Number(row.total_amount);
      const commissionAmount = Math.round(totalAmount * rate * 100) / 100;
      const payoutAmount = Math.round((totalAmount - commissionAmount) * 100) / 100;

      views.push({
        id: row.id,
        orderNumber: row.order_number,
        masterOrderId: row.parent_order_id,
        customerId: row.customer_id,
        customerName,
        totalAmount,
        taxAmount: Number(row.tax_amount),
        commissionAmount,
        payoutAmount,
        commissionRate,
        status: row.status,
        paymentStatus: row.payment_status,
        itemCount,
        createdAt: row.created_at,
      });
    }

    return { data: views, total };
  }

  static async getSupplierOrderDetail(
    supplierId: string,
    subOrderId: string,
  ): Promise<SupplierOrderDetail> {
    // Fetch the sub-order
    const { data: subOrderData, error: subOrderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, parent_order_id, customer_id, supplier_id, total_amount, tax_amount, status, payment_status, shipping_address, created_at, updated_at",
      )
      .eq("id", subOrderId)
      .not("parent_order_id", "is", null)
      .single();

    if (subOrderError || !subOrderData) {
      throw notFound("Order");
    }

    const subOrder = subOrderData as unknown as SubOrderRow & { supplier_id: string };

    // Verify supplier ownership
    if (subOrder.supplier_id !== supplierId) {
      throw forbidden("You can only view your own orders");
    }

    // Fetch supplier commission rate
    const commissionRate = await this.getSupplierCommissionRate(supplierId);
    const rate = commissionRate / 100;

    // Fetch items from master order for this supplier
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, product_id, quantity, unit_price, subtotal, fulfillment_status, tracking_number, carrier, shipped_at, delivered_at, products(name)",
      )
      .eq("order_id", subOrder.parent_order_id)
      .eq("supplier_id", supplierId);

    if (itemsError) {
      throw new Error(`Failed to fetch order items: ${itemsError.message}`);
    }

    const dbItems = (itemsData ?? []) as unknown as OrderItemRow[];

    const items: SupplierOrderItem[] = dbItems.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.products?.name ?? "",
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      fulfillmentStatus: item.fulfillment_status,
      trackingNumber: item.tracking_number,
      carrier: item.carrier,
      shippedAt: item.shipped_at,
      deliveredAt: item.delivered_at,
    }));

    // Fetch customer name
    const customerName = await this.getCustomerName(subOrder.customer_id);

    // Fetch status history
    const { data: historyData } = await supabaseAdmin
      .from("order_status_history")
      .select("id, from_status, to_status, changed_by, reason, created_at")
      .eq("order_id", subOrderId)
      .order("created_at", { ascending: false });

    const historyRows = (historyData ?? []) as unknown as StatusHistoryRow[];

    const totalAmount = Number(subOrder.total_amount);
    const commissionAmount = Math.round(totalAmount * rate * 100) / 100;
    const payoutAmount = Math.round((totalAmount - commissionAmount) * 100) / 100;

    return {
      id: subOrder.id,
      orderNumber: subOrder.order_number,
      masterOrderId: subOrder.parent_order_id,
      customerId: subOrder.customer_id,
      customerName,
      totalAmount,
      taxAmount: Number(subOrder.tax_amount),
      commissionAmount,
      payoutAmount,
      commissionRate,
      status: subOrder.status,
      paymentStatus: subOrder.payment_status,
      shippingAddress: subOrder.shipping_address,
      items,
      statusHistory: historyRows.map((h) => ({
        id: h.id,
        fromStatus: h.from_status,
        toStatus: h.to_status,
        changedBy: h.changed_by,
        reason: h.reason,
        createdAt: h.created_at,
      })),
      createdAt: subOrder.created_at,
      updatedAt: subOrder.updated_at,
    };
  }

  static async getSupplierOrderStats(supplierId: string): Promise<SupplierOrderStats> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = currentMonthStart;

    // Orders this month
    const { data: thisMonthData, error: thisMonthError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null)
      .gte("created_at", currentMonthStart);

    if (thisMonthError) {
      throw new Error(`Failed to fetch this month orders: ${thisMonthError.message}`);
    }

    const ordersThisMonth = (thisMonthData ?? []).length;

    // Orders last month
    const { data: lastMonthData, error: lastMonthError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null)
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    if (lastMonthError) {
      throw new Error(`Failed to fetch last month orders: ${lastMonthError.message}`);
    }

    const ordersLastMonth = (lastMonthData ?? []).length;

    // Revenue this month from commissions (supplier_payout)
    const { data: revenueData, error: revenueError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", currentMonthStart);

    if (revenueError) {
      throw new Error(`Failed to fetch revenue: ${revenueError.message}`);
    }

    type PayoutRow = { supplier_payout: string };
    const revenueRows = (revenueData ?? []) as unknown as PayoutRow[];
    let revenueThisMonth = 0;
    for (const row of revenueRows) {
      revenueThisMonth += Number(row.supplier_payout);
    }
    revenueThisMonth = Math.round(revenueThisMonth * 100) / 100;

    // Average order value (all time sub-orders)
    const { data: allOrdersData, error: allOrdersError } = await supabaseAdmin
      .from("orders")
      .select("total_amount")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null);

    if (allOrdersError) {
      throw new Error(`Failed to fetch all orders: ${allOrdersError.message}`);
    }

    type AmountRow = { total_amount: string };
    const allRows = (allOrdersData ?? []) as unknown as AmountRow[];
    let totalAllOrders = 0;
    for (const row of allRows) {
      totalAllOrders += Number(row.total_amount);
    }
    const averageOrderValue =
      allRows.length > 0 ? Math.round((totalAllOrders / allRows.length) * 100) / 100 : 0;

    // Status counts
    const { data: statusData, error: statusError } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null);

    if (statusError) {
      throw new Error(`Failed to fetch order statuses: ${statusError.message}`);
    }

    type StatusRow = { status: string };
    const statusRows = (statusData ?? []) as unknown as StatusRow[];

    const statusCounts = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
    };

    for (const row of statusRows) {
      if (row.status === "pending_payment" || row.status === "payment_processing") {
        statusCounts.pending++;
      } else if (row.status === "payment_confirmed" || row.status === "awaiting_fulfillment") {
        statusCounts.processing++;
      } else if (row.status === "partially_shipped" || row.status === "fully_shipped") {
        statusCounts.shipped++;
      } else if (row.status === "delivered") {
        statusCounts.delivered++;
      }
    }

    return {
      ordersThisMonth,
      ordersLastMonth,
      revenueThisMonth,
      averageOrderValue,
      statusCounts,
    };
  }

  private static async getSupplierCommissionRate(supplierId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("commission_rate")
      .eq("id", supplierId)
      .single();

    if (error || !data) {
      return DEFAULT_COMMISSION_RATE;
    }

    const row = data as unknown as { commission_rate: string | null };
    return Number(row.commission_rate ?? DEFAULT_COMMISSION_RATE);
  }

  private static async getCustomerName(customerId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", customerId)
      .single();

    if (error || !data) {
      return "Unknown";
    }

    const user = data as unknown as {
      first_name: string | null;
      last_name: string | null;
      email: string;
    };

    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    }

    return user.email;
  }
}
