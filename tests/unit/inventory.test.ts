const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { checkStock, checkAndDecrementStock, incrementStock } from "../../src/utils/inventory";
import { AppError } from "../../src/utils/errors";

// Universal chain mock: thenable so `await chain.eq()` etc. all resolve.
function mockResolvedChain(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const ret = jest.fn().mockReturnValue(chain);
  chain.select = ret;
  chain.insert = ret;
  chain.update = ret;
  chain.delete = ret;
  chain.eq = ret;
  chain.in = ret;
  chain.order = ret;
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const PRODUCT_A = "prod-aaaa-0000-0000-000000000001";
const PRODUCT_B = "prod-bbbb-0000-0000-000000000002";
const PRODUCT_C = "prod-cccc-0000-0000-000000000003";

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── checkStock ───────────────────────────────────────────────────────────────

describe("checkStock", () => {
  it("returns available: true when stock exceeds requested quantity", async () => {
    const chain = mockResolvedChain({
      data: { id: PRODUCT_A, stock_quantity: 10 },
    });
    mockFrom.mockReturnValue(chain);

    const result = await checkStock(PRODUCT_A, 5);
    expect(result).toEqual({ available: true, currentStock: 10 });
  });

  it("returns available: false when stock is 0 and requesting 1", async () => {
    const chain = mockResolvedChain({
      data: { id: PRODUCT_A, stock_quantity: 0 },
    });
    mockFrom.mockReturnValue(chain);

    const result = await checkStock(PRODUCT_A, 1);
    expect(result).toEqual({ available: false, currentStock: 0 });
  });

  it("returns available: true when stock equals requested (exact match)", async () => {
    const chain = mockResolvedChain({
      data: { id: PRODUCT_A, stock_quantity: 3 },
    });
    mockFrom.mockReturnValue(chain);

    const result = await checkStock(PRODUCT_A, 3);
    expect(result).toEqual({ available: true, currentStock: 3 });
  });

  it("returns available: false when stock is less than requested", async () => {
    const chain = mockResolvedChain({
      data: { id: PRODUCT_A, stock_quantity: 3 },
    });
    mockFrom.mockReturnValue(chain);

    const result = await checkStock(PRODUCT_A, 4);
    expect(result).toEqual({ available: false, currentStock: 3 });
  });

  it("throws notFound when product does not exist", async () => {
    const chain = mockResolvedChain({
      data: null,
      error: { message: "not found" },
    });
    mockFrom.mockReturnValue(chain);

    await expect(checkStock(PRODUCT_A, 1)).rejects.toThrow(AppError);
    await expect(checkStock(PRODUCT_A, 1)).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("returns available: true when requesting 0", async () => {
    const chain = mockResolvedChain({
      data: { id: PRODUCT_A, stock_quantity: 5 },
    });
    mockFrom.mockReturnValue(chain);

    const result = await checkStock(PRODUCT_A, 0);
    expect(result).toEqual({ available: true, currentStock: 5 });
  });

  it("throws badRequest when requesting negative quantity", async () => {
    await expect(checkStock(PRODUCT_A, -1)).rejects.toThrow(AppError);
    await expect(checkStock(PRODUCT_A, -1)).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
    // Should not have called DB
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── checkAndDecrementStock ───────────────────────────────────────────────────

describe("checkAndDecrementStock", () => {
  const makeClient = () => {
    const mockClientFrom = jest.fn();
    const mockClientRpc = jest.fn();
    return {
      client: { from: mockClientFrom, rpc: mockClientRpc } as unknown as Parameters<
        typeof checkAndDecrementStock
      >[1],
      mockClientFrom,
      mockClientRpc,
    };
  };

  it("decrements single item with sufficient stock", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [{ id: PRODUCT_A, stock_quantity: 10 }],
      error: null,
    });

    const updateChain = mockResolvedChain({ data: null, error: null });
    mockClientFrom.mockReturnValue(updateChain);

    const result = await checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 3 }], client);

    expect(result).toEqual({
      success: true,
      decremented: [{ productId: PRODUCT_A, oldStock: 10, newStock: 7 }],
    });
    expect(mockClientFrom).toHaveBeenCalledWith("products");
  });

  it("decrements 3 items all with sufficient stock", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [
        { id: PRODUCT_A, stock_quantity: 10 },
        { id: PRODUCT_B, stock_quantity: 20 },
        { id: PRODUCT_C, stock_quantity: 5 },
      ],
      error: null,
    });

    const updateChain = mockResolvedChain({ data: null, error: null });
    mockClientFrom.mockReturnValue(updateChain);

    const result = await checkAndDecrementStock(
      [
        { productId: PRODUCT_A, quantity: 2 },
        { productId: PRODUCT_B, quantity: 5 },
        { productId: PRODUCT_C, quantity: 3 },
      ],
      client,
    );

    expect(result.success).toBe(true);
    expect(result.decremented).toEqual([
      { productId: PRODUCT_A, oldStock: 10, newStock: 8 },
      { productId: PRODUCT_B, oldStock: 20, newStock: 15 },
      { productId: PRODUCT_C, oldStock: 5, newStock: 2 },
    ]);
    // 3 update calls
    expect(mockClientFrom).toHaveBeenCalledTimes(3);
  });

  it("throws badRequest and decrements NONE when item 2 of 3 has insufficient stock", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [
        { id: PRODUCT_A, stock_quantity: 10 },
        { id: PRODUCT_B, stock_quantity: 2 },
        { id: PRODUCT_C, stock_quantity: 5 },
      ],
      error: null,
    });

    await expect(
      checkAndDecrementStock(
        [
          { productId: PRODUCT_A, quantity: 3 },
          { productId: PRODUCT_B, quantity: 5 },
          { productId: PRODUCT_C, quantity: 1 },
        ],
        client,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });

    // No updates should have been called
    expect(mockClientFrom).not.toHaveBeenCalled();
  });

  it("succeeds with exact match (stock=3, request=3) → decremented to 0", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [{ id: PRODUCT_A, stock_quantity: 3 }],
      error: null,
    });

    const updateChain = mockResolvedChain({ data: null, error: null });
    mockClientFrom.mockReturnValue(updateChain);

    const result = await checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 3 }], client);

    expect(result.decremented[0]).toEqual({
      productId: PRODUCT_A,
      oldStock: 3,
      newStock: 0,
    });
  });

  it("throws badRequest with failed item details when would go negative", async () => {
    const { client, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [{ id: PRODUCT_A, stock_quantity: 2 }],
      error: null,
    });

    try {
      await checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 5 }], client);
      fail("Should have thrown");
    } catch (err) {
      const appErr = err as AppError & { details: unknown };
      expect(appErr.statusCode).toBe(400);
      expect(appErr.details).toEqual([{ productId: PRODUCT_A, requested: 5, available: 2 }]);
    }
  });

  it("returns success no-op for empty items array", async () => {
    const { client } = makeClient();

    const result = await checkAndDecrementStock([], client);

    expect(result).toEqual({ success: true, decremented: [] });
  });

  it("throws notFound when a product is not in the lock result", async () => {
    const { client, mockClientRpc } = makeClient();

    // RPC returns empty — product not found
    mockClientRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 1 }], client),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
});

