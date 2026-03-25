const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { BulkImportService } from "../../src/services/bulkImport.service";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.in = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const SUPPLIER_ID = "supplier-uuid-1";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Product",
    description: "A test product description",
    sku: "TEST-001",
    price: 29.99,
    stockQuantity: 50,
    category: "Wound Care",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("BulkImportService.importProducts", () => {
  it("imports 3 valid products", async () => {
    // Mock: no existing SKUs
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [
      makeProduct({ sku: "P-001" }),
      makeProduct({ sku: "P-002", name: "Product 2" }),
      makeProduct({ sku: "P-003", name: "Product 3" }),
    ];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("reports invalid product (missing name)", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [
      makeProduct({ sku: "P-001" }),
      makeProduct({ sku: "P-002", name: "" }),
      makeProduct({ sku: "P-003", name: "Product 3" }),
    ];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].sku).toBe("P-002");
  });

  it("reports invalid product (negative price)", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [makeProduct({ sku: "P-001" }), makeProduct({ sku: "P-002", price: -5 })];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].sku).toBe("P-002");
  });

  it("reports duplicate SKU in batch", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [
      makeProduct({ sku: "P-001" }),
      makeProduct({ sku: "P-001", name: "Duplicate" }),
      makeProduct({ sku: "P-002" }),
    ];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors[0].reason).toBe("Duplicate SKU in batch");
    expect(result.errors[0].row).toBe(2);
  });

  it("reports existing SKU in DB", async () => {
    const selectQ = mockQuery({ data: [{ sku: "P-001" }] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [
      makeProduct({ sku: "P-001" }),
      makeProduct({ sku: "P-002", name: "New Product" }),
    ];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0].reason).toContain("already exists");
    expect(result.errors[0].sku).toBe("P-001");
  });

  it("sets status to pending for all imported products", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [makeProduct({ sku: "P-001" })];

    await BulkImportService.importProducts(SUPPLIER_ID, products);

    // Check that insert was called with status: 'pending'
    expect(insertQ.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: "pending" })]),
    );
  });

  it("sets supplier_id correctly on all imported products", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ data: null, error: null });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [makeProduct({ sku: "P-001" })];

    await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(insertQ.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ supplier_id: SUPPLIER_ID })]),
    );
  });

  it("throws VALIDATION_ERROR for empty array", async () => {
    await expect(BulkImportService.importProducts(SUPPLIER_ID, [])).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("throws VALIDATION_ERROR for more than 100 products", async () => {
    const products = Array.from({ length: 101 }, (_, i) =>
      makeProduct({ sku: `P-${String(i).padStart(3, "0")}` }),
    );

    await expect(BulkImportService.importProducts(SUPPLIER_ID, products)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("reports all products as errors on DB insert failure", async () => {
    const selectQ = mockQuery({ data: [] });
    const insertQ = mockQuery({ error: { message: "constraint violation" } });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return insertQ;
    });

    const products = [
      makeProduct({ sku: "P-001" }),
      makeProduct({ sku: "P-002", name: "Product 2" }),
    ];

    const result = await BulkImportService.importProducts(SUPPLIER_ID, products);

    expect(result.imported).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].reason).toBe("Database insert failed");
  });
});
