import { supabaseAdmin } from "../config/supabase";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";
import { sendShippingNotification } from "./email.service";
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
  /**
   * List sub-orders for a supplier with pagination, status, and date filtering.
   * Enriches each order with customer name, item count, and commission breakdown.
   * @param supplierId - The supplier UUID
   * @param options - Pagination (page, limit), status filter, date range (startDate, endDate)
   * @returns Paginated list of supplier order views with total count
   */
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

    // Batch fetch customer names and item counts (2 queries instead of 2N)
    const customerIds = [...new Set(rows.map((r) => r.customer_id))];
    const parentOrderIds = [...new Set(rows.map((r) => r.parent_order_id))];

    const [customersResult, itemsResult] = await Promise.all([
      supabaseAdmin.from("users").select("id, first_name, last_name, email").in("id", customerIds),
      supabaseAdmin
        .from("order_items")
        .select("id, order_id")
        .in("order_id", parentOrderIds)
        .eq("supplier_id", supplierId),
    ]);

    // Build customer name lookup
    type CustomerRow = {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    };
    const customers = (customersResult.data ?? []) as unknown as CustomerRow[];
    const customerNameMap = new Map<string, string>();
    for (const c of customers) {
      customerNameMap.set(
        c.id,
        c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email,
      );
    }

    // Build item count lookup by parent_order_id
    type ItemIdRow = { id: string; order_id: string };
    const allItems = (itemsResult.data ?? []) as unknown as ItemIdRow[];
    const itemCountMap = new Map<string, number>();
    for (const item of allItems) {
      itemCountMap.set(item.order_id, (itemCountMap.get(item.order_id) ?? 0) + 1);
    }

    const views: SupplierOrderView[] = rows.map((row) => {
      const totalAmount = Number(row.total_amount);
      const commissionAmount = Math.round(totalAmount * rate * 100) / 100;
      const payoutAmount = Math.round((totalAmount - commissionAmount) * 100) / 100;

      return {
        id: row.id,
        orderNumber: row.order_number,
        masterOrderId: row.parent_order_id,
        customerId: row.customer_id,
        customerName: customerNameMap.get(row.customer_id) ?? "Unknown",
        totalAmount,
        taxAmount: Number(row.tax_amount),
        commissionAmount,
        payoutAmount,
        commissionRate,
        status: row.status,
        paymentStatus: row.payment_status,
        itemCount: itemCountMap.get(row.parent_order_id) ?? 0,
        createdAt: row.created_at,
      };
    });

    return { data: views, total };
  }

  /**
   * Get full detail for a sub-order including items, commission breakdown,
   * shipping address, and status history. Verifies supplier ownership.
   * @param supplierId - The supplier UUID
   * @param subOrderId - The sub-order UUID
   * @returns Full order detail with items, history, and financials
   * @throws 404 if order not found, 403 if order belongs to another supplier
   */
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

  /**
   * Get order statistics: this/last month order counts, revenue from commissions,
   * average order value, and status breakdown (pending/processing/shipped/delivered).
   * @param supplierId - The supplier UUID
   * @returns Order stats with month-over-month counts and revenue
   */
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

    // Average order value and status counts (single query instead of two)
    const { data: allOrdersData, error: allOrdersError } = await supabaseAdmin
      .from("orders")
      .select("total_amount, status")
      .eq("supplier_id", supplierId)
      .not("parent_order_id", "is", null);

    if (allOrdersError) {
      throw new Error(`Failed to fetch all orders: ${allOrdersError.message}`);
    }

    type OrderRow = { total_amount: string; status: string };
    const allRows = (allOrdersData ?? []) as unknown as OrderRow[];

    let totalAllOrders = 0;
    const statusCounts = {
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
    };

    for (const row of allRows) {
      totalAllOrders += Number(row.total_amount);

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

    const averageOrderValue =
      allRows.length > 0 ? Math.round((totalAllOrders / allRows.length) * 100) / 100 : 0;

    return {
      ordersThisMonth,
      ordersLastMonth,
      revenueThisMonth,
      averageOrderValue,
      statusCounts,
    };
  }

  /**
   * Update the fulfillment status of an order item.
   * Validates state machine transitions (pending->processing->shipped->delivered),
   * records tracking info on 'shipped', sends shipping notification email,
   * and auto-updates master order status based on all items' fulfillment.
   * @param supplierId - The supplier UUID (must own the item)
   * @param orderItemId - The order item UUID
   * @param data - New status plus optional trackingNumber and carrier (required for 'shipped')
   * @throws 404 if item not found, 403 if wrong supplier, 409 if invalid transition
   */
  static async updateItemFulfillment(
    supplierId: string,
    orderItemId: string,
    data: {
      fulfillmentStatus: "processing" | "shipped" | "delivered";
      trackingNumber?: string;
      carrier?: string;
    },
  ): Promise<void> {
    // Fetch the order item and verify supplier ownership
    const { data: itemData, error: itemError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, supplier_id, product_id, quantity, unit_price, fulfillment_status, products(name)",
      )
      .eq("id", orderItemId)
      .single();

    if (itemError || !itemData) {
      throw notFound("Order item");
    }

    type FulfillmentItemRow = {
      id: string;
      order_id: string;
      supplier_id: string;
      product_id: string;
      quantity: number;
      unit_price: string;
      fulfillment_status: string;
      products: { name: string } | null;
    };

    const item = itemData as unknown as FulfillmentItemRow;

    if (item.supplier_id !== supplierId) {
      throw forbidden("You can only update your own order items");
    }

    // Defense-in-depth: enforce tracking + carrier whitelist server-side
    // (controller Zod schema is the primary guard; this catches direct service callers).
    if (data.fulfillmentStatus === "shipped") {
      if (!data.trackingNumber || data.trackingNumber.trim().length === 0) {
        throw badRequest("trackingNumber is required when marking as shipped");
      }
      const VALID_CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;
      if (!data.carrier || !(VALID_CARRIERS as readonly string[]).includes(data.carrier)) {
        throw badRequest("carrier must be one of: USPS, UPS, FedEx, DHL, Other");
      }
    }

    // Validate state transition
    const currentStatus = item.fulfillment_status;
    const newStatus = data.fulfillmentStatus;

    const validTransitions: Record<string, string[]> = {
      pending: ["processing"],
      processing: ["shipped"],
      shipped: ["delivered"],
    };

    const allowed = validTransitions[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw conflict(`Invalid status transition from '${currentStatus}' to '${newStatus}'`);
    }

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      fulfillment_status: newStatus,
    };

    if (newStatus === "shipped") {
      updatePayload.tracking_number = data.trackingNumber;
      updatePayload.carrier = data.carrier;
      updatePayload.shipped_at = new Date().toISOString();
    }

    if (newStatus === "delivered") {
      updatePayload.delivered_at = new Date().toISOString();
    }

    // Update the order item
    const { error: updateError } = await supabaseAdmin
      .from("order_items")
      .update(updatePayload)
      .eq("id", orderItemId);

    if (updateError) {
      throw new Error(`Failed to update fulfillment status: ${updateError.message}`);
    }

    // Fire-and-forget: send shipping notification email
    if (newStatus === "shipped") {
      try {
        // Fetch order and customer info for the email
        const { data: orderData } = await supabaseAdmin
          .from("orders")
          .select("id, order_number, customer_id")
          .eq("id", item.order_id)
          .single();

        if (orderData) {
          const order = orderData as unknown as {
            id: string;
            order_number: string;
            customer_id: string;
          };

          const { data: customerData } = await supabaseAdmin
            .from("users")
            .select("email")
            .eq("id", order.customer_id)
            .single();

          const customer = customerData as unknown as { email: string } | null;

          // Fetch supplier name
          const { data: supplierData } = await supabaseAdmin
            .from("suppliers")
            .select("business_name")
            .eq("id", supplierId)
            .single();

          const supplier = supplierData as unknown as { business_name: string } | null;

          sendShippingNotification(
            {
              id: order.order_number,
              customerEmail: customer?.email,
            },
            {
              name: item.products?.name,
              quantity: item.quantity,
              unitPrice: Number(item.unit_price),
              supplierName: supplier?.business_name,
            },
            {
              carrier: data.carrier,
              trackingNumber: data.trackingNumber,
            },
          );
        }
      } catch (emailError) {
        console.error("[FULFILLMENT] Failed to send shipping notification:", emailError);
      }
    }

    // Check and update master order status
    await this.checkAndUpdateMasterOrderStatus(item.order_id);
  }

  /**
   * Auto-update master order status based on all items' fulfillment statuses.
   * Rules: all delivered -> 'delivered', all shipped/delivered -> 'fully_shipped',
   * some shipped -> 'partially_shipped'. Inserts status history record.
   * @param masterOrderId - The master order UUID to evaluate and update
   */
  static async checkAndUpdateMasterOrderStatus(masterOrderId: string): Promise<void> {
    // Fetch ALL order items for this master order
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("fulfillment_status")
      .eq("order_id", masterOrderId);

    if (itemsError || !itemsData || itemsData.length === 0) {
      return;
    }

    type FulfillmentRow = { fulfillment_status: string };
    const statuses = (itemsData as unknown as FulfillmentRow[]).map(
      (row) => row.fulfillment_status,
    );

    // Determine new master order status
    const allDelivered = statuses.every((s) => s === "delivered");
    const allShippedOrDelivered = statuses.every((s) => s === "shipped" || s === "delivered");
    const someShipped = statuses.some((s) => s === "shipped" || s === "delivered");

    let newOrderStatus: string | null = null;

    if (allDelivered) {
      newOrderStatus = "delivered";
    } else if (allShippedOrDelivered) {
      newOrderStatus = "fully_shipped";
    } else if (someShipped) {
      newOrderStatus = "partially_shipped";
    }

    if (!newOrderStatus) {
      return;
    }

    // Fetch current master order status
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("id", masterOrderId)
      .is("parent_order_id", null)
      .single();

    if (orderError || !orderData) {
      return;
    }

    const order = orderData as unknown as { id: string; status: string };

    if (order.status === newOrderStatus) {
      return;
    }

    // Update the master order status
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: newOrderStatus })
      .eq("id", masterOrderId);

    if (updateError) {
      console.error(`[FULFILLMENT] Failed to update master order status: ${updateError.message}`);
      return;
    }

    // Insert status history record
    const { error: historyError } = await supabaseAdmin.from("order_status_history").insert({
      order_id: masterOrderId,
      from_status: order.status,
      to_status: newOrderStatus,
      changed_by: "system",
      reason: "Auto-updated from item fulfillment statuses",
    });

    if (historyError) {
      console.error(`[FULFILLMENT] Failed to insert status history: ${historyError.message}`);
    }
  }

  /**
   * Fetch a supplier's commission rate (percentage). Returns DEFAULT_COMMISSION_RATE (15) on error.
   * @param supplierId - The supplier UUID
   * @returns Commission rate as percentage (e.g. 15 for 15%)
   */
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
