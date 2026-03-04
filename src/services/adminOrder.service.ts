import { supabaseAdmin } from "../config/supabase";
import { notFound } from "../utils/errors";
import type {
  AdminOrderListItem,
  AdminOrderDetail,
  AdminOrderItem,
  AdminSubOrder,
  PaymentRecord,
  CommissionBreakdown,
  StatusHistoryEntry,
  PaginatedResult,
  OrderStatusCounts,
} from "../types/admin.types";

// ── Row types ────────────────────────────────────────────────────────────

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  parent_order_id: string | null;
  supplier_id: string | null;
  total_amount: string;
  tax_amount: string;
  shipping_address: unknown;
  status: string;
  payment_status: string;
  payment_intent_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  users: { email: string; first_name: string | null; last_name: string | null } | null;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  supplier_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  fulfillment_status: string;
  tracking_number: string | null;
  carrier: string | null;
  products: { name: string; sku: string | null } | null;
  suppliers: { business_name: string } | null;
};

type SubOrderRow = {
  id: string;
  order_number: string;
  supplier_id: string;
  total_amount: string;
  status: string;
  suppliers: { business_name: string } | null;
  order_items: Array<{ id: string }>;
};

type PaymentRow = {
  id: string;
  amount: string;
  currency: string;
  status: string;
  payment_method: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
};

type CommissionRow = {
  id: string;
  order_item_id: string;
  supplier_id: string;
  sale_amount: string;
  commission_rate: string;
  commission_amount: string;
  platform_amount: string;
  supplier_payout: string;
  status: string;
  order_items: {
    products: { name: string } | null;
  } | null;
  suppliers: { business_name: string } | null;
};

type HistoryRow = {
  from_status: string | null;
  to_status: string;
  created_at: string;
  reason: string | null;
};

// ── Service ──────────────────────────────────────────────────────────────

