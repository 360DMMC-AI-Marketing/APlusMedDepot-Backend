import { supabaseAdmin } from "../config/supabase";
import type { SubOrder } from "../types/order.types";

const DEFAULT_TAX_RATE = 0.0825;

type MasterOrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  parent_order_id: string | null;
  shipping_address: unknown;
  status: string;
  payment_status: string;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  supplier_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  suppliers: { business_name: string } | null;
};

type SubOrderDbRow = {
  id: string;
  order_number: string;
  supplier_id: string;
  total_amount: string;
  tax_amount: string;
  status: string;
  created_at: string;
};

type ItemRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
};

/**
 * Split a master order into sub-orders grouped by supplier.
 * Groups order_items by supplier_id, creates one sub-order per supplier with
 * order number format `SUB-{masterNumber}-{index}`, and calculates per-sub-order
 * tax at 8.25%. Failure to create a sub-order is non-fatal (logged, not thrown).
 * @param masterOrderId - The master order UUID to split
 * @returns Array of created sub-orders with items, amounts, and supplier info
 */
export async function splitOrderBySupplier(masterOrderId: string): Promise<SubOrder[]> {
  // a) Fetch master order
  const { data: masterData, error: masterError } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, customer_id, parent_order_id, shipping_address, status, payment_status",
    )
    .eq("id", masterOrderId)
    .single();

  if (masterError || !masterData) {
    console.warn(`[ORDER_SPLIT] Master order ${masterOrderId} not found`);
    return [];
  }

  const masterOrder = masterData as unknown as MasterOrderRow;

  if (masterOrder.parent_order_id !== null) {
    console.warn(
      `[ORDER_SPLIT] Order ${masterOrderId} is not a master order (has parent_order_id)`,
    );
    return [];
  }

  // b) Fetch order items with supplier names
  const { data: itemsData, error: itemsError } = await supabaseAdmin
    .from("order_items")
    .select("id, product_id, supplier_id, quantity, unit_price, subtotal, suppliers(business_name)")
    .eq("order_id", masterOrderId);

  if (itemsError) {
    console.warn(
      `[ORDER_SPLIT] Failed to fetch items for order ${masterOrderId}: ${itemsError.message}`,
    );
    return [];
  }

  const items = (itemsData ?? []) as unknown as OrderItemRow[];

  if (items.length === 0) {
    return [];
  }

  // c) Group by supplier_id
  const supplierGroups = new Map<string, { items: OrderItemRow[]; supplierName: string }>();

  for (const item of items) {
    const existing = supplierGroups.get(item.supplier_id);
    if (existing) {
      existing.items.push(item);
    } else {
      supplierGroups.set(item.supplier_id, {
        items: [item],
        supplierName: item.suppliers?.business_name ?? "Unknown",
      });
    }
  }

  // d) Create sub-orders
  const subOrders: SubOrder[] = [];
  let supplierIndex = 1;

  for (const [supplierId, group] of supplierGroups) {
    try {
      const orderNumber = `SUB-${masterOrder.order_number}-${supplierIndex}`;
      const subtotal =
        Math.round(group.items.reduce((sum, item) => sum + Number(item.subtotal), 0) * 100) / 100;
      const taxAmount = Math.round(subtotal * DEFAULT_TAX_RATE * 100) / 100;
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

      const { data: subOrderData, error: subOrderError } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_id: masterOrder.customer_id,
          parent_order_id: masterOrderId,
          supplier_id: supplierId,
          order_number: orderNumber,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          shipping_address: masterOrder.shipping_address,
          status: masterOrder.status,
          payment_status: masterOrder.payment_status,
        })
        .select("id, order_number, created_at")
        .single();

      if (subOrderError || !subOrderData) {
        console.error(
          `[ORDER_SPLIT] Failed to create sub-order for supplier ${supplierId}: ${subOrderError?.message}`,
        );
        continue;
      }

      const created = subOrderData as unknown as {
        id: string;
        order_number: string;
        created_at: string;
      };

      subOrders.push({
        id: created.id,
        orderNumber: created.order_number,
        masterOrderId,
        supplierId,
        supplierName: group.supplierName,
        totalAmount,
        taxAmount,
        subtotal,
        status: masterOrder.status,
        items: group.items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          subtotal: Number(item.subtotal),
        })),
        createdAt: created.created_at,
      });

      supplierIndex++;
    } catch (err) {
      console.error(`[ORDER_SPLIT] Error creating sub-order for supplier ${supplierId}:`, err);
    }
  }

  return subOrders;
}

