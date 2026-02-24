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

  static async generatePayoutReport(
    supplierId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<{
    supplier: { id: string; businessName: string };
    period: { start: string; end: string };
    orders: Array<{
      orderNumber: string;
      orderDate: string;
      items: Array<{
        productName: string;
        quantity: number;
        saleAmount: number;
        commissionRate: number;
        commissionAmount: number;
        supplierPayout: number;
      }>;
      orderTotal: number;
      orderCommission: number;
      orderPayout: number;
    }>;
    summary: {
      totalSales: number;
      totalCommission: number;
      totalPayout: number;
      orderCount: number;
    };
  }> {
    // Fetch supplier info
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id, business_name")
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw new Error(`Failed to fetch supplier: ${supplierError?.message}`);
    }

    const supplier = supplierData as unknown as { id: string; business_name: string };

    // Fetch commissions in date range with joins
    const { data: commissionsData, error: commissionsError } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, order_id, order_item_id, sale_amount, commission_rate, commission_amount, supplier_payout, created_at, order_items(quantity, products(name)), orders(order_number, created_at)",
      )
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .order("created_at", { ascending: true });

    if (commissionsError) {
      throw new Error(`Failed to fetch commissions: ${commissionsError.message}`);
    }

    type ReportCommissionRow = {
      id: string;
      order_id: string;
      order_item_id: string;
      sale_amount: string;
      commission_rate: string;
      commission_amount: string;
      supplier_payout: string;
      created_at: string;
      order_items: { quantity: number; products: { name: string } | null } | null;
      orders: { order_number: string; created_at: string } | null;
    };

    const rows = (commissionsData ?? []) as unknown as ReportCommissionRow[];

    // Group by order_id
    const orderMap = new Map<
      string,
      {
        orderNumber: string;
        orderDate: string;
        items: Array<{
          productName: string;
          quantity: number;
          saleAmount: number;
          commissionRate: number;
          commissionAmount: number;
          supplierPayout: number;
        }>;
        orderTotal: number;
        orderCommission: number;
        orderPayout: number;
      }
    >();

    let totalSales = 0;
    let totalCommission = 0;
    let totalPayout = 0;

    for (const row of rows) {
      const saleAmount = Number(row.sale_amount);
      const commissionAmount = Number(row.commission_amount);
      const supplierPayout = Number(row.supplier_payout);

      totalSales += saleAmount;
      totalCommission += commissionAmount;
      totalPayout += supplierPayout;

      const existing = orderMap.get(row.order_id) ?? {
        orderNumber: row.orders?.order_number ?? "Unknown",
        orderDate: row.orders?.created_at ?? row.created_at,
        items: [],
        orderTotal: 0,
        orderCommission: 0,
        orderPayout: 0,
      };

      existing.items.push({
        productName: row.order_items?.products?.name ?? "Unknown",
        quantity: row.order_items?.quantity ?? 0,
        saleAmount: Math.round(saleAmount * 100) / 100,
        commissionRate: Number(row.commission_rate),
        commissionAmount: Math.round(commissionAmount * 100) / 100,
        supplierPayout: Math.round(supplierPayout * 100) / 100,
      });

      existing.orderTotal = Math.round((existing.orderTotal + saleAmount) * 100) / 100;
      existing.orderCommission =
        Math.round((existing.orderCommission + commissionAmount) * 100) / 100;
      existing.orderPayout = Math.round((existing.orderPayout + supplierPayout) * 100) / 100;

      orderMap.set(row.order_id, existing);
    }

    return {
      supplier: { id: supplier.id, businessName: supplier.business_name },
      period: { start: periodStart, end: periodEnd },
      orders: [...orderMap.values()],
      summary: {
        totalSales: Math.round(totalSales * 100) / 100,
        totalCommission: Math.round(totalCommission * 100) / 100,
        totalPayout: Math.round(totalPayout * 100) / 100,
        orderCount: orderMap.size,
      },
    };
  }

  static async getEarningsBreakdown(
    supplierId: string,
    month: number,
    year: number,
  ): Promise<{
    dailyEarnings: Array<{ date: string; earnings: number; cumulative: number }>;
    monthTotal: number;
    previousMonthTotal: number;
  }> {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 1).toISOString();

    // Current month commissions
    const { data: currentData, error: currentError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout, created_at")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", startDate)
      .lt("created_at", endDate)
      .order("created_at", { ascending: true });

    if (currentError) {
      throw new Error(`Failed to fetch earnings: ${currentError.message}`);
    }

    type EarningRow = { supplier_payout: string; created_at: string };
    const rows = (currentData ?? []) as unknown as EarningRow[];

    // Group by day
    const dayMap = new Map<string, number>();
    let monthTotal = 0;

    for (const row of rows) {
      const day = new Date(row.created_at).toISOString().slice(0, 10);
      const amount = Number(row.supplier_payout);
      dayMap.set(day, (dayMap.get(day) ?? 0) + amount);
      monthTotal += amount;
    }

    monthTotal = Math.round(monthTotal * 100) / 100;

    // Build daily earnings with cumulative
    let cumulative = 0;
    const dailyEarnings = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, earnings]) => {
        const rounded = Math.round(earnings * 100) / 100;
        cumulative = Math.round((cumulative + rounded) * 100) / 100;
        return { date, earnings: rounded, cumulative };
      });

    // Previous month total
    const prevStart = new Date(year, month - 2, 1).toISOString();
    const prevEnd = startDate;

    const { data: prevData, error: prevError } = await supabaseAdmin
      .from("commissions")
      .select("supplier_payout")
      .eq("supplier_id", supplierId)
      .neq("status", "reversed")
      .gte("created_at", prevStart)
      .lt("created_at", prevEnd);

    if (prevError) {
      throw new Error(`Failed to fetch previous month earnings: ${prevError.message}`);
    }

    const prevRows = (prevData ?? []) as unknown as EarningRow[];
    let previousMonthTotal = 0;
    for (const row of prevRows) {
      previousMonthTotal += Number(row.supplier_payout);
    }
    previousMonthTotal = Math.round(previousMonthTotal * 100) / 100;

    return { dailyEarnings, monthTotal, previousMonthTotal };
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
