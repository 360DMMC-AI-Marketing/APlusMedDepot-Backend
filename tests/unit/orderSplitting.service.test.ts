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

const MASTER_ORDER_ID = "master-order-1";
const SUPPLIER_1 = "sup-1";
const SUPPLIER_2 = "sup-2";
const SUPPLIER_3 = "sup-3";

const validAddress = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  country: "US",
};

function makeMasterOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: MASTER_ORDER_ID,
    order_number: "ORD-20260222-03F61",
    customer_id: "customer-1",
    parent_order_id: null,
    shipping_address: validAddress,
    status: "pending_payment",
    payment_status: "pending",
    ...overrides,
  };
}

function makeOrderItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "oi-1",
    product_id: "prod-1",
    supplier_id: SUPPLIER_1,
    quantity: 2,
    unit_price: "15.00",
    subtotal: "30.00",
    suppliers: { business_name: "MedSupply Co" },
    ...overrides,
  };
}

function makeSubOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-order-1",
    order_number: "SUB-ORD-20260222-03F61-1",
    supplier_id: SUPPLIER_1,
    total_amount: "32.48",
    tax_amount: "2.48",
    status: "pending_payment",
    created_at: "2026-02-22T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── splitOrderBySupplier ──────────────────────────────────────────────

describe("splitOrderBySupplier", () => {
  it("single supplier, 3 items → 1 sub-order with correct total", async () => {
    const items = [
      makeOrderItem({ id: "oi-1", product_id: "prod-1", subtotal: "10.00", quantity: 1 }),
      makeOrderItem({ id: "oi-2", product_id: "prod-2", subtotal: "20.00", quantity: 2 }),
      makeOrderItem({ id: "oi-3", product_id: "prod-3", subtotal: "30.00", quantity: 3 }),
    ];
    // subtotal = 60, tax = 60 * 0.0825 = 4.95, total = 64.95

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].supplierId).toBe(SUPPLIER_1);
    expect(result[0].items).toHaveLength(3);
    expect(result[0].subtotal).toBe(60);
    expect(result[0].taxAmount).toBe(4.95);
    expect(result[0].totalAmount).toBe(64.95);
    expect(result[0].supplierName).toBe("MedSupply Co");
  });

  it("3 suppliers, 4 items → 3 sub-orders with correct item grouping", async () => {
    const items = [
      makeOrderItem({
        id: "oi-1",
        product_id: "prod-1",
        supplier_id: SUPPLIER_1,
        subtotal: "10.00",
        suppliers: { business_name: "Supplier A" },
      }),
      makeOrderItem({
        id: "oi-2",
        product_id: "prod-2",
        supplier_id: SUPPLIER_2,
        subtotal: "20.00",
        suppliers: { business_name: "Supplier B" },
      }),
      makeOrderItem({
        id: "oi-3",
        product_id: "prod-3",
        supplier_id: SUPPLIER_1,
        subtotal: "15.00",
        suppliers: { business_name: "Supplier A" },
      }),
      makeOrderItem({
        id: "oi-4",
        product_id: "prod-4",
        supplier_id: SUPPLIER_3,
        subtotal: "30.00",
        suppliers: { business_name: "Supplier C" },
      }),
    ];

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const sub1 = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });
    const sub2 = mockQuery({
      data: {
        id: "sub-2",
        order_number: "SUB-ORD-20260222-03F61-2",
        created_at: "2026-02-22T00:00:00Z",
      },
    });
    const sub3 = mockQuery({
      data: {
        id: "sub-3",
        order_number: "SUB-ORD-20260222-03F61-3",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(sub1)
      .mockReturnValueOnce(sub2)
      .mockReturnValueOnce(sub3);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result).toHaveLength(3);

    // Supplier 1: oi-1 + oi-3 (2 items)
    const s1 = result.find((s) => s.supplierId === SUPPLIER_1);
    expect(s1).toBeDefined();
    expect(s1!.items).toHaveLength(2);
    expect(s1!.supplierName).toBe("Supplier A");

    // Supplier 2: oi-2 (1 item)
    const s2 = result.find((s) => s.supplierId === SUPPLIER_2);
    expect(s2).toBeDefined();
    expect(s2!.items).toHaveLength(1);
    expect(s2!.supplierName).toBe("Supplier B");

    // Supplier 3: oi-4 (1 item)
    const s3 = result.find((s) => s.supplierId === SUPPLIER_3);
    expect(s3).toBeDefined();
    expect(s3!.items).toHaveLength(1);
    expect(s3!.supplierName).toBe("Supplier C");
  });

  it("sub-order totals: subtotal + tax = total_amount", async () => {
    const items = [
      makeOrderItem({ id: "oi-1", subtotal: "50.00" }),
      makeOrderItem({ id: "oi-2", subtotal: "50.00" }),
    ];
    // subtotal = 100, tax = 100 * 0.0825 = 8.25, total = 108.25

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].subtotal + result[0].taxAmount).toBe(result[0].totalAmount);
  });

  it("sub-order inherits shipping_address from master", async () => {
    const customAddress = {
      street: "456 Oak Ave",
      city: "Dallas",
      state: "TX",
      zip_code: "75001",
      country: "US",
    };

    const items = [makeOrderItem()];
    const masterChain = mockQuery({
      data: makeMasterOrder({ shipping_address: customAddress }),
    });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    await splitOrderBySupplier(MASTER_ORDER_ID);

    const insertData = subInsertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertData.shipping_address).toEqual(customAddress);
  });

  it("sub-order inherits status and payment_status from master", async () => {
    const items = [makeOrderItem()];
    const masterChain = mockQuery({
      data: makeMasterOrder({ status: "payment_confirmed", payment_status: "paid" }),
    });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result[0].status).toBe("payment_confirmed");
    const insertData = subInsertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertData.status).toBe("payment_confirmed");
    expect(insertData.payment_status).toBe("paid");
  });

  it("sub-order order_number follows format: SUB-{masterNumber}-{index}", async () => {
    const items = [
      makeOrderItem({
        id: "oi-1",
        supplier_id: SUPPLIER_1,
        suppliers: { business_name: "A" },
      }),
      makeOrderItem({
        id: "oi-2",
        supplier_id: SUPPLIER_2,
        suppliers: { business_name: "B" },
      }),
    ];

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const sub1 = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });
    const sub2 = mockQuery({
      data: {
        id: "sub-2",
        order_number: "SUB-ORD-20260222-03F61-2",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(sub1)
      .mockReturnValueOnce(sub2);

    await splitOrderBySupplier(MASTER_ORDER_ID);

    const insert1Data = sub1.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insert1Data.order_number).toBe("SUB-ORD-20260222-03F61-1");

    const insert2Data = sub2.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insert2Data.order_number).toBe("SUB-ORD-20260222-03F61-2");
  });

  it("master order unchanged after splitting", async () => {
    const items = [makeOrderItem()];
    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    await splitOrderBySupplier(MASTER_ORDER_ID);

    // Only 3 from() calls: master fetch, items fetch, sub-order insert
    expect(mockFrom).toHaveBeenCalledTimes(3);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "orders");
    expect(mockFrom).toHaveBeenNthCalledWith(2, "order_items");
    expect(mockFrom).toHaveBeenNthCalledWith(3, "orders");
    // No update calls on any chain
    expect(masterChain.update).not.toHaveBeenCalled();
    expect(itemsChain.update).not.toHaveBeenCalled();
  });

  it("empty items array → returns empty array, no sub-orders created", async () => {
    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(masterChain).mockReturnValueOnce(itemsChain);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result).toEqual([]);
    // Only 2 from() calls: master fetch, items fetch — no insert
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("tax calculation: subtotal $100 → tax $8.25 → total $108.25", async () => {
    const items = [makeOrderItem({ id: "oi-1", subtotal: "100.00" })];

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const subInsertChain = mockQuery({
      data: {
        id: "sub-1",
        order_number: "SUB-ORD-20260222-03F61-1",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(subInsertChain);

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    expect(result[0].subtotal).toBe(100);
    expect(result[0].taxAmount).toBe(8.25);
    expect(result[0].totalAmount).toBe(108.25);

    const insertData = subInsertChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(insertData.tax_amount).toBe(8.25);
    expect(insertData.total_amount).toBe(108.25);
  });

  it("DB failure during sub-order creation → logged, master order unaffected", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const items = [
      makeOrderItem({
        id: "oi-1",
        supplier_id: SUPPLIER_1,
        suppliers: { business_name: "A" },
      }),
      makeOrderItem({
        id: "oi-2",
        supplier_id: SUPPLIER_2,
        suppliers: { business_name: "B" },
      }),
    ];

    const masterChain = mockQuery({ data: makeMasterOrder() });
    const itemsChain = mockQuery({ data: items });
    const failedInsert = mockQuery({
      data: null,
      error: { message: "DB error" },
    });
    const successInsert = mockQuery({
      data: {
        id: "sub-2",
        order_number: "SUB-ORD-20260222-03F61-2",
        created_at: "2026-02-22T00:00:00Z",
      },
    });

    mockFrom
      .mockReturnValueOnce(masterChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(failedInsert) // supplier 1 fails
      .mockReturnValueOnce(successInsert); // supplier 2 succeeds

    const result = await splitOrderBySupplier(MASTER_ORDER_ID);

    // Should not throw — returns only the successful sub-order
    expect(result).toHaveLength(1);
    expect(result[0].supplierId).toBe(SUPPLIER_2);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ── getSubOrders ──────────────────────────────────────────────────────

describe("getSubOrders", () => {
  it("returns all sub-orders for a master", async () => {
    const subOrderRows = [
      makeSubOrderRow({
        id: "sub-1",
        supplier_id: SUPPLIER_1,
        order_number: "SUB-ORD-20260222-03F61-1",
      }),
      makeSubOrderRow({
        id: "sub-2",
        supplier_id: SUPPLIER_2,
        order_number: "SUB-ORD-20260222-03F61-2",
      }),
    ];

    const subOrdersChain = mockQuery({ data: subOrderRows });

    // Batch fetch: all items for the master order
    const allItemsChain = mockQuery({
      data: [
        {
          id: "oi-1",
          product_id: "prod-1",
          supplier_id: SUPPLIER_1,
          quantity: 2,
          unit_price: "15.00",
          subtotal: "30.00",
        },
        {
          id: "oi-2",
          product_id: "prod-2",
          supplier_id: SUPPLIER_2,
          quantity: 1,
          unit_price: "20.00",
          subtotal: "20.00",
        },
      ],
    });

    // Batch fetch: all suppliers
    const allSuppliersChain = mockQuery({
      data: [
        { id: SUPPLIER_1, business_name: "Supplier A" },
        { id: SUPPLIER_2, business_name: "Supplier B" },
      ],
    });

    mockFrom
      .mockReturnValueOnce(subOrdersChain)
      .mockReturnValueOnce(allItemsChain)
      .mockReturnValueOnce(allSuppliersChain);

    const result = await getSubOrders(MASTER_ORDER_ID);

    expect(result).toHaveLength(2);
    expect(result[0].supplierId).toBe(SUPPLIER_1);
    expect(result[0].supplierName).toBe("Supplier A");
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].productId).toBe("prod-1");
    expect(result[1].supplierId).toBe(SUPPLIER_2);
    expect(result[1].supplierName).toBe("Supplier B");
    expect(result[1].items).toHaveLength(1);
    expect(result[1].items[0].productId).toBe("prod-2");
  });
});

// ── getSupplierSubOrder ───────────────────────────────────────────────

describe("getSupplierSubOrder", () => {
  it("returns correct sub-order for given supplier", async () => {
    const subOrderChain = mockQuery({
      data: makeSubOrderRow({ id: "sub-1", supplier_id: SUPPLIER_1 }),
    });
    const itemsChain = mockQuery({
      data: [
        {
          id: "oi-1",
          product_id: "prod-1",
          quantity: 2,
          unit_price: "15.00",
          subtotal: "30.00",
        },
      ],
    });
    const supplierChain = mockQuery({
      data: { business_name: "MedSupply Co" },
    });

    mockFrom
      .mockReturnValueOnce(subOrderChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(supplierChain);

    const result = await getSupplierSubOrder(MASTER_ORDER_ID, SUPPLIER_1);

    expect(result).not.toBeNull();
    expect(result!.supplierId).toBe(SUPPLIER_1);
    expect(result!.supplierName).toBe("MedSupply Co");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].productId).toBe("prod-1");
    expect(result!.items[0].unitPrice).toBe(15);
    expect(result!.items[0].subtotal).toBe(30);
  });

  it("returns null for non-existent supplier", async () => {
    const subOrderChain = mockQuery({
      data: null,
      error: { message: "not found" },
    });

    mockFrom.mockReturnValueOnce(subOrderChain);

    const result = await getSupplierSubOrder(MASTER_ORDER_ID, "non-existent");

    expect(result).toBeNull();
  });
});
