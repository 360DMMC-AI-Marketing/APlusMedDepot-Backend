const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import {
  splitOrderBySupplier,
  getSubOrders,
  getSupplierSubOrder,
} from "../../src/services/orderSplitting.service";

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MASTER_ORDER_ID = "master-order-split-1";
const SUPPLIER_A = "sup-a";
const SUPPLIER_B = "sup-b";
const SUPPLIER_C = "sup-c";
const SUPPLIER_D = "sup-d";
const SUPPLIER_E = "sup-e";

const shippingAddress = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  country: "US",
};

function makeMasterOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: MASTER_ORDER_ID,
    order_number: "ORD-20260224-XYZ01",
    customer_id: "customer-1",
    parent_order_id: null,
    shipping_address: shippingAddress,
    status: "pending_payment",
    payment_status: "pending",
    ...overrides,
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "oi-default",
    product_id: "prod-default",
    supplier_id: SUPPLIER_A,
    quantity: 1,
    unit_price: "10.00",
    subtotal: "10.00",
    suppliers: { business_name: "Supplier A" },
    ...overrides,
  };
}

function makeSubOrderInsert(id: string, orderNumber: string) {
  return mockQuery({
    data: { id, order_number: orderNumber, created_at: "2026-02-24T00:00:00Z" },
  });
}

function makeSubOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    order_number: "SUB-ORD-20260224-XYZ01-1",
    supplier_id: SUPPLIER_A,
    total_amount: "32.48",
    tax_amount: "2.48",
    status: "pending_payment",
    created_at: "2026-02-24T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
});

