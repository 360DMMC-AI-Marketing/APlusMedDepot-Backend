import { supabaseAdmin } from "../config/supabase";
import type {
  CommissionResult,
  CommissionRecord,
  CommissionSummary,
} from "../types/commission.types";

const DEFAULT_COMMISSION_RATE = 15;

type CommissionDbRow = {
  id: string;
  order_item_id: string;
  order_id: string;
  supplier_id: string;
  sale_amount: string;
  commission_rate: string;
  commission_amount: string;
  platform_amount: string;
  supplier_payout: string;
  status: string;
  created_at: string;
};

type CommissionWithJoins = CommissionDbRow & {
  order_items: { product_id: string; products: { name: string } | null } | null;
  suppliers: { business_name: string } | null;
};

export class CommissionService {
  /**
   * Calculate and record commissions for all items in an order.
   * Fetches each item's supplier commission_rate (percentage, e.g. 15.00 = 15%),
   * computes per-item commission, inserts commission records, and atomically
   * increments each supplier's balance via `increment_supplier_balance` RPC.
   * @param orderId - The order UUID whose items to process
   * @returns Array of commission results with amounts per item
   */
  static async calculateOrderCommissions(orderId: string): Promise<CommissionResult[]> {
    // Fetch order_items with supplier commission rates
    const { data: itemsData, error: itemsError } = await supabaseAdmin
      .from("order_items")
      .select("id, supplier_id, subtotal, suppliers(commission_rate, business_name)")
      .eq("order_id", orderId);

    if (itemsError) {
      throw new Error(`Failed to fetch order items: ${itemsError.message}`);
    }

    type ItemRow = {
      id: string;
      supplier_id: string;
      subtotal: string;
      suppliers: { commission_rate: string | null; business_name: string } | null;
    };

    const items = (itemsData ?? []) as unknown as ItemRow[];

    if (items.length === 0) {
      return [];
    }

    // Pre-calculate all commission amounts and build insert records
    const insertRecords: Array<Record<string, unknown>> = [];
    const supplierBalanceIncrements = new Map<string, number>();

    for (const item of items) {
      const ratePercent = Number(item.suppliers?.commission_rate ?? DEFAULT_COMMISSION_RATE);
      const rate = ratePercent / 100;
      const saleAmount = Number(item.subtotal);

      if (saleAmount === 0) {
        insertRecords.push({
          order_item_id: item.id,
          supplier_id: item.supplier_id,
          order_id: orderId,
          sale_amount: 0,
          commission_rate: ratePercent,
          commission_amount: 0,
          platform_amount: 0,
          supplier_payout: 0,
          supplier_amount: 0,
          status: "pending",
        });
        continue;
      }

      const commissionAmount = Math.round(saleAmount * rate * 100) / 100;
      const supplierAmount = Math.round((saleAmount - commissionAmount) * 100) / 100;

      insertRecords.push({
        order_item_id: item.id,
        supplier_id: item.supplier_id,
        order_id: orderId,
        sale_amount: saleAmount,
        commission_rate: ratePercent,
        commission_amount: commissionAmount,
        platform_amount: commissionAmount,
        supplier_payout: supplierAmount,
        supplier_amount: supplierAmount,
        status: "pending",
      });

      // Accumulate balance increments per supplier
      const current = supplierBalanceIncrements.get(item.supplier_id) ?? 0;
      supplierBalanceIncrements.set(item.supplier_id, current + supplierAmount);
    }

    if (insertRecords.length === 0) {
      return [];
    }

    // Bulk insert all commission records (single query instead of N)
    const { data: insertedData, error: insertError } = await supabaseAdmin
      .from("commissions")
      .insert(insertRecords)
      .select("id, order_item_id, supplier_id, sale_amount, commission_amount, supplier_amount");

    if (insertError || !insertedData) {
      console.error(`[COMMISSION] Failed to bulk insert commissions: ${insertError?.message}`);
      return [];
    }

    type InsertedRow = {
      id: string;
      order_item_id: string;
      supplier_id: string;
      sale_amount: string;
      commission_amount: string;
      supplier_amount: string;
    };

    const inserted = (insertedData ?? []) as unknown as InsertedRow[];
    const results: CommissionResult[] = inserted.map((row) => ({
      commissionId: row.id,
      orderItemId: row.order_item_id,
      supplierId: row.supplier_id,
      saleAmount: Number(row.sale_amount),
      commissionAmount: Number(row.commission_amount),
      supplierAmount: Number(row.supplier_amount),
    }));

    // Batch RPC calls: one per unique supplier instead of per item
    for (const [supplierId, amount] of supplierBalanceIncrements) {
      const { error: balanceError } = await supabaseAdmin.rpc("increment_supplier_balance", {
        p_supplier_id: supplierId,
        p_amount: amount,
      });

      if (balanceError) {
        console.error(
          `[COMMISSION] Failed to update balance for supplier ${supplierId}: ${balanceError.message}`,
        );
      }
    }

    return results;
  }