export class AdminOrderService {
  static async listOrders(options?: {
    page?: number;
    limit?: number;
    status?: string;
    paymentStatus?: string;
    customerId?: string;
    supplierId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortBy?: "created_at" | "total_amount" | "order_number";
    sortOrder?: "asc" | "desc";
    masterOnly?: boolean;
  }): Promise<PaginatedResult<AdminOrderListItem>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? "created_at";
    const sortOrder = options?.sortOrder ?? "desc";
    const masterOnly = options?.masterOnly !== false; // default true
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_id, parent_order_id, total_amount, tax_amount, status, payment_status, created_at, updated_at, users!orders_customer_id_fkey(email, first_name, last_name)",
        { count: "exact" },
      );

    if (masterOnly) {
      query = query.is("parent_order_id", null);
    }

    if (options?.status) {
      query = query.eq("status", options.status);
    }
    if (options?.paymentStatus) {
      query = query.eq("payment_status", options.paymentStatus);
    }
    if (options?.customerId) {
      query = query.eq("customer_id", options.customerId);
    }
    if (options?.startDate) {
      query = query.gte("created_at", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("created_at", options.endDate);
    }
    if (options?.search) {
      query = query.or(`order_number.ilike.%${options.search}%`);
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list orders: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as OrderRow[];
    const total = count ?? 0;

    // Enrich with item counts and sub-order counts
    const items: AdminOrderListItem[] = [];

    for (const row of rows) {
      // Item count
      const { count: itemCount } = await supabaseAdmin
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("order_id", row.id);

      // Sub-order count (only for master orders)
      let subOrderCount = 0;
      if (!row.parent_order_id) {
        const { count: subCount } = await supabaseAdmin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("parent_order_id", row.id);
        subOrderCount = subCount ?? 0;
      }

      const customerName =
        row.users?.first_name && row.users?.last_name
          ? `${row.users.first_name} ${row.users.last_name}`
          : (row.users?.email ?? "Unknown");

      items.push({
        id: row.id,
        orderNumber: row.order_number,
        customerEmail: row.users?.email ?? "Unknown",
        customerName,
        totalAmount: Number(row.total_amount),
        taxAmount: Number(row.tax_amount),
        status: row.status,
        paymentStatus: row.payment_status,
        itemCount: itemCount ?? 0,
        subOrderCount,
        createdAt: row.created_at,
      });
    }

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getOrderDetail(orderId: string): Promise<AdminOrderDetail> {
    // a) Fetch order
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_id, parent_order_id, supplier_id, total_amount, tax_amount, shipping_address, status, payment_status, payment_intent_id, notes, created_at, updated_at",
      )
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      throw notFound("Order");
    }

    const order = orderData as unknown as {
      id: string;
      order_number: string;
      customer_id: string;
      parent_order_id: string | null;
      supplier_id: string | null;
      total_amount: string;
      tax_amount: string;
      shipping_address: unknown;
      status: string;
      payment_status: string;
      payment_intent_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    // b) Fetch customer info
    const { data: customerData } = await supabaseAdmin
      .from("users")
      .select("id, email, first_name, last_name, phone")
      .eq("id", order.customer_id)
      .single();

    const customer = (customerData as unknown as {
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    }) ?? {
      id: order.customer_id,
      email: "Unknown",
      first_name: null,
      last_name: null,
      phone: null,
    };

    // c) Fetch order items with product and supplier joins
    const { data: itemsData } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, product_id, supplier_id, quantity, unit_price, subtotal, fulfillment_status, tracking_number, carrier, products(name, sku), suppliers(business_name)",
      )
      .eq("order_id", orderId);

    const itemRows = (itemsData ?? []) as unknown as OrderItemRow[];

    const items: AdminOrderItem[] = itemRows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.products?.name ?? "Unknown",
      productSku: row.products?.sku ?? "",
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.business_name ?? "Unknown",
      quantity: row.quantity,
      unitPrice: Number(row.unit_price),
      subtotal: Number(row.subtotal),
      fulfillmentStatus: row.fulfillment_status,
      trackingNumber: row.tracking_number,
      carrier: row.carrier,
    }));

    // d) Fetch sub-orders
    const { data: subOrdersData } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, supplier_id, total_amount, status, suppliers!orders_supplier_id_fkey(business_name), order_items(id)",
      )
      .eq("parent_order_id", orderId);

    const subOrderRows = (subOrdersData ?? []) as unknown as SubOrderRow[];

    const subOrders: AdminSubOrder[] = subOrderRows.map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.business_name ?? "Unknown",
      totalAmount: Number(row.total_amount),
      status: row.status,
      itemCount: (row.order_items ?? []).length,
    }));

    // e) Fetch payment records
    const { data: paymentsData } = await supabaseAdmin
      .from("payments")
      .select("id, amount, currency, status, payment_method, failure_reason, paid_at, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    const paymentRows = (paymentsData ?? []) as unknown as PaymentRow[];

    const payments: PaymentRecord[] = paymentRows.map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.payment_method,
      failureReason: row.failure_reason,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    }));

    // f) Fetch commissions with product/supplier joins
    const { data: commissionsData } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, order_item_id, supplier_id, sale_amount, commission_rate, commission_amount, platform_amount, supplier_payout, status, order_items(products(name)), suppliers(business_name)",
      )
      .eq("order_id", orderId);

    const commissionRows = (commissionsData ?? []) as unknown as CommissionRow[];

    const commissions: CommissionBreakdown[] = commissionRows.map((row) => ({
      orderItemId: row.order_item_id,
      productName: row.order_items?.products?.name ?? "Unknown",
      supplierName: row.suppliers?.business_name ?? "Unknown",
      saleAmount: Number(row.sale_amount),
      commissionRate: Number(row.commission_rate),
      commissionAmount: Number(row.commission_amount),
      platformAmount: Number(row.platform_amount),
      supplierAmount: Number(row.supplier_payout),
      status: row.status,
    }));

    // g) Fetch status history
    const { data: historyData } = await supabaseAdmin
      .from("order_status_history")
      .select("from_status, to_status, created_at, reason")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    const historyRows = (historyData ?? []) as unknown as HistoryRow[];

    const statusHistory: StatusHistoryEntry[] = historyRows.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedAt: row.created_at,
      reason: row.reason,
    }));

    // h) Calculate summary
    const totalPlatformCommission = commissions
      .filter((c) => c.status !== "reversed")
      .reduce((sum, c) => sum + c.platformAmount, 0);

    const totalSupplierPayouts = commissions
      .filter((c) => c.status !== "reversed")
      .reduce((sum, c) => sum + c.supplierAmount, 0);

    return {
      id: order.id,
      orderNumber: order.order_number,
      customer: {
        id: customer.id,
        email: customer.email,
        firstName: customer.first_name ?? "",
        lastName: customer.last_name ?? "",
        phone: customer.phone,
      },
      totalAmount: Number(order.total_amount),
      taxAmount: Number(order.tax_amount),
      shippingAddress: order.shipping_address,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentIntentId: order.payment_intent_id,
      items,
      subOrders,
      payments,
      commissions,
      statusHistory,
      summary: {
        totalItems: items.length,
        totalPlatformCommission: Math.round(totalPlatformCommission * 100) / 100,
        totalSupplierPayouts: Math.round(totalSupplierPayouts * 100) / 100,
      },
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  static async searchOrders(query: string): Promise<AdminOrderListItem[]> {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_id, parent_order_id, total_amount, tax_amount, status, payment_status, created_at, users!orders_customer_id_fkey(email, first_name, last_name)",
      )
      .is("parent_order_id", null)
      .or(`order_number.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to search orders: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as OrderRow[];

    return rows.map((row) => {
      const customerName =
        row.users?.first_name && row.users?.last_name
          ? `${row.users.first_name} ${row.users.last_name}`
          : (row.users?.email ?? "Unknown");

      return {
        id: row.id,
        orderNumber: row.order_number,
        customerEmail: row.users?.email ?? "Unknown",
        customerName,
        totalAmount: Number(row.total_amount),
        taxAmount: Number(row.tax_amount),
        status: row.status,
        paymentStatus: row.payment_status,
        itemCount: 0,
        subOrderCount: 0,
        createdAt: row.created_at,
      };
    });
  }

  static async getOrdersByStatus(): Promise<OrderStatusCounts> {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("status")
      .is("parent_order_id", null);

    if (error) {
      throw new Error(`Failed to get order status counts: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as Array<{ status: string }>;

    const counts: OrderStatusCounts = {};
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }

    return counts;
  }
}