// ─── incrementStock ───────────────────────────────────────────────────────────

describe("incrementStock", () => {
  const makeClient = () => {
    const mockClientFrom = jest.fn();
    const mockClientRpc = jest.fn();
    return {
      client: { from: mockClientFrom, rpc: mockClientRpc } as unknown as Parameters<
        typeof incrementStock
      >[1],
      mockClientFrom,
      mockClientRpc,
    };
  };

  it("increments single item stock correctly", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [{ id: PRODUCT_A, stock_quantity: 5 }],
      error: null,
    });

    const updateChain = mockResolvedChain({ data: null, error: null });
    mockClientFrom.mockReturnValue(updateChain);

    await incrementStock([{ productId: PRODUCT_A, quantity: 3 }], client);

    expect(mockClientFrom).toHaveBeenCalledWith("products");
    // Verify update was called with stock_quantity: 8 (5 + 3)
    expect(updateChain.update).toHaveBeenCalledWith({ stock_quantity: 8 });
  });

  it("increments multiple items correctly", async () => {
    const { client, mockClientFrom, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [
        { id: PRODUCT_A, stock_quantity: 0 },
        { id: PRODUCT_B, stock_quantity: 10 },
      ],
      error: null,
    });

    const updateChain = mockResolvedChain({ data: null, error: null });
    mockClientFrom.mockReturnValue(updateChain);

    await incrementStock(
      [
        { productId: PRODUCT_A, quantity: 5 },
        { productId: PRODUCT_B, quantity: 2 },
      ],
      client,
    );

    expect(mockClientFrom).toHaveBeenCalledTimes(2);
  });

  it("throws notFound when product does not exist", async () => {
    const { client, mockClientRpc } = makeClient();

    mockClientRpc.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      incrementStock([{ productId: PRODUCT_A, quantity: 1 }], client),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });

  it("throws badRequest for negative quantity", async () => {
    const { client } = makeClient();

    await expect(
      incrementStock([{ productId: PRODUCT_A, quantity: -1 }], client),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  });

  it("no-ops for empty items array", async () => {
    const { client, mockClientRpc } = makeClient();

    await incrementStock([], client);

    expect(mockClientRpc).not.toHaveBeenCalled();
  });
});

