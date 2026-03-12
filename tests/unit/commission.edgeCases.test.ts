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
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.in = jest.fn(self);
  chain.is = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
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
      const insertChain = mockQuery({
        data: [
          {
            id: "comm-1",
            order_item_id: "oi-1",
            supplier_id: "sup-1",
            sale_amount: "200.00",
            commission_amount: "30.00",
            supplier_amount: "170.00",
          },
        ],
      });
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      expect(results).toHaveLength(1);
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
      const insertChain = mockQuery({
        data: [
          {
            id: "comm-zero",
            order_item_id: "oi-zero",
            supplier_id: "sup-1",
            sale_amount: "0.00",
            commission_amount: "0.00",
            supplier_amount: "0.00",
          },
        ],
      });

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

  describe("calculateOrderCommissions — bulk insert fails", () => {
    it("returns empty array when bulk insert fails", async () => {
      const itemsChain = mockQuery({
        data: [
          {
            id: "oi-fail",
            supplier_id: "sup-1",
            subtotal: "100.00",
            suppliers: { commission_rate: "10.00", business_name: "FailCo" },
          },
        ],
      });
      const failInsertChain = mockQuery({ data: null, error: { message: "DB constraint" } });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(failInsertChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      expect(results).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to bulk insert commissions"),
      );

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
      const insertChain = mockQuery({
        data: [
          {
            id: "comm-1",
            order_item_id: "oi-1",
            supplier_id: "sup-1",
            sale_amount: "100.00",
            commission_amount: "10.00",
            supplier_amount: "90.00",
          },
        ],
      });
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "RPC timeout" } });

      mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const results = await CommissionService.calculateOrderCommissions(ORDER_ID);

      // Commission record is still created even if balance update fails
      expect(results).toHaveLength(1);
      expect(results[0].commissionId).toBe("comm-1");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to update balance"));

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

      await CommissionService.reverseOrderCommissions(ORDER_ID);

      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  describe("reverseOrderCommissions — batch update error", () => {
    it("returns early when batch update fails", async () => {
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
        ],
      });
      const failUpdateChain = mockQuery({ error: { message: "deadlock" } });

      mockFrom.mockReturnValueOnce(commChain).mockReturnValueOnce(failUpdateChain);

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await CommissionService.reverseOrderCommissions(ORDER_ID);

      // No RPC calls since update failed and we returned early
      expect(mockRpc).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to reverse commissions"),
      );

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