  /**
   * Reverse all non-reversed commissions for an order.
   * Sets each commission status to 'reversed' and decrements supplier balances
   * by the original supplier_payout amount. The RPC uses GREATEST(0) to prevent
   * negative balances. Skips already-reversed commissions (idempotent).
   * @param orderId - The order UUID whose commissions to reverse
   */
  static async reverseOrderCommissions(orderId: string): Promise<void> {
    // Fetch non-reversed commissions for this order
    const { data: commissionsData, error: fetchError } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, order_item_id, supplier_id, order_id, sale_amount, commission_amount, platform_amount, supplier_payout, status",
      )
      .eq("order_id", orderId)
      .neq("status", "reversed");

    if (fetchError) {
      throw new Error(`Failed to fetch commissions for reversal: ${fetchError.message}`);
    }

    type ReversalRow = {
      id: string;
      order_item_id: string;
      supplier_id: string;
      order_id: string;
      sale_amount: string;
      commission_amount: string;
      platform_amount: string;
      supplier_payout: string;
      status: string;
    };

    const commissions = (commissionsData ?? []) as unknown as ReversalRow[];

    if (commissions.length === 0) {
      return;
    }

    // Batch update all commission statuses to reversed (single query instead of N)
    const commissionIds = commissions.map((c) => c.id);
    const { error: updateError } = await supabaseAdmin
      .from("commissions")
      .update({ status: "reversed" })
      .in("id", commissionIds);

    if (updateError) {
      console.error(`[COMMISSION] Failed to reverse commissions: ${updateError.message}`);
      return;
    }

    // Group payouts by supplier for batch RPC calls (one per supplier instead of per commission)
    const supplierPayouts = new Map<string, number>();
    for (const commission of commissions) {
      const payoutAmount = Number(commission.supplier_payout);
      const current = supplierPayouts.get(commission.supplier_id) ?? 0;
      supplierPayouts.set(commission.supplier_id, current + payoutAmount);
    }