describe("Order Splitting — Integration", () => {
  // =========================================================================
  // Scenario 1 — Basic 2-Supplier Split
  // =========================================================================
  describe("Scenario 1 — Basic 2-Supplier Split", () => {
    it("creates 2 sub-orders with correct supplier assignments and totals", async () => {
      const items = [
        makeItem({
          id: "oi-1",
          product_id: "prod-1",
          supplier_id: SUPPLIER_A,
          quantity: 2,
          unit_price: "25.00",
          subtotal: "50.00",
          suppliers: { business_name: "MedSupply A" },
        }),
        makeItem({
          id: "oi-2",
          product_id: "prod-2",
          supplier_id: SUPPLIER_B,
          quantity: 3,
          unit_price: "20.00",
          subtotal: "60.00",
          suppliers: { business_name: "MedSupply B" },
        }),
      ];

      const masterChain = mockQuery({ data: makeMasterOrder() });
      const itemsChain = mockQuery({ data: items });
      const sub1 = makeSubOrderInsert("sub-a", "SUB-ORD-20260224-XYZ01-1");
      const sub2 = makeSubOrderInsert("sub-b", "SUB-ORD-20260224-XYZ01-2");

      mockFrom
        .mockReturnValueOnce(masterChain)
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(sub1)
        .mockReturnValueOnce(sub2);

      const result = await splitOrderBySupplier(MASTER_ORDER_ID);

      expect(result).toHaveLength(2);

      // Sub-order A: supplier A
      const subA = result.find((s) => s.supplierId === SUPPLIER_A);
      expect(subA).toBeDefined();
      expect(subA!.items).toHaveLength(1);
      expect(subA!.subtotal).toBe(50);
      // tax = 50 * 0.0825 = 4.13 (rounded)
      expect(subA!.taxAmount).toBe(4.13);
      expect(subA!.totalAmount).toBe(54.13);

      // Sub-order B: supplier B
      const subB = result.find((s) => s.supplierId === SUPPLIER_B);
      expect(subB).toBeDefined();
      expect(subB!.items).toHaveLength(1);
      expect(subB!.subtotal).toBe(60);
      // tax = 60 * 0.0825 = 4.95
      expect(subB!.taxAmount).toBe(4.95);
      expect(subB!.totalAmount).toBe(64.95);

      // Both sub-orders inherit same shipping address from master
      const insert1Data = sub1.insert.mock.calls[0][0] as Record<string, unknown>;
      const insert2Data = sub2.insert.mock.calls[0][0] as Record<string, unknown>;
      expect(insert1Data.shipping_address).toEqual(shippingAddress);
      expect(insert2Data.shipping_address).toEqual(shippingAddress);
    });
  });

  // =========================================================================
  // Scenario 2 — 3 Suppliers, Mixed Items (2+2+1)
  // =========================================================================
  describe("Scenario 2 — 3 Suppliers, Mixed Items", () => {
    it("creates 3 sub-orders with item counts 2, 2, 1", async () => {
      const items = [
        makeItem({
          id: "oi-1",
          supplier_id: SUPPLIER_A,
          subtotal: "10.00",
          suppliers: { business_name: "Supplier A" },
        }),
        makeItem({
          id: "oi-2",
          supplier_id: SUPPLIER_A,
          subtotal: "15.00",
          suppliers: { business_name: "Supplier A" },
        }),
        makeItem({
          id: "oi-3",
          supplier_id: SUPPLIER_B,
          subtotal: "20.00",
          suppliers: { business_name: "Supplier B" },
        }),
        makeItem({
          id: "oi-4",
          supplier_id: SUPPLIER_B,
          subtotal: "25.00",
          suppliers: { business_name: "Supplier B" },
        }),
        makeItem({
          id: "oi-5",
          supplier_id: SUPPLIER_C,
          subtotal: "30.00",
          suppliers: { business_name: "Supplier C" },
        }),
      ];

      const masterChain = mockQuery({ data: makeMasterOrder() });
      const itemsChain = mockQuery({ data: items });
      const sub1 = makeSubOrderInsert("sub-a", "SUB-ORD-20260224-XYZ01-1");
      const sub2 = makeSubOrderInsert("sub-b", "SUB-ORD-20260224-XYZ01-2");
      const sub3 = makeSubOrderInsert("sub-c", "SUB-ORD-20260224-XYZ01-3");

      mockFrom
        .mockReturnValueOnce(masterChain)
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(sub1)
        .mockReturnValueOnce(sub2)
        .mockReturnValueOnce(sub3);

      const result = await splitOrderBySupplier(MASTER_ORDER_ID);

      expect(result).toHaveLength(3);

      const sA = result.find((s) => s.supplierId === SUPPLIER_A);
      const sB = result.find((s) => s.supplierId === SUPPLIER_B);
      const sC = result.find((s) => s.supplierId === SUPPLIER_C);

      expect(sA!.items).toHaveLength(2);
      expect(sB!.items).toHaveLength(2);
      expect(sC!.items).toHaveLength(1);

      // Verify all totals balance: subtotal + tax = totalAmount
      for (const sub of result) {
        expect(sub.subtotal + sub.taxAmount).toBe(sub.totalAmount);
      }
    });
  });

  // =========================================================================
  // Scenario 3 — Single Supplier
  // =========================================================================
  describe("Scenario 3 — Single Supplier", () => {
    it("creates 1 sub-order when all items from same supplier", async () => {
      const items = [
        makeItem({
          id: "oi-1",
          subtotal: "10.00",
          suppliers: { business_name: "Solo Supply" },
        }),
        makeItem({
          id: "oi-2",
          subtotal: "20.00",
          suppliers: { business_name: "Solo Supply" },
        }),
        makeItem({
          id: "oi-3",
          subtotal: "30.00",
          suppliers: { business_name: "Solo Supply" },
        }),
      ];

      const masterChain = mockQuery({ data: makeMasterOrder() });
      const itemsChain = mockQuery({ data: items });
      const sub1 = makeSubOrderInsert("sub-1", "SUB-ORD-20260224-XYZ01-1");

      mockFrom
        .mockReturnValueOnce(masterChain)
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(sub1);

      const result = await splitOrderBySupplier(MASTER_ORDER_ID);

      expect(result).toHaveLength(1);
      expect(result[0].supplierId).toBe(SUPPLIER_A);
      expect(result[0].supplierName).toBe("Solo Supply");
      expect(result[0].items).toHaveLength(3);
      // subtotal = 10 + 20 + 30 = 60
      expect(result[0].subtotal).toBe(60);
      // tax = 60 * 0.0825 = 4.95
      expect(result[0].taxAmount).toBe(4.95);
      expect(result[0].totalAmount).toBe(64.95);
    });
  });

  // =========================================================================
  // Scenario 4 — Tax Distribution
  // =========================================================================
  describe("Scenario 4 — Tax Distribution", () => {
    it("distributes tax proportionally with no penny lost", async () => {
      // Items totaling $100: $60 from supplier A, $40 from supplier B
      const items = [
        makeItem({
          id: "oi-1",
          supplier_id: SUPPLIER_A,
          subtotal: "60.00",
          suppliers: { business_name: "Supplier A" },
        }),
        makeItem({
          id: "oi-2",
          supplier_id: SUPPLIER_B,
          subtotal: "40.00",
          suppliers: { business_name: "Supplier B" },
        }),
      ];

      const masterChain = mockQuery({ data: makeMasterOrder() });
      const itemsChain = mockQuery({ data: items });
      const sub1 = makeSubOrderInsert("sub-a", "SUB-ORD-20260224-XYZ01-1");
      const sub2 = makeSubOrderInsert("sub-b", "SUB-ORD-20260224-XYZ01-2");

      mockFrom
        .mockReturnValueOnce(masterChain)
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(sub1)
        .mockReturnValueOnce(sub2);

      const result = await splitOrderBySupplier(MASTER_ORDER_ID);

      expect(result).toHaveLength(2);

      const subA = result.find((s) => s.supplierId === SUPPLIER_A)!;
      const subB = result.find((s) => s.supplierId === SUPPLIER_B)!;

      // Sub-order A: $60 * 0.0825 = $4.95
      expect(subA.subtotal).toBe(60);
      expect(subA.taxAmount).toBe(4.95);

      // Sub-order B: $40 * 0.0825 = $3.30
      expect(subB.subtotal).toBe(40);
      expect(subB.taxAmount).toBe(3.3);

      // Total tax across sub-orders = $4.95 + $3.30 = $8.25 = $100 * 0.0825
      const totalTax = Math.round((subA.taxAmount + subB.taxAmount) * 100) / 100;
      expect(totalTax).toBe(8.25);

      // No penny lost: sum of sub-order totals should equal sum of subtotals + sum of taxes
      const totalSubtotals = subA.subtotal + subB.subtotal;
      const totalAmounts = Math.round((subA.totalAmount + subB.totalAmount) * 100) / 100;
      expect(totalAmounts).toBe(Math.round((totalSubtotals + totalTax) * 100) / 100);
    });
  });

  // =========================================================================
  // Scenario 5 — Large Order
  // =========================================================================
  describe("Scenario 5 — Large Order (20 items, 5 suppliers)", () => {
    it("creates 5 sub-orders with all 20 items accounted for", async () => {
      const suppliers = [
        { id: SUPPLIER_A, name: "Supplier A" },
        { id: SUPPLIER_B, name: "Supplier B" },
        { id: SUPPLIER_C, name: "Supplier C" },
        { id: SUPPLIER_D, name: "Supplier D" },
        { id: SUPPLIER_E, name: "Supplier E" },
      ];

      // 20 items: 4 per supplier
      const items = [];
      for (let i = 0; i < 20; i++) {
        const sup = suppliers[i % 5];
        items.push(
          makeItem({
            id: `oi-${i + 1}`,
            product_id: `prod-${i + 1}`,
            supplier_id: sup.id,
            quantity: i + 1,
            unit_price: "10.00",
            subtotal: `${(i + 1) * 10}.00`,
            suppliers: { business_name: sup.name },
          }),
        );
      }

      const masterChain = mockQuery({ data: makeMasterOrder() });
      const itemsChain = mockQuery({ data: items });

      // 5 sub-order inserts
      const subInserts = suppliers.map((_, idx) =>
        makeSubOrderInsert(`sub-${idx + 1}`, `SUB-ORD-20260224-XYZ01-${idx + 1}`),
      );

      mockFrom.mockReturnValueOnce(masterChain).mockReturnValueOnce(itemsChain);
      for (const sub of subInserts) {
        mockFrom.mockReturnValueOnce(sub);
      }

      const result = await splitOrderBySupplier(MASTER_ORDER_ID);

      expect(result).toHaveLength(5);

      // Each supplier should have 4 items
      for (const sub of result) {
        expect(sub.items).toHaveLength(4);
      }

      // All 20 items accounted for
      const totalItems = result.reduce((sum, sub) => sum + sub.items.length, 0);
      expect(totalItems).toBe(20);

      // All totals balance
      for (const sub of result) {
        expect(sub.subtotal + sub.taxAmount).toBe(sub.totalAmount);
      }
    });
  });

  // =========================================================================
  // Scenario 6 — getSubOrders and getSupplierSubOrder
  // =========================================================================
  describe("Scenario 6 — getSubOrders and getSupplierSubOrder", () => {
    it("getSubOrders returns all sub-orders for a master", async () => {
      const subOrderRows = [
        makeSubOrderRow({
          id: "sub-1",
          supplier_id: SUPPLIER_A,
          order_number: "SUB-ORD-20260224-XYZ01-1",
          total_amount: "54.13",
          tax_amount: "4.13",
        }),
        makeSubOrderRow({
          id: "sub-2",
          supplier_id: SUPPLIER_B,
          order_number: "SUB-ORD-20260224-XYZ01-2",
          total_amount: "64.95",
          tax_amount: "4.95",
        }),
      ];

      const subOrdersChain = mockQuery({ data: subOrderRows });

      // Batch fetch: all items for the master order
      const allItemsChain = mockQuery({
        data: [
          {
            id: "oi-1",
            product_id: "prod-1",
            supplier_id: SUPPLIER_A,
            quantity: 2,
            unit_price: "25.00",
            subtotal: "50.00",
          },
          {
            id: "oi-2",
            product_id: "prod-2",
            supplier_id: SUPPLIER_B,
            quantity: 3,
            unit_price: "20.00",
            subtotal: "60.00",
          },
        ],
      });

      // Batch fetch: all suppliers
      const allSuppliersChain = mockQuery({
        data: [
          { id: SUPPLIER_A, business_name: "MedSupply A" },
          { id: SUPPLIER_B, business_name: "MedSupply B" },
        ],
      });

      mockFrom
        .mockReturnValueOnce(subOrdersChain)
        .mockReturnValueOnce(allItemsChain)
        .mockReturnValueOnce(allSuppliersChain);

      const result = await getSubOrders(MASTER_ORDER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].supplierId).toBe(SUPPLIER_A);
      expect(result[0].supplierName).toBe("MedSupply A");
      expect(result[0].items).toHaveLength(1);
      expect(result[0].masterOrderId).toBe(MASTER_ORDER_ID);
      expect(result[1].supplierId).toBe(SUPPLIER_B);
      expect(result[1].supplierName).toBe("MedSupply B");
      expect(result[1].items).toHaveLength(1);
    });

    it("getSupplierSubOrder returns correct single sub-order", async () => {
      const subOrderChain = mockQuery({
        data: makeSubOrderRow({
          id: "sub-1",
          supplier_id: SUPPLIER_A,
          total_amount: "54.13",
          tax_amount: "4.13",
        }),
      });
      const itemsChain = mockQuery({
        data: [
          { id: "oi-1", product_id: "prod-1", quantity: 2, unit_price: "25.00", subtotal: "50.00" },
        ],
      });
      const supplierChain = mockQuery({ data: { business_name: "MedSupply A" } });

      mockFrom
        .mockReturnValueOnce(subOrderChain)
        .mockReturnValueOnce(itemsChain)
        .mockReturnValueOnce(supplierChain);

      const result = await getSupplierSubOrder(MASTER_ORDER_ID, SUPPLIER_A);

      expect(result).not.toBeNull();
      expect(result!.supplierId).toBe(SUPPLIER_A);
      expect(result!.supplierName).toBe("MedSupply A");
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0].productId).toBe("prod-1");
      expect(result!.items[0].unitPrice).toBe(25);
      expect(result!.items[0].subtotal).toBe(50);
      expect(result!.totalAmount).toBe(54.13);
      expect(result!.taxAmount).toBe(4.13);
      expect(result!.subtotal).toBe(50);
    });

    it("getSupplierSubOrder returns null for non-existent supplier", async () => {
      const subOrderChain = mockQuery({
        data: null,
        error: { message: "not found" },
      });

      mockFrom.mockReturnValueOnce(subOrderChain);

      const result = await getSupplierSubOrder(MASTER_ORDER_ID, "non-existent-supplier");

      expect(result).toBeNull();
    });
  });
});
