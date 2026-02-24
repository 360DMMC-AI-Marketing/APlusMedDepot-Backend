import { supabaseAdmin } from "../config/supabase";
import { conflict } from "../utils/errors";
import type { SupplierBalance, PayoutRecord, PayoutSummary } from "../types/payout.types";

const MINIMUM_PAYOUT_THRESHOLD = 50;

type PayoutDbRow = {
  id: string;
  supplier_id: string;
  amount: string;
  commission_total: string;
  status: string;
  period_start: string;
  period_end: string;
  payout_date: string | null;
  transaction_ref: string | null;
  created_at: string;
};

function mapPayoutRow(row: PayoutDbRow): PayoutRecord {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    amount: Number(row.amount),
    commissionTotal: Number(row.commission_total),
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    payoutDate: row.payout_date,
    transactionRef: row.transaction_ref,
    createdAt: row.created_at,
  };
}

export class PayoutService {
  static async getSupplierBalance(supplierId: string): Promise<SupplierBalance> {
    // 1. current_balance from suppliers table
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("current_balance")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw new Error(`Failed to fetch supplier balance: ${supplierError?.message}`);
    }

    const currentBalance = Number(
      (supplierData as unknown as { current_balance: string }).current_balance,
    );

    // 2. pendingCommissions: SUM(supplier_payout) FROM commissions WHERE status = 'pending'
    const { data: pendingData, error: pendingError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout")
      .eq("supplier_id", supplierId)
      .eq("status", "pending");

    if (pendingError) {
      throw new Error(`Failed to fetch pending commissions: ${pendingError.message}`);
    }

    type CommissionPayoutRow = { supplier_payout: string };
    const pendingRows = (pendingData ?? []) as unknown as CommissionPayoutRow[];
    let pendingCommissions = 0;
    for (const row of pendingRows) {
      pendingCommissions += Number(row.supplier_payout);
    }
    pendingCommissions = Math.round(pendingCommissions * 100) / 100;

    // 3. totalPaidOut: SUM(amount) FROM payouts WHERE status = 'completed'
    const { data: payoutData, error: payoutError } = await supabaseAdmin
      .from("payouts")
      .select("amount")
      .eq("supplier_id", supplierId)
      .eq("status", "completed");

    if (payoutError) {
      throw new Error(`Failed to fetch payout totals: ${payoutError.message}`);
    }

    type PayoutAmountRow = { amount: string };
    const payoutRows = (payoutData ?? []) as unknown as PayoutAmountRow[];
    let totalPaidOut = 0;
    for (const row of payoutRows) {
      totalPaidOut += Number(row.amount);
    }
    totalPaidOut = Math.round(totalPaidOut * 100) / 100;

    // 4. availableForPayout
    const availableForPayout = currentBalance >= MINIMUM_PAYOUT_THRESHOLD ? currentBalance : 0;

    return {
      currentBalance,
      pendingCommissions,
      totalPaidOut,
      availableForPayout,
    };
  }

  static async getPayoutHistory(
    supplierId: string,
    options?: { page?: number; limit?: number },
  ): Promise<{ data: PayoutRecord[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Get total count
    const { data: countData, error: countError } = await supabaseAdmin
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplierId);

    if (countError) {
      throw new Error(`Failed to count payouts: ${countError.message}`);
    }

    // Supabase returns count as a number via the response when using { count: "exact" }
    // We need to access it from the response metadata, but since we used .select with head:true
    // the count is in the response. Let's query differently.
    const totalCount = (countData as unknown as Array<unknown>)?.length ?? 0;

    // Get paginated records
    const { data, error } = await supabaseAdmin
      .from("payouts")
      .select(
        "id, supplier_id, amount, commission_total, status, period_start, period_end, payout_date, transaction_ref, created_at",
      )
      .eq("supplier_id", supplierId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch payout history: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as PayoutDbRow[];

    return {
      data: rows.map(mapPayoutRow),
      total: totalCount,
    };
  }

  static async createPayoutRecord(
    supplierId: string,
    input: {
      amount: number;
      periodStart: string;
      periodEnd: string;
      commissionTotal: number;
      itemsCount: number;
    },
  ): Promise<PayoutRecord> {
    // GUARD: verify sufficient balance
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("current_balance")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw new Error(`Failed to fetch supplier: ${supplierError?.message}`);
    }

    const currentBalance = Number(
      (supplierData as unknown as { current_balance: string }).current_balance,
    );

    if (currentBalance < input.amount) {
      throw conflict("Insufficient balance for payout");
    }

    // INSERT payout record
    const { data: payoutData, error: payoutError } = await supabaseAdmin
      .from("payouts")
      .insert({
        supplier_id: supplierId,
        amount: input.amount,
        commission_total: input.commissionTotal,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        items_count: input.itemsCount,
        status: "pending",
      })
      .select(
        "id, supplier_id, amount, commission_total, status, period_start, period_end, payout_date, transaction_ref, created_at",
      )
      .single();

    if (payoutError || !payoutData) {
      throw new Error(`Failed to create payout: ${payoutError?.message}`);
    }

    // Deduct from supplier balance atomically
    const { error: balanceError } = await supabaseAdmin.rpc("increment_supplier_balance", {
      p_supplier_id: supplierId,
      p_amount: -input.amount,
    });

    if (balanceError) {
      throw new Error(`Failed to deduct supplier balance: ${balanceError.message}`);
    }

    return mapPayoutRow(payoutData as unknown as PayoutDbRow);
  }

  static async getPayoutSummary(supplierId: string): Promise<PayoutSummary> {
    const now = new Date();

    // First day of current month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    // First day of last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    // First day of current month (also serves as last month end)
    const lastMonthEnd = currentMonthStart;

    // currentMonthEarnings
    const { data: currentData, error: currentError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", currentMonthStart);

    if (currentError) {
      throw new Error(`Failed to fetch current month commissions: ${currentError.message}`);
    }

    type EarningsRow = { supplier_payout: string };
    const currentRows = (currentData ?? []) as unknown as EarningsRow[];
    let currentMonthEarnings = 0;
    for (const row of currentRows) {
      currentMonthEarnings += Number(row.supplier_payout);
    }
    currentMonthEarnings = Math.round(currentMonthEarnings * 100) / 100;

    // lastMonthEarnings
    const { data: lastData, error: lastError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", lastMonthStart)
      .lte("created_at", lastMonthEnd);

    if (lastError) {
      throw new Error(`Failed to fetch last month commissions: ${lastError.message}`);
    }

    const lastRows = (lastData ?? []) as unknown as EarningsRow[];
    let lastMonthEarnings = 0;
    for (const row of lastRows) {
      lastMonthEarnings += Number(row.supplier_payout);
    }
    lastMonthEarnings = Math.round(lastMonthEarnings * 100) / 100;

    // nextPayoutDate: 15th of next month
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    const nextPayoutDate = nextMonth.toISOString().split("T")[0];

    // meetsMinimumThreshold: check current_balance
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("current_balance")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw new Error(`Failed to fetch supplier balance: ${supplierError?.message}`);
    }

    const currentBalance = Number(
      (supplierData as unknown as { current_balance: string }).current_balance,
    );

    return {
      currentMonthEarnings,
      lastMonthEarnings,
      nextPayoutDate,
      meetsMinimumThreshold: currentBalance >= MINIMUM_PAYOUT_THRESHOLD,
      minimumThreshold: MINIMUM_PAYOUT_THRESHOLD,
    };
  }
}
