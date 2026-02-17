const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockCheckAndDecrementStock = jest.fn();
const mockIncrementStock = jest.fn();

jest.mock("../../src/utils/inventory", () => ({
  checkAndDecrementStock: mockCheckAndDecrementStock,
  incrementStock: mockIncrementStock,
}));

const mockSplitOrderBySupplier = jest.fn();

jest.mock("../../src/services/orderSplitting.service", () => ({
  splitOrderBySupplier: mockSplitOrderBySupplier,
}));

import { OrderService } from "../../src/services/order.service";
import { AppError } from "../../src/utils/errors";

// Each chain method is its own mock so we can inspect call args
function mockQuery(result: { data?: unknown; error?: unknown; count?: number }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
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

const USER_ID = "user-customer-1";
const CART_ID = "cart-uuid-1";
const ORDER_ID = "order-uuid-1";
const SUPPLIER_1 = "sup-1";
const SUPPLIER_2 = "sup-2";

const validAddress = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  country: "US",
};

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "prod-1",
    name: "Surgical Gloves",
    price: "15.00",
    stock_quantity: 100,
    status: "active",
    is_deleted: false,
    supplier_id: SUPPLIER_1,
    ...overrides,
  };
}

function makeCartItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    product_id: "prod-1",
    quantity: 2,
    ...overrides,
  };
}

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "ORD-20260216-ABC12",
    customer_id: USER_ID,
    parent_order_id: null,
    supplier_id: null,
    total_amount: "32.48",
    tax_amount: "2.48",
    shipping_address: validAddress,
    status: "pending_payment",
    payment_status: "pending",
    payment_intent_id: null,
    notes: null,
    created_at: "2026-02-16T00:00:00Z",
    updated_at: "2026-02-16T00:00:00Z",
    ...overrides,
  };
}

function makeOrderItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "oi-uuid-1",
    order_id: ORDER_ID,
    product_id: "prod-1",
    supplier_id: SUPPLIER_1,
    quantity: 2,
    unit_price: "15.00",
    subtotal: "30.00",
    fulfillment_status: "pending",
    ...overrides,
  };
}

interface HappyPathOptions {
  cartItems?: unknown[];
  products?: unknown[];
  orderRow?: Record<string, unknown>;
  orderItemRows?: unknown[];
}

/**
 * Sets up mockFrom calls for the full happy path:
 * 1. carts → { id: CART_ID }
 * 2. cart_items → cartItems
 * 3. products → products
 * 4. orders INSERT → orderRow
 * 5. order_items INSERT → orderItemRows
 * 6. cart_items DELETE → success
 */
function setupHappyPath(options: HappyPathOptions = {}) {
  const {
    cartItems = [makeCartItem()],
    products = [makeProduct()],
    orderRow = makeOrderRow(),
    orderItemRows = [makeOrderItemRow()],
  } = options;

  const cartChain = mockQuery({ data: { id: CART_ID } });
  const cartItemsChain = mockQuery({ data: cartItems });
  const productsChain = mockQuery({ data: products });
  const orderInsertChain = mockQuery({ data: orderRow });
  const orderItemsInsertChain = mockQuery({ data: orderItemRows });
  const cartClearChain = mockQuery({ data: null });

  mockFrom
    .mockReturnValueOnce(cartChain)
    .mockReturnValueOnce(cartItemsChain)
    .mockReturnValueOnce(productsChain)
    .mockReturnValueOnce(orderInsertChain)
    .mockReturnValueOnce(orderItemsInsertChain)
    .mockReturnValueOnce(cartClearChain);

  return {
    cartChain,
    cartItemsChain,
    productsChain,
    orderInsertChain,
    orderItemsInsertChain,
    cartClearChain,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.TAX_RATE;
  mockCheckAndDecrementStock.mockResolvedValue(undefined);
  mockIncrementStock.mockResolvedValue(undefined);
  mockSplitOrderBySupplier.mockResolvedValue(undefined);
});

