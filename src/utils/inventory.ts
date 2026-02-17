import { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "../config/supabase";
import { AppError, notFound, badRequest } from "./errors";

export interface StockCheckResult {
  available: boolean;
  currentStock: number;
}

export interface StockDecrementItem {
  productId: string;
  quantity: number;
}

export interface DecrementedItem {
  productId: string;
  oldStock: number;
  newStock: number;
}

export interface StockDecrementResult {
  success: true;
  decremented: DecrementedItem[];
}

export interface IncrementItem {
  productId: string;
  quantity: number;
}

/**
 * Non-locking stock check for optimistic reads (e.g. "Add to Cart").
 * Does NOT use FOR UPDATE — safe outside transactions.
 */
export async function checkStock(
  productId: string,
  requestedQty: number,
): Promise<StockCheckResult> {
  if (requestedQty < 0) {
    throw badRequest("Requested quantity cannot be negative");
  }

  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, stock_quantity")
    .eq("id", productId)
    .eq("is_deleted", false)
    .single();

  if (error || !data) {
    throw notFound("Product");
  }

  const row = data as unknown as { id: string; stock_quantity: number };

  return {
    available: row.stock_quantity >= requestedQty,
    currentStock: row.stock_quantity,
  };
}

/**
 * Atomically check and decrement stock for multiple items within a transaction.
 * Uses SELECT ... FOR UPDATE to lock rows and prevent concurrent overselling.
 * The caller MUST pass a transaction-scoped SupabaseClient via `client`.
 *
 * If ANY item has insufficient stock, throws badRequest with details.
 * No partial decrements ever — all-or-nothing.
 */
export async function checkAndDecrementStock(
  items: StockDecrementItem[],
  client: SupabaseClient,
): Promise<StockDecrementResult> {
  if (items.length === 0) {
    return { success: true, decremented: [] };
  }

  const productIds = items.map((item) => item.productId);

  // SELECT FOR UPDATE via raw SQL through Supabase RPC
  const { data, error } = await client.rpc("lock_products_for_update", {
    product_ids: productIds,
  });

  if (error) {
    throw new AppError(error.message, 500, "DATABASE_ERROR");
  }

  const rows = (data ?? []) as Array<{ id: string; stock_quantity: number }>;
  const stockMap = new Map<string, number>();
  for (const row of rows) {
    stockMap.set(row.id, row.stock_quantity);
  }

  // Check ALL items before decrementing ANY
  const failures: Array<{
    productId: string;
    requested: number;
    available: number;
  }> = [];

  for (const item of items) {
    const currentStock = stockMap.get(item.productId);
    if (currentStock === undefined) {
      throw notFound("Product");
    }
    if (currentStock < item.quantity) {
      failures.push({
        productId: item.productId,
        requested: item.quantity,
        available: currentStock,
      });
    }
  }

  if (failures.length > 0) {
    const err = badRequest("Insufficient stock for one or more items");
    (err as AppError & { details: unknown }).details = failures;
    throw err;
  }

  // All checks passed — decrement each item
  const decremented: DecrementedItem[] = [];

  for (const item of items) {
    const oldStock = stockMap.get(item.productId)!;
    const newStock = oldStock - item.quantity;

    const { error: updateError } = await client
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", item.productId);

    if (updateError) {
      throw new AppError(updateError.message, 500, "DATABASE_ERROR");
    }

    decremented.push({
      productId: item.productId,
      oldStock,
      newStock,
    });
  }

  return { success: true, decremented };
}

/**
 * Restore stock for cancelled/refunded orders.
 * Uses SELECT ... FOR UPDATE to prevent concurrent modification.
 * The caller MUST pass a transaction-scoped SupabaseClient via `client`.
 */
export async function incrementStock(
  items: IncrementItem[],
  client: SupabaseClient,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  for (const item of items) {
    if (item.quantity < 0) {
      throw badRequest("Quantity to increment cannot be negative");
    }
  }

  const productIds = items.map((item) => item.productId);

  const { data, error } = await client.rpc("lock_products_for_update", {
    product_ids: productIds,
  });

  if (error) {
    throw new AppError(error.message, 500, "DATABASE_ERROR");
  }

  const rows = (data ?? []) as Array<{ id: string; stock_quantity: number }>;
  const stockMap = new Map<string, number>();
  for (const row of rows) {
    stockMap.set(row.id, row.stock_quantity);
  }

  for (const item of items) {
    const currentStock = stockMap.get(item.productId);
    if (currentStock === undefined) {
      throw notFound("Product");
    }

    const newStock = currentStock + item.quantity;

    const { error: updateError } = await client
      .from("products")
      .update({ stock_quantity: newStock })
      .eq("id", item.productId);

    if (updateError) {
      throw new AppError(updateError.message, 500, "DATABASE_ERROR");
    }
  }
}