// ─── Concurrency tests ───────────────────────────────────────────────────────

describe("checkAndDecrementStock — concurrency", () => {
  // These tests simulate the FOR UPDATE serialization guarantee.
  // In the real DB, FOR UPDATE locks rows so transactions run serially.
  // The mock simulates this: the update atomically checks and modifies
  // shared stock, rejecting writes when stock is exhausted.

  const makeConcurrencyClient = (sharedStock: { value: number }) => {
    const mockClientFrom = jest.fn();
    const mockClientRpc = jest.fn().mockImplementation(async () => {
      return { data: [{ id: PRODUCT_A, stock_quantity: sharedStock.value }], error: null };
    });

    mockClientFrom.mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {};
      const ret = jest.fn().mockReturnValue(chain);
      chain.update = jest.fn().mockImplementation(() => {
        // Atomically decrement shared stock, simulating DB constraint
        if (sharedStock.value <= 0) {
          return {
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Insufficient stock" },
            }),
          };
        }
        sharedStock.value -= 1;
        return {
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      });
      chain.eq = ret;
      return chain;
    });

    return {
      from: mockClientFrom,
      rpc: mockClientRpc,
    } as unknown as Parameters<typeof checkAndDecrementStock>[1];
  };

  it("exactly 1 of 2 simultaneous requests succeeds when stock=1", async () => {
    const sharedStock = { value: 1 };
    const client1 = makeConcurrencyClient(sharedStock);
    const client2 = makeConcurrencyClient(sharedStock);

    const results = await Promise.allSettled([
      checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 1 }], client1),
      checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 1 }], client2),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(sharedStock.value).toBe(0);
  });

  it("exactly 5 of 10 simultaneous requests succeed when stock=5", async () => {
    const sharedStock = { value: 5 };
    const clients = Array.from({ length: 10 }, () => makeConcurrencyClient(sharedStock));

    const results = await Promise.allSettled(
      clients.map((c) => checkAndDecrementStock([{ productId: PRODUCT_A, quantity: 1 }], c)),
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(5);
    expect(failures.length).toBe(5);
    expect(sharedStock.value).toBe(0);
  });
});