describe("OrderService.createOrder", () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it("creates order with correct status, items, and numeric conversions", async () => {
    setupHappyPath();

    const result = await OrderService.createOrder(USER_ID, validAddress);

    expect(result.id).toBe(ORDER_ID);
    expect(result.status).toBe("pending_payment");
    expect(result.payment_status).toBe("pending");
    expect(result.customer_id).toBe(USER_ID);
    expect(result.parent_order_id).toBeNull();
    expect(result.supplier_id).toBeNull();
    expect(result.total_amount).toBe(32.48);
    expect(result.tax_amount).toBe(2.48);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].supplier_id).toBe(SUPPLIER_1);
    expect(result.items[0].unit_price).toBe(15.0);
    expect(result.items[0].fulfillment_status).toBe("pending");
    expect(result.items[0].product_name).toBe("Surgical Gloves");
  });

  it("calculates correct totals: total = sum(subtotals) + tax", async () => {
    const { orderInsertChain } = setupHappyPath();

    await OrderService.createOrder(USER_ID, validAddress);

    // subtotal = 15 * 2 = 30, tax = 30 * 0.0825 = 2.475 → 2.48, total = 32.48
    const insertData = orderInsertChain.insert.mock.calls[0][0];
    expect(insertData.total_amount).toBe(32.48);
    expect(insertData.tax_amount).toBe(2.48);
  });

  it("rounds tax with correct precision (Math.round)", async () => {
    // $9.99 * 3 = $29.97, tax = 29.97 * 0.0825 = 2.472525 → 2.47
    const product = makeProduct({ price: "9.99" });
    const cartItem = makeCartItem({ quantity: 3 });
    const orderRow = makeOrderRow({ total_amount: "32.44", tax_amount: "2.47" });
    const orderItemRow = makeOrderItemRow({
      unit_price: "9.99",
      subtotal: "29.97",
      quantity: 3,
    });

    const { orderInsertChain } = setupHappyPath({
      cartItems: [cartItem],
      products: [product],
      orderRow,
      orderItemRows: [orderItemRow],
    });

    await OrderService.createOrder(USER_ID, validAddress);

    const insertData = orderInsertChain.insert.mock.calls[0][0];
    expect(insertData.tax_amount).toBe(2.47);
    expect(insertData.total_amount).toBeCloseTo(32.44, 2);
  });

  it("uses custom TAX_RATE env var", async () => {
    process.env.TAX_RATE = "0.10";

    const orderRow = makeOrderRow({ total_amount: "33.00", tax_amount: "3.00" });
    const { orderInsertChain } = setupHappyPath({ orderRow });

    await OrderService.createOrder(USER_ID, validAddress);

    // 15 * 2 = 30, tax = 30 * 0.10 = 3.00
    const insertData = orderInsertChain.insert.mock.calls[0][0];
    expect(insertData.tax_amount).toBe(3.0);
    expect(insertData.total_amount).toBe(33.0);
  });

  it("preserves shipping address in return value", async () => {
    setupHappyPath();

    const result = await OrderService.createOrder(USER_ID, validAddress);

    expect(result.shipping_address).toEqual(validAddress);
  });

  it("stores notes when provided", async () => {
    const orderRow = makeOrderRow({ notes: "Leave at door" });
    const { orderInsertChain } = setupHappyPath({ orderRow });

    const result = await OrderService.createOrder(USER_ID, validAddress, "Leave at door");

    const insertData = orderInsertChain.insert.mock.calls[0][0];
    expect(insertData.notes).toBe("Leave at door");
    expect(result.notes).toBe("Leave at door");
  });

  it("stores null notes when not provided", async () => {
    const { orderInsertChain } = setupHappyPath();

    await OrderService.createOrder(USER_ID, validAddress);

    const insertData = orderInsertChain.insert.mock.calls[0][0];
    expect(insertData.notes).toBeNull();
  });

  it("calls splitOrderBySupplier with order ID", async () => {
    setupHappyPath();

    await OrderService.createOrder(USER_ID, validAddress);

    expect(mockSplitOrderBySupplier).toHaveBeenCalledWith(ORDER_ID);
  });

  it("handles multi-item, multi-supplier order with correct supplier_ids", async () => {
    const product1 = makeProduct({
      id: "prod-1",
      name: "Gloves",
      price: "10.00",
      supplier_id: SUPPLIER_1,
    });
    const product2 = makeProduct({
      id: "prod-2",
      name: "Masks",
      price: "20.00",
      supplier_id: SUPPLIER_2,
    });

    const item1 = makeCartItem({ id: "ci-1", product_id: "prod-1", quantity: 3 });
    const item2 = makeCartItem({ id: "ci-2", product_id: "prod-2", quantity: 1 });

    // subtotal = 10*3 + 20*1 = 50, tax = 50 * 0.0825 = 4.125 → 4.13, total = 54.13
    const orderRow = makeOrderRow({ total_amount: "54.13", tax_amount: "4.13" });
    const orderItemRow1 = makeOrderItemRow({
      id: "oi-1",
      product_id: "prod-1",
      supplier_id: SUPPLIER_1,
      quantity: 3,
      unit_price: "10.00",
      subtotal: "30.00",
    });
    const orderItemRow2 = makeOrderItemRow({
      id: "oi-2",
      product_id: "prod-2",
      supplier_id: SUPPLIER_2,
      quantity: 1,
      unit_price: "20.00",
      subtotal: "20.00",
    });

    setupHappyPath({
      cartItems: [item1, item2],
      products: [product1, product2],
      orderRow,
      orderItemRows: [orderItemRow1, orderItemRow2],
    });

    const result = await OrderService.createOrder(USER_ID, validAddress);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].supplier_id).toBe(SUPPLIER_1);
    expect(result.items[1].supplier_id).toBe(SUPPLIER_2);
    expect(result.items[0].unit_price).toBe(10.0);
    expect(result.items[1].unit_price).toBe(20.0);
  });

  // ── Validation failures ─────────────────────────────────────────────

  it("throws badRequest when no active cart exists", async () => {
    const cartChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(cartChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow("Cart is empty");
    expect(mockCheckAndDecrementStock).not.toHaveBeenCalled();
  });

  it("throws badRequest when cart has zero items", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(cartChain).mockReturnValueOnce(itemsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow("Cart is empty");
    expect(mockCheckAndDecrementStock).not.toHaveBeenCalled();
  });

  it("throws badRequest when product is inactive, without calling stock decrement", async () => {
    const product = makeProduct({ status: "inactive" });
    const cartItem = makeCartItem();

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "One or more products are unavailable",
    );
    expect(mockCheckAndDecrementStock).not.toHaveBeenCalled();
  });

  it("throws badRequest when product is deleted, without calling stock decrement", async () => {
    const product = makeProduct({ is_deleted: true });
    const cartItem = makeCartItem();

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "One or more products are unavailable",
    );
    expect(mockCheckAndDecrementStock).not.toHaveBeenCalled();
  });

  it("throws badRequest for insufficient stock (pre-validation)", async () => {
    const product = makeProduct({ stock_quantity: 1 });
    const cartItem = makeCartItem({ quantity: 5 });

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [cartItem] });
    const productsChain = mockQuery({ data: [product] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "Insufficient stock for one or more items",
    );
    expect(mockCheckAndDecrementStock).not.toHaveBeenCalled();
  });

  // ── Transaction atomicity ───────────────────────────────────────────

  it("propagates error when stock decrement fails, no order created", async () => {
    mockCheckAndDecrementStock.mockRejectedValueOnce(
      new AppError("Insufficient stock", 400, "INSUFFICIENT_STOCK"),
    );

    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [makeCartItem()] });
    const productsChain = mockQuery({ data: [makeProduct()] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "Insufficient stock",
    );
    // Only 3 from() calls (reads), no write calls
    expect(mockFrom).toHaveBeenCalledTimes(3);
  });

  it("calls incrementStock to compensate when order INSERT fails", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [makeCartItem()] });
    const productsChain = mockQuery({ data: [makeProduct()] });
    const failedOrderChain = mockQuery({
      data: null,
      error: { message: "insert failed" },
    });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(failedOrderChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow("insert failed");
    expect(mockIncrementStock).toHaveBeenCalledTimes(1);
  });

  it("calls incrementStock when order_items INSERT fails", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [makeCartItem()] });
    const productsChain = mockQuery({ data: [makeProduct()] });
    const orderInsertChain = mockQuery({ data: makeOrderRow() });
    const failedItemsChain = mockQuery({
      data: null,
      error: { message: "items insert failed" },
    });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(orderInsertChain)
      .mockReturnValueOnce(failedItemsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "items insert failed",
    );
    expect(mockIncrementStock).toHaveBeenCalledTimes(1);
  });

  it("calls incrementStock when cart clear fails", async () => {
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [makeCartItem()] });
    const productsChain = mockQuery({ data: [makeProduct()] });
    const orderInsertChain = mockQuery({ data: makeOrderRow() });
    const orderItemsChain = mockQuery({ data: [makeOrderItemRow()] });
    const failedClearChain = mockQuery({
      data: null,
      error: { message: "clear failed" },
    });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain)
      .mockReturnValueOnce(orderInsertChain)
      .mockReturnValueOnce(orderItemsChain)
      .mockReturnValueOnce(failedClearChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow("clear failed");
    expect(mockIncrementStock).toHaveBeenCalledTimes(1);
  });

  // ── Concurrent creation ─────────────────────────────────────────────

  it("second caller fails when stock is exhausted at decrement", async () => {
    mockCheckAndDecrementStock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new AppError("Insufficient stock", 400, "INSUFFICIENT_STOCK"));

    // First call succeeds
    setupHappyPath();
    const result = await OrderService.createOrder(USER_ID, validAddress);
    expect(result.id).toBe(ORDER_ID);

    // Second call: reads succeed but stock decrement fails
    const cartChain = mockQuery({ data: { id: CART_ID } });
    const itemsChain = mockQuery({ data: [makeCartItem()] });
    const productsChain = mockQuery({ data: [makeProduct()] });

    mockFrom
      .mockReturnValueOnce(cartChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(productsChain);

    await expect(OrderService.createOrder(USER_ID, validAddress)).rejects.toThrow(
      "Insufficient stock",
    );
  });
});

