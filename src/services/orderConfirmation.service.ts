import { supabaseAdmin } from "../config/supabase";
import { notFound, forbidden } from "../utils/errors";
import { sendOrderConfirmation, sendSupplierNewOrder } from "./email.service";
import type { EmailOrderItem, ShippingAddress } from "./email.service";

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  total_amount: string;
  tax_amount: string;
  shipping_address: ShippingAddress | string;
  status: string;
  payment_status: string;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  supplier_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  products: { name: string } | null;
  suppliers: { id: string; business_name: string; commission_rate: string; user_id: string } | null;
};

type SupplierGroup = {
  supplierId: string;
  supplierEmail: string;
  commissionRate: number;
  items: EmailOrderItem[];
};

export class OrderConfirmationService {
  /**
   * Confirm an order after payment succeeds:
   * 1. Fetch order + items with supplier data
   * 2. Send customer confirmation email (fire-and-forget)
   * 3. Group items by supplier, calculate commission, send supplier emails
   * 4. Insert order_status_history record
   */
  static async confirmOrder(orderId: string): Promise<void> {
    // 1. Fetch order
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_id, total_amount, tax_amount, shipping_address, status, payment_status, created_at",
      )
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      console.warn(`[ORDER_CONFIRMATION] Order ${orderId} not found`);
      return;
    }

    const order = orderData as unknown as OrderRow;

    // 2. Fetch order items with product + supplier joins
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, product_id, supplier_id, quantity, unit_price, subtotal, products(name), suppliers(id, business_name, commission_rate, user_id)",
      )
      .eq("order_id", orderId);

    if (itemsError || !itemsData) {
      console.warn(`[ORDER_CONFIRMATION] Failed to fetch items for order ${orderId}`);
      return;
    }

    const items = itemsData as unknown as OrderItemRow[];

    // 3. Fetch customer email
    const { data: customer } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", order.customer_id)
      .single();

    const customerEmail = (customer as { email: string } | null)?.email;

    // 4. Send customer confirmation email (fire-and-forget)
    if (customerEmail) {
      const emailItems: EmailOrderItem[] = items.map((item) => ({
        name: item.products?.name ?? "Item",
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        lineSubtotal: Number(item.subtotal),
        supplierName: item.suppliers?.business_name,
      }));

      sendOrderConfirmation(
        {
          id: order.order_number ?? orderId,
          createdAt: order.created_at,
          status: order.status,
          total: Number(order.total_amount),
          items: emailItems,
        },
        customerEmail,
      );
    }

    // 5. Group items by supplier and send supplier emails
    const supplierMap = new Map<string, SupplierGroup>();

    for (const item of items) {
      const supplierId = item.supplier_id;
      if (!supplierId) continue;

      if (!supplierMap.has(supplierId)) {
        const supplierUserId = item.suppliers?.user_id;
        let supplierEmail = "";
        if (supplierUserId) {
          const { data: supplierUser } = await supabaseAdmin
            .from("users")
            .select("email")
            .eq("id", supplierUserId)
            .single();
          supplierEmail = (supplierUser as { email: string } | null)?.email ?? "";
        }

        supplierMap.set(supplierId, {
          supplierId,
          supplierEmail,
          commissionRate: Number(item.suppliers?.commission_rate ?? "15"),
          items: [],
        });
      }

      const subtotal = Number(item.subtotal);
      const group = supplierMap.get(supplierId)!;
      const commissionAmount = subtotal * (group.commissionRate / 100);
      const supplierPayout = subtotal - commissionAmount;

      group.items.push({
        name: item.products?.name ?? "Item",
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        lineSubtotal: subtotal,
        commissionRate: group.commissionRate / 100,
        commissionAmount,
        supplierPayout,
      });
    }

    for (const group of supplierMap.values()) {
      if (group.supplierEmail) {
        sendSupplierNewOrder(group.supplierEmail, group.items, order.shipping_address);
      }
    }

    // 6. Insert order_status_history record
    await supabaseAdmin.from("order_status_history").insert({
      order_id: orderId,
      from_status: "pending_payment",
      to_status: "confirmed",
      changed_by: order.customer_id,
      reason: "Payment confirmed via Stripe webhook",
    });
  }

  /**
   * Get full order details for the confirmation page.
   * Only the order's customer can view this.
   */
  static async getOrderConfirmation(
    orderId: string,
    customerId: string,
  ): Promise<{
    order: {
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total_amount: number;
      tax_amount: number;
      shipping_address: ShippingAddress | string;
      created_at: string;
      items: Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
        supplier_name: string;
      }>;
    };
  }> {
    // 1. Fetch order
    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_id, total_amount, tax_amount, shipping_address, status, payment_status, created_at",
      )
      .eq("id", orderId)
      .single();

    if (orderError || !orderData) {
      throw notFound("Order");
    }

    const order = orderData as unknown as OrderRow;

    if (order.customer_id !== customerId) {
      throw forbidden("You can only view your own order confirmations");
    }

    // 2. Fetch items with product + supplier names
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, product_id, supplier_id, quantity, unit_price, subtotal, products(name), suppliers(business_name)",
      )
      .eq("order_id", orderId);

    if (itemsError) {
      throw notFound("Order items");
    }

    type ConfirmationItemRow = {
      id: string;
      product_id: string;
      supplier_id: string;
      quantity: number;
      unit_price: string;
      subtotal: string;
      products: { name: string } | null;
      suppliers: { business_name: string } | null;
    };

    const dbItems = (itemsData ?? []) as unknown as ConfirmationItemRow[];

    return {
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        total_amount: Number(order.total_amount),
        tax_amount: Number(order.tax_amount),
        shipping_address: order.shipping_address,
        created_at: order.created_at,
        items: dbItems.map((item) => ({
          product_name: item.products?.name ?? "",
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          supplier_name: item.suppliers?.business_name ?? "",
        })),
      },
    };
  }
}
