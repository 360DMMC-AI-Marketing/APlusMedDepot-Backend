const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { CommissionService } from "../../src/services/commission.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.in = jest.fn(self);
  chain.is = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ORDER_ID = "order-accuracy-test";
const SUPPLIER_ID = "sup-accuracy-1";

function makeItem(
  subtotal: string,
  ratePercent: string = "15.00",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: overrides.id ?? "oi-1",
    supplier_id: overrides.supplier_id ?? SUPPLIER_ID,
    subtotal,
    suppliers: {
      commission_rate: ratePercent,
      business_name: (overrides.business_name as string) ?? "Test Supplier",
    },
  };
}

/**
 * Sets up mockFrom to return items, then accept N inserts (one per item).
 * Returns all insert chains for assertion access.
 */
function setupCalculation(items: unknown[]) {
  const itemsChain = mockQuery({ data: items });
  const insertChains = items.map((_, i) => mockQuery({ data: { id: `comm-${i + 1}` } }));

  let fromMock = mockFrom.mockReturnValueOnce(itemsChain);
  for (const chain of insertChains) {
    fromMock = fromMock.mockReturnValueOnce(chain);
  }

  return { itemsChain, insertChains };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe("Commission Accuracy — Precision Tests", () => {
  // 1. Standard 15% rate
  it("standard 15%: $100.00 → commission $15.00, supplier $85.00", async () => {
    setupCalculation([makeItem("100.00", "15.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].saleAmount).toBe(100);
    expect(result[0].commissionAmount).toBe(15);
    expect(result[0].supplierAmount).toBe(85);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(100);
  });

  // 2. Odd cents — $33.33 at 15%
  it("odd cents: $33.33 at 15% → commission $5.00, supplier $28.33", async () => {
    // 33.33 * 0.15 = 4.9995 → Math.round(499.95) / 100 = 5.00
    // 33.33 - 5.00 = 28.33
    setupCalculation([makeItem("33.33", "15.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(33.33);
    expect(result[0].commissionAmount).toBe(5);
    expect(result[0].supplierAmount).toBe(28.33);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(33.33);
  });

  // 3. Very small amount — $0.01 at 15%
  it("very small: $0.01 at 15% → commission $0.00, supplier $0.01", async () => {
    // 0.01 * 0.15 = 0.0015 → Math.round(0.15) / 100 = 0.00
    // 0.01 - 0.00 = 0.01
    setupCalculation([makeItem("0.01", "15.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(0.01);
    expect(result[0].commissionAmount).toBe(0);
    expect(result[0].supplierAmount).toBe(0.01);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(0.01);
  });

  // 4. Large amount — $9999.99 at 15%
  it("large amount: $9999.99 at 15% → commission $1500.00, supplier $8499.99", async () => {
    // 9999.99 * 0.15 = 1499.9985 → Math.round(149999.85) / 100 = 1500.00
    // 9999.99 - 1500.00 = 8499.99
    setupCalculation([makeItem("9999.99", "15.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(9999.99);
    expect(result[0].commissionAmount).toBe(1500);
    expect(result[0].supplierAmount).toBe(8499.99);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(9999.99);
  });

  // 5. Zero commission rate
  it("zero rate: $100.00 at 0% → commission $0.00, supplier $100.00", async () => {
    setupCalculation([makeItem("100.00", "0.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(100);
    expect(result[0].commissionAmount).toBe(0);
    expect(result[0].supplierAmount).toBe(100);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(100);
  });

  // 6. High commission rate — 18% (premium category)
  it("high rate: $100.00 at 18% → commission $18.00, supplier $82.00", async () => {
    setupCalculation([makeItem("100.00", "18.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(100);
    expect(result[0].commissionAmount).toBe(18);
    expect(result[0].supplierAmount).toBe(82);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(100);
  });

  // 7. Custom rate 12% (high-volume)
  it("custom rate: $49.98 at 12% → commission $6.00, supplier $43.98", async () => {
    // 49.98 * 0.12 = 5.9976 → Math.round(599.76) / 100 = 6.00
    // 49.98 - 6.00 = 43.98
    setupCalculation([makeItem("49.98", "12.00")]);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].saleAmount).toBe(49.98);
    expect(result[0].commissionAmount).toBe(6);
    expect(result[0].supplierAmount).toBe(43.98);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(49.98);
  });

  // 8. Multi-item order total verification
  it("multi-item: sum of per-item commissions equals total commission", async () => {
    const items = [
      makeItem("75.50", "15.00", { id: "oi-1", supplier_id: "sup-a", business_name: "A" }),
      makeItem("120.00", "12.00", { id: "oi-2", supplier_id: "sup-b", business_name: "B" }),
      makeItem("33.33", "18.00", { id: "oi-3", supplier_id: "sup-c", business_name: "C" }),
      makeItem("0.99", "15.00", { id: "oi-4", supplier_id: "sup-a", business_name: "A" }),
      makeItem("250.00", "15.00", { id: "oi-5", supplier_id: "sup-d", business_name: "D" }),
    ];

    setupCalculation(items);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(5);

    // Verify each item: commission + supplier = sale (no penny loss per item)
    for (const r of result) {
      const sum = Math.round((r.commissionAmount + r.supplierAmount) * 100) / 100;
      expect(sum).toBe(r.saleAmount);
    }

    // Verify total across all items
    const totalSale = result.reduce((s, r) => s + r.saleAmount, 0);
    const totalCommission = result.reduce((s, r) => s + r.commissionAmount, 0);
    const totalSupplier = result.reduce((s, r) => s + r.supplierAmount, 0);

    // Total commission + total supplier should equal total sale amount
    const totalSum = Math.round((totalCommission + totalSupplier) * 100) / 100;
    expect(totalSum).toBe(Math.round(totalSale * 100) / 100);

    // Verify individual expected values
    // $75.50 * 15% = $11.325 → $11.33, supplier = $75.50 - $11.33 = $64.17
    expect(result[0].commissionAmount).toBe(11.33);
    expect(result[0].supplierAmount).toBe(64.17);
    // $120.00 * 12% = $14.40, supplier = $105.60
    expect(result[1].commissionAmount).toBe(14.4);
    expect(result[1].supplierAmount).toBe(105.6);
    // $33.33 * 18% = $5.9994 → $6.00, supplier = $27.33
    expect(result[2].commissionAmount).toBe(6);
    expect(result[2].supplierAmount).toBe(27.33);
    // $0.99 * 15% = $0.1485 → $0.15, supplier = $0.84
    expect(result[3].commissionAmount).toBe(0.15);
    expect(result[3].supplierAmount).toBe(0.84);
    // $250.00 * 15% = $37.50, supplier = $212.50
    expect(result[4].commissionAmount).toBe(37.5);
    expect(result[4].supplierAmount).toBe(212.5);
  });

  // 9. Rounding consistency stress test — 100 random amounts
  it("stress test: 100 random amounts all satisfy commission + supplier = sale", async () => {
    // Use a seeded pseudo-random for determinism
    const seed = 42;
    function seededRandom(s: number) {
      let state = s;
      return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
      };
    }
    const rng = seededRandom(seed);

    const items = Array.from({ length: 100 }, (_, i) => {
      // Random amount between $0.01 and $9999.99
      const amount = Math.round((rng() * 9999.98 + 0.01) * 100) / 100;
      // Random rate: pick from 0, 12, 15, 18
      const rates = ["0.00", "12.00", "15.00", "18.00"];
      const rate = rates[Math.floor(rng() * rates.length)];
      return makeItem(amount.toFixed(2), rate, { id: `oi-stress-${i}` });
    });

    setupCalculation(items);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(100);

    for (let i = 0; i < result.length; i++) {
      const r = result[i];
      // commission + supplier must equal sale amount (no penny loss)
      const sum = Math.round((r.commissionAmount + r.supplierAmount) * 100) / 100;
      expect(sum).toBe(r.saleAmount);

      // commission must be non-negative
      expect(r.commissionAmount).toBeGreaterThanOrEqual(0);
      // supplier must be non-negative
      expect(r.supplierAmount).toBeGreaterThanOrEqual(0);
      // commission must not exceed sale amount
      expect(r.commissionAmount).toBeLessThanOrEqual(r.saleAmount);
    }
  });

  // 10. Reversal accuracy — reversed amounts negate originals
  it("reversal: reversed balance deductions match original commission amounts", async () => {
    // First calculate commissions for 3 items with different rates
    const items = [
      makeItem("100.00", "15.00", { id: "oi-1", supplier_id: "sup-rev-1" }),
      makeItem("200.00", "12.00", { id: "oi-2", supplier_id: "sup-rev-2" }),
      makeItem("33.33", "18.00", { id: "oi-3", supplier_id: "sup-rev-1" }),
    ];

    setupCalculation(items);

    const calcResult = await CommissionService.calculateOrderCommissions(ORDER_ID);

    // Capture the supplier amounts that were credited
    const sup1Credits = calcResult
      .filter((r) => r.supplierId === "sup-rev-1")
      .reduce((s, r) => s + r.supplierAmount, 0);
    const sup2Credits = calcResult
      .filter((r) => r.supplierId === "sup-rev-2")
      .reduce((s, r) => s + r.supplierAmount, 0);

    // Verify the original RPC calls credited the correct amounts
    const rpcCalls = mockRpc.mock.calls as Array<
      [string, { p_supplier_id: string; p_amount: number }]
    >;
    const creditCalls = rpcCalls.filter(([fn]) => fn === "increment_supplier_balance");
    expect(creditCalls).toHaveLength(3);

    // Now reverse — set up mocks for reversal
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });

    const commissionRows = calcResult.map((r) => ({
      id: r.commissionId,
      order_item_id: r.orderItemId,
      supplier_id: r.supplierId,
      order_id: ORDER_ID,
      sale_amount: r.saleAmount.toString(),
      commission_amount: r.commissionAmount.toString(),
      platform_amount: r.commissionAmount.toString(),
      supplier_payout: r.supplierAmount.toString(),
      status: "pending",
    }));

    const fetchChain = mockQuery({ data: commissionRows });
    const updateChains = commissionRows.map(() => mockQuery({ data: null }));

    let fromMock = mockFrom.mockReturnValueOnce(fetchChain);
    for (const chain of updateChains) {
      fromMock = fromMock.mockReturnValueOnce(chain);
    }

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    // Verify reversal RPC calls are negative of original credits
    const reversalCalls = mockRpc.mock.calls as Array<
      [string, { p_supplier_id: string; p_amount: number }]
    >;

    const sup1Debits = reversalCalls
      .filter(([, args]) => args.p_supplier_id === "sup-rev-1")
      .reduce((s, [, args]) => s + args.p_amount, 0);
    const sup2Debits = reversalCalls
      .filter(([, args]) => args.p_supplier_id === "sup-rev-2")
      .reduce((s, [, args]) => s + args.p_amount, 0);

    // Debits should be negative of credits (exact match)
    expect(sup1Debits).toBe(-sup1Credits);
    expect(sup2Debits).toBe(-sup2Credits);

    // Net effect should be zero
    expect(Math.round((sup1Credits + sup1Debits) * 100) / 100).toBe(0);
    expect(Math.round((sup2Credits + sup2Debits) * 100) / 100).toBe(0);
  });
});
