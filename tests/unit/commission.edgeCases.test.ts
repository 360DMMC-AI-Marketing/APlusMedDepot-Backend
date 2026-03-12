const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { CommissionService } from "../../src/services/commission.service";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ORDER_ID = "order-uuid-1";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CommissionService edge cases", () => {
  describe("calculateOrderCommissions — null supplier rate defaults to 15%", () => {
    it("uses 15% when supplier commission_rate is null", async () => {
      const itemsChain = mockQuery({
        data: [
          {
            id: "oi-1",
            supplier_id: "sup-1",
            subtotal: "200.00",
            suppliers: { commission_rate: null, business_name: "NullRateCo" },
          },
        ],
      });
      const insertChain = mockQuery({ data: { id: "comm-1" } });
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      expect(results).toHaveLength(1);
      // 200 * 15% = 30
      expect(results[0].commissionAmount).toBe(30);
      expect(results[0].supplierAmount).toBe(170);
    });
  });

  describe("calculateOrderCommissions — zero-dollar item", () => {
    it("inserts zero commission record for $0 items", async () => {
      const itemsChain = mockQuery({
        data: [
          {
            id: "oi-zero",
            supplier_id: "sup-1",
            subtotal: "0.00",
            suppliers: { commission_rate: "15.00", business_name: "FreeCo" },
          },
        ],
      });
      const insertChain = mockQuery({ data: { id: "comm-zero" } });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      expect(results).toHaveLength(1);
      expect(results[0].saleAmount).toBe(0);
      expect(results[0].commissionAmount).toBe(0);
      expect(results[0].supplierAmount).toBe(0);

      // RPC should NOT have been called — no balance update for $0 items
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("calculateOrderCommissions — commission insert fails", () => {
    it("skips item and continues when commission insert fails", async () => {
      const itemsChain = mockQuery({
        data: [
          {
            id: "oi-fail",
            supplier_id: "sup-1",
            subtotal: "100.00",
            suppliers: { commission_rate: "10.00", business_name: "FailCo" },
          },
          {
            id: "oi-ok",
            supplier_id: "sup-2",
            subtotal: "200.00",
            suppliers: { commission_rate: "12.00", business_name: "OkCo" },
          },
        ],
      });
      // First commission insert fails
      const failInsertChain = mockQuery({ data: null, error: { message: "DB constraint" } });
      // Second commission insert succeeds
      const okInsertChain = mockQuery({ data: { id: "comm-ok" } });
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      mockFrom
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(failInsertChain)
        .mockReturnValueOnce(okInsertChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      // Only the second item should succeed
      expect(results).toHaveLength(1);
      expect(results[0].orderItemId).toBe("oi-ok");

      consoleSpy.mockRestore();
    });
  });

  describe("calculateOrderCommissions — balance RPC fails", () => {
    it("still returns commission result when balance update fails", async () => {
      const itemsChain = mockQuery({
        data: [
          {
            id: "oi-1",
            supplier_id: "sup-1",
            subtotal: "100.00",
            suppliers: { commission_rate: "10.00", business_name: "Co" },
          },
        ],
      });
      const insertChain = mockQuery({ data: { id: "comm-1" } });
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "RPC timeout" } });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      // Commission record is still created even if balance update fails
      expect(results).toHaveLength(1);
      expect(results[0].commissionId).toBe("comm-1");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update balance"),
        // no second arg needed
      );

      consoleSpy.mockRestore();
    });
  });

  describe("calculateOrderCommissions — empty items", () => {
    it("returns empty array when no order items found", async () => {
      const itemsChain = mockQuery({ data: [] });
      mockFrom.mockReturnValueOnce(itemsChain);

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      expect(results).toEqual([]);
    });
  });

  describe("calculateOrderCommissions — items fetch error", () => {
    it("throws when order items query fails", async () => {
      const itemsChain = mockQuery({ error: { message: "connection refused" } });
      mockFrom.mockReturnValueOnce(itemsChain);

      await expect(CommissionService.calculateOrderCommissions(ORDER_ID)).rejects.toThrow(
        "Failed to fetch order items: connection refused",
      );
    });
  });

  describe("reverseOrderCommissions — no commissions to reverse", () => {
    it("returns silently when all commissions already reversed", async () => {
      const commChain = mockQuery({ data: [] });
      mockFrom.mockReturnValueOnce(commChain);

      // Should not throw
      await CommissionService.reverseOrderCommissions(ORDER_ID);

      // Only 1 from() call (the fetch), no updates
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  describe("reverseOrderCommissions — update error on individual commission", () => {
    it("continues reversing other commissions when one update fails", async () => {
      const commChain = mockQuery({
        data: [
          {
            id: "c1",
            order_item_id: "oi-1",
            supplier_id: "sup-1",
            order_id: ORDER_ID,
            sale_amount: "100.00",
            commission_amount: "15.00",
            platform_amount: "15.00",
            supplier_payout: "85.00",
            status: "pending",
          },
          {
            id: "c2",
            order_item_id: "oi-2",
            supplier_id: "sup-2",
            order_id: ORDER_ID,
            sale_amount: "200.00",
            commission_amount: "30.00",
            platform_amount: "30.00",
            supplier_payout: "170.00",
            status: "pending",
          },
        ],
      });
      // First update fails
      const failUpdateChain = mockQuery({ error: { message: "deadlock" } });
      // Second update succeeds
      const okUpdateChain = mockQuery({ data: null });
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      mockFrom
        .mockReturnValueOnce(commChain)
        .mockReturnValueOnce(failUpdateChain)
        .mockReturnValueOnce(okUpdateChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await CommissionService.reverseOrderCommissions(ORDER_ID);

      // Second commission's balance should still be decremented
      expect(mockRpc).toHaveBeenCalledWith("increment_supplier_balance", {
        p_supplier_id: "sup-2",
        p_amount: -170,
      });

      consoleSpy.mockRestore();
    });
  });

  describe("reverseOrderCommissions — fetch error", () => {
    it("throws when commissions query fails", async () => {
      const commChain = mockQuery({ error: { message: "table not found" } });
      mockFrom.mockReturnValueOnce(commChain);

      await expect(CommissionService.reverseOrderCommissions(ORDER_ID)).rejects.toThrow(
        "Failed to fetch commissions for reversal: table not found",
      );
    });
  });

  describe("getCommissionsByOrder — fetch error", () => {
    it("throws when query fails", async () => {
      const chain = mockQuery({ error: { message: "timeout" } });
      mockFrom.mockReturnValueOnce(chain);

      await expect(CommissionService.getCommissionsByOrder(ORDER_ID)).rejects.toThrow(
        "Failed to fetch commissions: timeout",
      );
    });
  });

  describe("getCommissionSummary — supplier not found", () => {
    it("throws when supplier balance lookup fails", async () => {
      const commChain = mockQuery({ data: [] });
      const supplierChain = mockQuery({ data: null, error: { message: "not found" } });

      mockFrom.mockReturnValueOnce(commChain).mockReturnValueOnce(supplierChain);

      await expect(CommissionService.getCommissionSummary("sup-missing")).rejects.toThrow(
        "Failed to fetch supplier balance",
      );
    });
  });
});