    for (const [supplierId, totalAmount] of supplierPayouts) {
      const { error: balanceError } = await supabaseAdmin.rpc("increment_supplier_balance", {
        p_supplier_id: supplierId,
        p_amount: -totalAmount,
      });

      if (balanceError) {
        console.error(
          `[COMMISSION] Failed to deduct balance for supplier ${supplierId}: ${balanceError.message}`,
        );
      }
    }
  }

  /**
   * Fetch all non-reversed commission records for a specific order,
   * enriched with product names and supplier business names.
   * @param orderId - The order UUID
   * @returns Array of commission records with joined product/supplier info
   */
  static async getCommissionsByOrder(orderId: string): Promise<CommissionRecord[]> {
    const { data, error } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, order_item_id, order_id, supplier_id, sale_amount, commission_rate, commission_amount, platform_amount, supplier_payout, status, created_at, order_items(product_id, products(name)), suppliers(business_name)",
      )
      .eq("order_id", orderId)
      .neq("status", "reversed");

    if (error) {
      throw new Error(`Failed to fetch commissions: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as CommissionWithJoins[];

    return rows.map((row) => ({
      id: row.id,
      orderItemId: row.order_item_id,
      orderId: row.order_id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.business_name,
      productName: row.order_items?.products?.name,
      saleAmount: Number(row.sale_amount),
      commissionRate: Number(row.commission_rate),
      commissionAmount: Number(row.commission_amount),
      platformAmount: Number(row.platform_amount),
      supplierPayout: Number(row.supplier_payout),
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Fetch commission records for a supplier with optional date range and status filters.
   * @param supplierId - The supplier UUID
   * @param options - Optional filters: startDate, endDate (ISO strings), status
   * @returns Array of commission records matching the filters
   */
  static async getCommissionsBySupplier(
    supplierId: string,
    options?: { startDate?: string; endDate?: string; status?: string },
  ): Promise<CommissionRecord[]> {
    let query = supabaseAdmin
      .from("commissions")
      .select(
        "id, order_item_id, order_id, supplier_id, sale_amount, commission_rate, commission_amount, platform_amount, supplier_payout, status, created_at, order_items(product_id, products(name)), suppliers(business_name)",
      )
      .eq("supplier_id", supplierId);

    if (options?.status) {
      query = query.eq("status", options.status);
    }

    if (options?.startDate) {
      query = query.gte("created_at", options.startDate);
    }

    if (options?.endDate) {
      query = query.lte("created_at", options.endDate);
    }

    query = query.order("created_at", { ascending: false }).limit(1000);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch supplier commissions: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as CommissionWithJoins[];

    return rows.map((row) => ({
      id: row.id,
      orderItemId: row.order_item_id,
      orderId: row.order_id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.business_name,
      productName: row.order_items?.products?.name,
      saleAmount: Number(row.sale_amount),
      commissionRate: Number(row.commission_rate),
      commissionAmount: Number(row.commission_amount),
      platformAmount: Number(row.platform_amount),
      supplierPayout: Number(row.supplier_payout),
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Aggregate commission totals for a supplier: total sales, total commission,
   * total payout, distinct order count, and current balance from the suppliers table.
   * Excludes reversed commissions.
   * @param supplierId - The supplier UUID
   * @returns Aggregated commission summary with current balance
   */
  static async getCommissionSummary(supplierId: string): Promise<CommissionSummary> {
    // Fetch non-reversed commissions for aggregation
    const { data: commissionsData, error: commissionsError } = await supabaseAdmin
      .from("commissions")
      .select("sale_amount, commission_amount, supplier_payout, order_id")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed");

    if (commissionsError) {
      throw new Error(`Failed to fetch commission summary: ${commissionsError.message}`);
    }

    type SummaryRow = {
      sale_amount: string;
      commission_amount: string;
      supplier_payout: string;
      order_id: string;
    };

    const rows = (commissionsData ?? []) as unknown as SummaryRow[];

    let totalSales = 0;
    let totalCommission = 0;
    let totalPayout = 0;
    const distinctOrders = new Set<string>();

    for (const row of rows) {
      totalSales += Number(row.sale_amount);
      totalCommission += Number(row.commission_amount);
      totalPayout += Number(row.supplier_payout);
      if (row.order_id) {
        distinctOrders.add(row.order_id);
      }
    }

    // Fetch current balance from suppliers table
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("current_balance")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw new Error(`Failed to fetch supplier balance: ${supplierError?.message}`);
    }

    const supplier = supplierData as unknown as { current_balance: string };

    return {
      totalSales: Math.round(totalSales * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      totalPayout: Math.round(totalPayout * 100) / 100,
      currentBalance: Number(supplier.current_balance),
      orderCount: distinctOrders.size,
    };
  }
}
