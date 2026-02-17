import { supabaseAdmin } from "../config/supabase";
import { AppError, badRequest, notFound, forbidden } from "../utils/errors";
import { isValidTransition, getNextStatuses } from "../utils/orderStateMachine";
import { checkAndDecrementStock, incrementStock } from "../utils/inventory";
import { splitOrderBySupplier } from "./orderSplitting.service";
import type { ShippingAddress } from "../types/checkout.types";
import type { Order, OrderItem, OrderStatusHistory, OrderListResult } from "../types/order.types";
import type { OrderStatus } from "../utils/orderStateMachine";
import type { StockDecrementItem, IncrementItem } from "../utils/inventory";

const DEFAULT_TAX_RATE = 0.0825;

function getTaxRate(): number {
  const envRate = process.env.TAX_RATE;
  if (envRate !== undefined) {
    const parsed = Number(envRate);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_TAX_RATE;
}

function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hex = Math.random().toString(16).slice(2, 7).toUpperCase();
  return `ORD-${y}${m}${d}-${hex}`;
}

type ProductRow = {
  id: string;
  name: string;
  price: string;
  stock_quantity: number;
  status: string;
  is_deleted: boolean;
  supplier_id: string;
};

type CartItemRow = {
  id: string;
  product_id: string;
  quantity: number;
};