// ── listOrders ──────────────────────────────────────────────────────

describe("OrderService.listOrders", () => {
  const defaultQuery = {
    page: 1,
    limit: 10,
    sort_by: "created_at",
    sort_order: "desc",
  };

  function makeListRow(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      order_number: "ORD-20260216-ABC12",
      status: "pending_payment",
      payment_status: "pending",
      total_amount: "32.48",
      created_at: "2026-02-16T00:00:00Z",
      order_items: [{ id: "oi-1" }, { id: "oi-2" }],
      ...overrides,
    };
  }

  it("returns paginated response with correct shape", async () => {
    const chain = mockQuery({ data: [makeListRow()], count: 1 });
    mockFrom.mockReturnValueOnce(chain);

    const result = await OrderService.listOrders(USER_ID, defaultQuery);

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe(ORDER_ID);
    expect(result.orders[0].total_amount).toBe(32.48);
    expect(result.orders[0].item_count).toBe(2);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      total_pages: 1,
    });
  });

  it("page=2 passes correct range offset", async () => {
    const chain = mockQuery({ data: [], count: 25 });
    mockFrom.mockReturnValueOnce(chain);

    await OrderService.listOrders(USER_ID, { ...defaultQuery, page: 2 });

    expect(chain.range).toHaveBeenCalledWith(10, 19);
  });

  it("applies status filter when provided", async () => {
    const chain = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(chain);

    await OrderService.listOrders(USER_ID, {
      ...defaultQuery,
      status: "delivered",
    });

    // eq called for customer_id and status
    const eqCalls = chain.eq.mock.calls;
    expect(eqCalls).toContainEqual(["status", "delivered"]);
  });

  it("filters by customer_id and parent_order_id IS NULL", async () => {
    const chain = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValueOnce(chain);

    await OrderService.listOrders(USER_ID, defaultQuery);

    expect(chain.eq).toHaveBeenCalledWith("customer_id", USER_ID);
    expect(chain.is).toHaveBeenCalledWith("parent_order_id", null);
  });

  it("computes item_count from embedded order_items length", async () => {
    const row = makeListRow({
      order_items: [{ id: "a" }, { id: "b" }, { id: "c" }],
    });
    const chain = mockQuery({ data: [row], count: 1 });
    mockFrom.mockReturnValueOnce(chain);

    const result = await OrderService.listOrders(USER_ID, defaultQuery);

    expect(result.orders[0].item_count).toBe(3);
  });
});