/**
 * Fetch all sub-orders for a master order, enriched with items and supplier names.
 * @param masterOrderId - The master order UUID
 * @returns Array of sub-orders with their items and supplier details
 */
export async function getSubOrders(masterOrderId: string): Promise<SubOrder[]> {
  const { data: subOrdersData, error: subOrdersError } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, supplier_id, total_amount, tax_amount, status, created_at")
    .eq("parent_order_id", masterOrderId);

  if (subOrdersError || !subOrdersData) {
    return [];
  }

  const rows = (subOrdersData ?? []) as unknown as SubOrderDbRow[];

  if (rows.length === 0) {
    return [];
  }

  // Batch fetch all items and supplier names (2 queries instead of 2N)
  const supplierIds = [...new Set(rows.map((r) => r.supplier_id))];

  const [allItemsResult, suppliersResult] = await Promise.all([
    supabaseAdmin
      .from("order_items")
      .select("id, product_id, supplier_id, quantity, unit_price, subtotal")
      .eq("order_id", masterOrderId),
    supabaseAdmin.from("suppliers").select("id, business_name").in("id", supplierIds),
  ]);

  // Group items by supplier_id
  type ItemWithSupplier = ItemRow & { supplier_id: string };
  const allItems = (allItemsResult.data ?? []) as unknown as ItemWithSupplier[];
  const itemsBySupplier = new Map<string, ItemWithSupplier[]>();
  for (const item of allItems) {
    const existing = itemsBySupplier.get(item.supplier_id);
    if (existing) {
      existing.push(item);
    } else {
      itemsBySupplier.set(item.supplier_id, [item]);
    }
  }

  // Build supplier name lookup
  type SupplierRow = { id: string; business_name: string };
  const suppliers = (suppliersResult.data ?? []) as unknown as SupplierRow[];
  const supplierNameMap = new Map<string, string>();
  for (const s of suppliers) {
    supplierNameMap.set(s.id, s.business_name);
  }

  const subOrders: SubOrder[] = rows.map((row) => {
    const items = itemsBySupplier.get(row.supplier_id) ?? [];
    const totalAmount = Number(row.total_amount);
    const taxAmount = Number(row.tax_amount);
    const subtotal = Math.round((totalAmount - taxAmount) * 100) / 100;

    return {
      id: row.id,
      orderNumber: row.order_number,
      masterOrderId,
      supplierId: row.supplier_id,
      supplierName: supplierNameMap.get(row.supplier_id) ?? "Unknown",
      totalAmount,
      taxAmount,
      subtotal,
      status: row.status,
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
      createdAt: row.created_at,
    };
  });

  return subOrders;
}

/**
 * Fetch a single sub-order for a specific supplier within a master order.
 * @param masterOrderId - The master order UUID
 * @param supplierId - The supplier UUID
 * @returns The sub-order with items and supplier name, or null if not found
 */
export async function getSupplierSubOrder(
  masterOrderId: string,
  supplierId: string,
): Promise<SubOrder | null> {
  const { data: subOrderData, error: subOrderError } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, supplier_id, total_amount, tax_amount, status, created_at")
    .eq("parent_order_id", masterOrderId)
    .eq("supplier_id", supplierId)
    .single();

  if (subOrderError || !subOrderData) {
    return null;
  }

  const row = subOrderData as unknown as SubOrderDbRow;

  // Fetch items and supplier name in parallel (2 concurrent queries instead of sequential)
  const [itemsResult, supplierResult] = await Promise.all([
    supabaseAdmin
      .from("order_items")
      .select("id, product_id, quantity, unit_price, subtotal")
      .eq("order_id", masterOrderId)
      .eq("supplier_id", supplierId),
    supabaseAdmin.from("suppliers").select("business_name").eq("id", supplierId).single(),
  ]);

  const items = (itemsResult.data ?? []) as unknown as ItemRow[];

  const supplier = supplierResult.data as unknown as { business_name: string } | null;

  const totalAmount = Number(row.total_amount);
  const taxAmount = Number(row.tax_amount);
  const subtotal = Math.round((totalAmount - taxAmount) * 100) / 100;

  return {
    id: row.id,
    orderNumber: row.order_number,
    masterOrderId,
    supplierId: row.supplier_id,
    supplierName: supplier?.business_name ?? "Unknown",
    totalAmount,
    taxAmount,
    subtotal,
    status: row.status,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
    createdAt: row.created_at,
  };
}