type OrderItemData = {
  product_id: string;
  supplier_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export class OrderService {
  static async createOrder(
    userId: string,
    shippingAddress: ShippingAddress,
    notes?: string,
  ): Promise<Order> {
    // ── Step 1: Get active cart ─────────────────────────────────────
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      throw badRequest("Cart is empty");
    }

    const cartRow = cart as { id: string };

    // ── Step 2: Get cart items ──────────────────────────────────────
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select("id, product_id, quantity")
      .eq("cart_id", cartRow.id);

    if (itemsError) {
      throw new AppError(itemsError.message, 500, "DATABASE_ERROR");
    }

    const cartItems = (items ?? []) as CartItemRow[];

    if (cartItems.length === 0) {
      throw badRequest("Cart is empty");
    }

    // ── Step 3: Fetch current product data ──────────────────────────
    const productIds = cartItems.map((item) => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock_quantity, status, is_deleted, supplier_id")
      .in("id", productIds);

    if (productsError) {
      throw new AppError(productsError.message, 500, "DATABASE_ERROR");
    }

    const productMap = new Map<string, ProductRow>();
    for (const p of (products ?? []) as unknown as ProductRow[]) {
      productMap.set(p.id, p);
    }

    // ── Step 4: Validate all products ───────────────────────────────
    const unavailable: string[] = [];
    const outOfStock: Array<{ productId: string; requested: number; available: number }> = [];

    for (const item of cartItems) {
      const product = productMap.get(item.product_id);
      if (!product || product.status !== "active" || product.is_deleted) {
        unavailable.push(item.product_id);
        continue;
      }
      if (product.stock_quantity < item.quantity) {
        outOfStock.push({
          productId: item.product_id,
          requested: item.quantity,
          available: product.stock_quantity,
        });
      }
    }

    if (unavailable.length > 0) {
      const err = badRequest("One or more products are unavailable");
      (err as AppError & { details: unknown }).details = { unavailable };
      throw err;
    }

    if (outOfStock.length > 0) {
      const err = badRequest("Insufficient stock for one or more items");
      (err as AppError & { details: unknown }).details = outOfStock;
      throw err;
    }

    // ── Step 5: Calculate totals with CURRENT prices ────────────────
    const orderItemsData: OrderItemData[] = [];

    for (const item of cartItems) {
      const product = productMap.get(item.product_id)!;
      const currentPrice = Number(product.price);
      const subtotal = Math.round(currentPrice * item.quantity * 100) / 100;
      orderItemsData.push({
        product_id: product.id,
        supplier_id: product.supplier_id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: currentPrice,
        subtotal,
      });
    }

    const subtotal =
      Math.round(orderItemsData.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const taxRate = getTaxRate();
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    // ── Step 6: Decrement stock (FOR UPDATE lock) ───────────────────
    const stockItems: StockDecrementItem[] = cartItems.map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
    }));

    await checkAndDecrementStock(stockItems, supabaseAdmin);

    // ── Step 7: Write operations (with compensation on failure) ─────
    const rollbackItems: IncrementItem[] = stockItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    try {
      // 7a: INSERT master order
      const orderNumber = generateOrderNumber();

      const { data: orderData, error: orderError } = await supabaseAdmin
        .from("orders")
        .insert({
          order_number: orderNumber,
          customer_id: userId,
          parent_order_id: null,
          supplier_id: null,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          shipping_address: shippingAddress,
          status: "pending_payment",
          payment_status: "pending",
          notes: notes ?? null,
        })
        .select(
          "id, order_number, customer_id, parent_order_id, supplier_id, total_amount, tax_amount, shipping_address, status, payment_status, payment_intent_id, notes, created_at, updated_at",
        )
        .single();

      if (orderError || !orderData) {
        throw new AppError(orderError?.message ?? "Failed to create order", 500, "DATABASE_ERROR");
      }

      const order = orderData as unknown as {
        id: string;
        order_number: string;
        customer_id: string;
        parent_order_id: string | null;
        supplier_id: string | null;
        total_amount: string;
        tax_amount: string;
        shipping_address: ShippingAddress;
        status: string;
        payment_status: string;
        payment_intent_id: string | null;
        notes: string | null;
        created_at: string;
        updated_at: string;
      };

      // 7b: INSERT order_items (batch)
      const orderItemsInsert = orderItemsData.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        supplier_id: item.supplier_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        fulfillment_status: "pending",
      }));

      const { data: insertedItems, error: itemsInsertError } = await supabaseAdmin
        .from("order_items")
        .insert(orderItemsInsert)
        .select(
          "id, order_id, product_id, supplier_id, quantity, unit_price, subtotal, fulfillment_status",
        );

      if (itemsInsertError) {
        throw new AppError(itemsInsertError.message, 500, "DATABASE_ERROR");
      }

      // 7c: Clear cart items (keep the cart record)
      const { error: clearError } = await supabaseAdmin
        .from("cart_items")
        .delete()
        .eq("cart_id", cartRow.id);

      if (clearError) {
        throw new AppError(clearError.message, 500, "DATABASE_ERROR");
      }

      // ── Step 8: Call order splitting stub ────────────────────────
      await splitOrderBySupplier(order.id);

      // ── Build response ───────────────────────────────────────────
      const typedItems = (insertedItems ?? []) as unknown as Array<{
        id: string;
        order_id: string;
        product_id: string;
        supplier_id: string;
        quantity: number;
        unit_price: string;
        subtotal: string;
        fulfillment_status: string;
      }>;

      const responseItems: OrderItem[] = typedItems.map((dbItem, index) => ({
        id: dbItem.id,
        order_id: dbItem.order_id,
        product_id: dbItem.product_id,
        product_name: orderItemsData[index].product_name,
        supplier_id: dbItem.supplier_id,
        quantity: dbItem.quantity,
        unit_price: Number(dbItem.unit_price),
        subtotal: Number(dbItem.subtotal),
        fulfillment_status: dbItem.fulfillment_status,
      }));

      return {
        id: order.id,
        order_number: order.order_number,
        customer_id: order.customer_id,
        parent_order_id: order.parent_order_id,
        supplier_id: order.supplier_id,
        total_amount: Number(order.total_amount),
        tax_amount: Number(order.tax_amount),
        shipping_address: order.shipping_address,
        status: order.status,
        payment_status: order.payment_status,
        payment_intent_id: order.payment_intent_id,
        notes: order.notes,
        items: responseItems,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
    } catch (err) {
      // COMPENSATION: restore stock if any write step failed after decrement
      try {
        await incrementStock(rollbackItems, supabaseAdmin);
      } catch {
        console.error("Stock rollback failed during order creation compensation");
      }
      throw err;
    }
  }

  // ── List customer orders with pagination ─────────────────────────────

  static async listOrders(
    userId: string,
    query: { page: number; limit: number; status?: string; sort_by: string; sort_order: string },
  ): Promise<OrderListResult> {
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total_amount, created_at, order_items(id)",
        { count: "exact" },
      )
      .eq("customer_id", userId)
      .is("parent_order_id", null);

    if (query.status) {
      q = q.eq("status", query.status);
    }

    const from = (query.page - 1) * query.limit;
    const to = from + query.limit - 1;

    q = q.order(query.sort_by, { ascending: query.sort_order === "asc" }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    type OrderListRow = {
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total_amount: string;
      created_at: string;
      order_items: Array<{ id: string }>;
    };

    const rows = (data as unknown as OrderListRow[] | null) ?? [];

    const orders = rows.map((row) => ({
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      payment_status: row.payment_status,
      total_amount: Number(row.total_amount),
      item_count: row.order_items.length,
      created_at: row.created_at,
    }));

    const total = count ?? 0;

    return {
      orders,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
      },
    };
  }

  // ── Update order status with transition validation ──────────────────

  static async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    changedBy: string,
    reason?: string,
  ): Promise<Order> {
    // 1. Fetch current order
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (fetchError || !current) {
      throw notFound("Order");
    }

    const currentOrder = current as unknown as { id: string; status: string };
    const currentStatus = currentOrder.status as OrderStatus;

    // 2. Validate transition
    if (!isValidTransition(currentStatus, newStatus)) {
      const allowed = getNextStatuses(currentStatus);
      throw badRequest(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. Allowed: [${allowed.join(", ")}]`,
      );
    }

    // 3. Update status
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId)
      .select(
        "id, order_number, customer_id, parent_order_id, supplier_id, total_amount, tax_amount, shipping_address, status, payment_status, payment_intent_id, notes, created_at, updated_at",
      )
      .single();

    if (updateError || !updated) {
      throw new AppError(
        updateError?.message ?? "Failed to update order status",
        500,
        "DATABASE_ERROR",
      );
    }

    // 4. Insert history record
    const { error: historyError } = await supabaseAdmin.from("order_status_history").insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: newStatus,
      changed_by: changedBy,
      reason: reason ?? null,
    });

    if (historyError) {
      throw new AppError(historyError.message, 500, "DATABASE_ERROR");
    }

    const order = updated as unknown as {
      id: string;
      order_number: string;
      customer_id: string;
      parent_order_id: string | null;
      supplier_id: string | null;
      total_amount: string;
      tax_amount: string;
      shipping_address: ShippingAddress;
      status: string;
      payment_status: string;
      payment_intent_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    return {
      id: order.id,
      order_number: order.order_number,
      customer_id: order.customer_id,
      parent_order_id: order.parent_order_id,
      supplier_id: order.supplier_id,
      total_amount: Number(order.total_amount),
      tax_amount: Number(order.tax_amount),
      shipping_address: order.shipping_address,
      status: order.status,
      payment_status: order.payment_status,
      payment_intent_id: order.payment_intent_id,
      notes: order.notes,
      items: [],
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }

  // ── Aggregate item fulfillment statuses → master order status ───────

  static async updateMasterOrderStatus(orderId: string, changedBy: string): Promise<void> {
    // 1. Fetch current order
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .single();

    if (fetchError || !current) return;

    const currentOrder = current as unknown as { id: string; status: string };

    // 2. Fetch all order items
    const { data: items, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("fulfillment_status")
      .eq("order_id", orderId);

    if (itemsError || !items || items.length === 0) return;

    const statuses = (items as unknown as Array<{ fulfillment_status: string }>).map(
      (i) => i.fulfillment_status,
    );

    // 3. Determine new master status
    const allDelivered = statuses.every((s) => s === "delivered");
    const allCancelled = statuses.every((s) => s === "cancelled");
    const allShipped = statuses.every((s) => s === "shipped");
    const anyShipped = statuses.some((s) => s === "shipped");
    const anyDelivered = statuses.some((s) => s === "delivered");

    let newStatus: OrderStatus | null = null;

    if (allDelivered) {
      newStatus = "delivered";
    } else if (allCancelled) {
      newStatus = "cancelled";
    } else if (allShipped) {
      newStatus = "fully_shipped";
    } else if (anyShipped || anyDelivered) {
      newStatus = "partially_shipped";
    }

    // 4. No change needed
    if (!newStatus || newStatus === currentOrder.status) return;

    // 5. Validate transition — skip silently if invalid
    if (!isValidTransition(currentOrder.status as OrderStatus, newStatus)) {
      console.warn(
        `[ORDER_STATUS] Skipping invalid auto-transition: ${currentOrder.status} → ${newStatus} for order ${orderId}`,
      );
      return;
    }

    // 6. Delegate to updateOrderStatus
    await OrderService.updateOrderStatus(
      orderId,
      newStatus,
      changedBy,
      "Auto-updated from item fulfillment statuses",
    );
  }

  // ── Get order by ID with items and status history ───────────────────

  static async getOrderById(orderId: string, userId: string, userRole: string): Promise<Order> {
    // 1. Fetch order
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
      shipping_address: ShippingAddress;
      status: string;
      payment_status: string;
      payment_intent_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };

    // 2. Authorization check
    if (userRole === "customer" && order.customer_id !== userId) {
      throw forbidden("You can only view your own orders");
    }

    // 3. Fetch items with product & supplier joins
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, product_id, supplier_id, quantity, unit_price, subtotal, fulfillment_status, tracking_number, carrier, products(name, images), suppliers(business_name)",
      )
      .eq("order_id", orderId);

    if (itemsError) {
      throw new AppError(itemsError.message, 500, "DATABASE_ERROR");
    }

    type ItemRow = {
      id: string;
      order_id: string;
      product_id: string;
      supplier_id: string;
      quantity: number;
      unit_price: string;
      subtotal: string;
      fulfillment_status: string;
      tracking_number: string | null;
      carrier: string | null;
      products: { name: string; images: string[] | null } | null;
      suppliers: { business_name: string } | null;
    };

    const dbItems = (itemsData ?? []) as unknown as ItemRow[];

    const responseItems: OrderItem[] = dbItems.map((dbItem) => ({
      id: dbItem.id,
      order_id: dbItem.order_id,
      product_id: dbItem.product_id,
      product_name: dbItem.products?.name ?? "",
      supplier_id: dbItem.supplier_id,
      quantity: dbItem.quantity,
      unit_price: Number(dbItem.unit_price),
      subtotal: Number(dbItem.subtotal),
      fulfillment_status: dbItem.fulfillment_status,
      tracking_number: dbItem.tracking_number ?? null,
      carrier: dbItem.carrier ?? null,
      product_image: (dbItem.products?.images ?? [])[0] ?? null,
      supplier_name: dbItem.suppliers?.business_name ?? "",
    }));

    // 4. Fetch status history
    const { data: historyData, error: historyError } = await supabaseAdmin
      .from("order_status_history")
      .select("id, order_id, from_status, to_status, changed_by, reason, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (historyError) {
      throw new AppError(historyError.message, 500, "DATABASE_ERROR");
    }

    const statusHistory = (historyData ?? []) as unknown as OrderStatusHistory[];

    return {
      id: order.id,
      order_number: order.order_number,
      customer_id: order.customer_id,
      parent_order_id: order.parent_order_id,
      supplier_id: order.supplier_id,
      total_amount: Number(order.total_amount),
      tax_amount: Number(order.tax_amount),
      shipping_address: order.shipping_address,
      status: order.status,
      payment_status: order.payment_status,
      payment_intent_id: order.payment_intent_id,
      notes: order.notes,
      items: responseItems,
      status_history: statusHistory,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }
}