// ── updateOrderStatus ───────────────────────────────────────────────

describe("OrderService.updateOrderStatus", () => {
  const ADMIN_ID = "user-admin-1";

  function makeCurrentOrder(status: string) {
    return { id: ORDER_ID, status };
  }

  function makeUpdatedOrderRow(status: string) {
    return {
      id: ORDER_ID,
      order_number: "ORD-20260216-ABC12",
      customer_id: USER_ID,
      parent_order_id: null,
      supplier_id: null,
      total_amount: "32.48",
      tax_amount: "2.48",
      shipping_address: validAddress,
      status,
      payment_status: "pending",
      payment_intent_id: null,
      notes: null,
      created_at: "2026-02-16T00:00:00Z",
      updated_at: "2026-02-16T00:00:00Z",
    };
  }

  it("updates status and inserts history record on valid transition", async () => {
    const fetchChain = mockQuery({ data: makeCurrentOrder("pending_payment") });
    const updateChain = mockQuery({ data: makeUpdatedOrderRow("payment_processing") });
    const historyChain = mockQuery({ data: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(historyChain);

    const result = await OrderService.updateOrderStatus(
      ORDER_ID,
      "payment_processing",
      ADMIN_ID,
      "Payment initiated",
    );

    expect(result.status).toBe("payment_processing");
    expect(result.id).toBe(ORDER_ID);

    // Verify history insert args
    const historyInsertData = historyChain.insert.mock.calls[0][0];
    expect(historyInsertData.order_id).toBe(ORDER_ID);
    expect(historyInsertData.from_status).toBe("pending_payment");
    expect(historyInsertData.to_status).toBe("payment_processing");
    expect(historyInsertData.changed_by).toBe(ADMIN_ID);
    expect(historyInsertData.reason).toBe("Payment initiated");
  });

  it("throws badRequest on invalid transition with allowed list", async () => {
    const fetchChain = mockQuery({ data: makeCurrentOrder("pending_payment") });
    mockFrom.mockReturnValueOnce(fetchChain);

    await expect(OrderService.updateOrderStatus(ORDER_ID, "delivered", ADMIN_ID)).rejects.toThrow(
      /Invalid status transition.*Allowed/,
    );
  });

  it("throws notFound when order does not exist", async () => {
    const fetchChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(fetchChain);

    await expect(
      OrderService.updateOrderStatus(ORDER_ID, "payment_processing", ADMIN_ID),
    ).rejects.toThrow("Order not found");
  });

  it("stores reason when provided", async () => {
    const fetchChain = mockQuery({ data: makeCurrentOrder("pending_payment") });
    const updateChain = mockQuery({ data: makeUpdatedOrderRow("cancelled") });
    const historyChain = mockQuery({ data: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(historyChain);

    await OrderService.updateOrderStatus(ORDER_ID, "cancelled", ADMIN_ID, "Customer request");

    const historyData = historyChain.insert.mock.calls[0][0];
    expect(historyData.reason).toBe("Customer request");
  });

  it("stores null reason when omitted", async () => {
    const fetchChain = mockQuery({ data: makeCurrentOrder("pending_payment") });
    const updateChain = mockQuery({ data: makeUpdatedOrderRow("payment_processing") });
    const historyChain = mockQuery({ data: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(historyChain);

    await OrderService.updateOrderStatus(ORDER_ID, "payment_processing", ADMIN_ID);

    const historyData = historyChain.insert.mock.calls[0][0];
    expect(historyData.reason).toBeNull();
  });

  it("returns order with numeric amount conversions", async () => {
    const fetchChain = mockQuery({ data: makeCurrentOrder("pending_payment") });
    const updateChain = mockQuery({ data: makeUpdatedOrderRow("payment_processing") });
    const historyChain = mockQuery({ data: null });

    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(historyChain);

    const result = await OrderService.updateOrderStatus(ORDER_ID, "payment_processing", ADMIN_ID);

    expect(result.total_amount).toBe(32.48);
    expect(result.tax_amount).toBe(2.48);
  });
});

// ── updateMasterOrderStatus ─────────────────────────────────────────

describe("OrderService.updateMasterOrderStatus", () => {
  const CHANGED_BY = "user-supplier-1";

  function makeItems(statuses: string[]) {
    return statuses.map((s) => ({ fulfillment_status: s }));
  }

  function setupMasterMocks(
    currentStatus: string,
    itemStatuses: string[],
    expectUpdate: boolean,
    newStatus?: string,
  ) {
    // 1. orders SELECT (current order)
    const orderFetchChain = mockQuery({ data: { id: ORDER_ID, status: currentStatus } });
    // 2. order_items SELECT (fulfillment statuses)
    const itemsFetchChain = mockQuery({ data: makeItems(itemStatuses) });

    mockFrom.mockReturnValueOnce(orderFetchChain).mockReturnValueOnce(itemsFetchChain);

    if (expectUpdate && newStatus) {
      // updateOrderStatus internally calls: 3 more from() calls
      const innerFetchChain = mockQuery({ data: { id: ORDER_ID, status: currentStatus } });
      const innerUpdateChain = mockQuery({
        data: {
          id: ORDER_ID,
          order_number: "ORD-20260216-ABC12",
          customer_id: USER_ID,
          parent_order_id: null,
          supplier_id: null,
          total_amount: "32.48",
          tax_amount: "2.48",
          shipping_address: validAddress,
          status: newStatus,
          payment_status: "pending",
          payment_intent_id: null,
          notes: null,
          created_at: "2026-02-16T00:00:00Z",
          updated_at: "2026-02-16T00:00:00Z",
        },
      });
      const innerHistoryChain = mockQuery({ data: null });

      mockFrom
        .mockReturnValueOnce(innerFetchChain)
        .mockReturnValueOnce(innerUpdateChain)
        .mockReturnValueOnce(innerHistoryChain);
    }
  }

  it("does not change status when all items are pending", async () => {
    setupMasterMocks("awaiting_fulfillment", ["pending", "pending", "pending"], false);

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);

    // Only 2 from() calls (fetch order + fetch items), no update
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it("sets partially_shipped when 1 of 3 items shipped", async () => {
    setupMasterMocks(
      "awaiting_fulfillment",
      ["shipped", "pending", "pending"],
      true,
      "partially_shipped",
    );

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);

    // 2 (master reads) + 3 (updateOrderStatus internals) = 5
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets partially_shipped when 2 of 3 items shipped", async () => {
    setupMasterMocks(
      "awaiting_fulfillment",
      ["shipped", "shipped", "pending"],
      true,
      "partially_shipped",
    );

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets fully_shipped when all items shipped", async () => {
    setupMasterMocks("partially_shipped", ["shipped", "shipped", "shipped"], true, "fully_shipped");

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets delivered when all items delivered", async () => {
    setupMasterMocks("fully_shipped", ["delivered", "delivered", "delivered"], true, "delivered");

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets partially_shipped for mix of shipped and delivered", async () => {
    setupMasterMocks(
      "awaiting_fulfillment",
      ["shipped", "delivered", "shipped"],
      true,
      "partially_shipped",
    );

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets partially_shipped when some cancelled and rest shipped", async () => {
    setupMasterMocks(
      "awaiting_fulfillment",
      ["cancelled", "shipped", "shipped"],
      true,
      "partially_shipped",
    );

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("sets cancelled when all items cancelled", async () => {
    setupMasterMocks(
      "awaiting_fulfillment",
      ["cancelled", "cancelled", "cancelled"],
      true,
      "cancelled",
    );

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);
    expect(mockFrom).toHaveBeenCalledTimes(5);
  });

  it("does not update when status already matches", async () => {
    setupMasterMocks("fully_shipped", ["shipped", "shipped", "shipped"], false);

    await OrderService.updateMasterOrderStatus(ORDER_ID, CHANGED_BY);

    // Only 2 from() calls — no update triggered
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});

// ── getOrderById ────────────────────────────────────────────────────

describe("OrderService.getOrderById", () => {
  function makeFullOrderRow(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      order_number: "ORD-20260216-ABC12",
      customer_id: USER_ID,
      parent_order_id: null,
      supplier_id: null,
      total_amount: "32.48",
      tax_amount: "2.48",
      shipping_address: validAddress,
      status: "pending_payment",
      payment_status: "pending",
      payment_intent_id: null,
      notes: null,
      created_at: "2026-02-16T00:00:00Z",
      updated_at: "2026-02-16T00:00:00Z",
      ...overrides,
    };
  }

  function makeDbOrderItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "oi-uuid-1",
      order_id: ORDER_ID,
      product_id: "prod-1",
      supplier_id: SUPPLIER_1,
      quantity: 2,
      unit_price: "15.00",
      subtotal: "30.00",
      fulfillment_status: "pending",
      tracking_number: null,
      carrier: null,
      products: { name: "Surgical Gloves", images: ["img/gloves.jpg"] },
      suppliers: { business_name: "MedSupply Co" },
      ...overrides,
    };
  }

  function makeHistoryRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "hist-1",
      order_id: ORDER_ID,
      from_status: "pending_payment",
      to_status: "payment_processing",
      changed_by: "user-admin-1",
      reason: "Payment initiated",
      created_at: "2026-02-16T01:00:00Z",
      ...overrides,
    };
  }

  it("returns order with items, enhanced fields, and status_history", async () => {
    const orderChain = mockQuery({ data: makeFullOrderRow() });
    const itemsChain = mockQuery({
      data: [
        makeDbOrderItem({
          tracking_number: "1Z999AA10123456784",
          carrier: "UPS",
        }),
      ],
    });
    const historyChain = mockQuery({ data: [makeHistoryRow()] });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(historyChain);

    const result = await OrderService.getOrderById(ORDER_ID, USER_ID, "customer");

    expect(result.id).toBe(ORDER_ID);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].unit_price).toBe(15.0);
    expect(result.items[0].product_name).toBe("Surgical Gloves");
    expect(result.items[0].product_image).toBe("img/gloves.jpg");
    expect(result.items[0].supplier_name).toBe("MedSupply Co");
    expect(result.items[0].tracking_number).toBe("1Z999AA10123456784");
    expect(result.items[0].carrier).toBe("UPS");
    expect(result.items[0].fulfillment_status).toBe("pending");
    expect(result.status_history).toHaveLength(1);
    expect(result.status_history![0].to_status).toBe("payment_processing");
    expect(result.total_amount).toBe(32.48);
  });

  it("allows customer to view own order", async () => {
    const orderChain = mockQuery({ data: makeFullOrderRow({ customer_id: USER_ID }) });
    const itemsChain = mockQuery({ data: [] });
    const historyChain = mockQuery({ data: [] });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(historyChain);

    const result = await OrderService.getOrderById(ORDER_ID, USER_ID, "customer");
    expect(result.id).toBe(ORDER_ID);
  });

  it("throws forbidden when customer tries to view another's order", async () => {
    const orderChain = mockQuery({ data: makeFullOrderRow({ customer_id: "other-user" }) });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(OrderService.getOrderById(ORDER_ID, USER_ID, "customer")).rejects.toThrow(
      "You can only view your own orders",
    );
  });

  it("throws notFound when order does not exist", async () => {
    const orderChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(OrderService.getOrderById(ORDER_ID, USER_ID, "customer")).rejects.toThrow(
      "Order not found",
    );
  });
});
