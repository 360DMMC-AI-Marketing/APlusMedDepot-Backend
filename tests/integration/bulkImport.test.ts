import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockImportProducts = jest.fn();

jest.mock("../../src/services/bulkImport.service", () => ({
  BulkImportService: {
    importProducts: mockImportProducts,
  },
}));

jest.mock("../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock("../../src/services/cart.service", () => ({
  CartService: {},
}));

const mockSupabaseFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const supplierUser = {
  id: "supplier-user-001",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "customer-user-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

function mockSupplierLookup(found: boolean) {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.maybeSingle = jest.fn().mockResolvedValue({
    data: found ? { id: "supplier-id-1", status: "approved" } : null,
    error: null,
  });
  mockSupabaseFrom.mockReturnValue(chain);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/suppliers/products/bulk-import", () => {
  it("returns 200 with import report for valid data", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockSupplierLookup(true);
    mockImportProducts.mockResolvedValue({
      imported: 3,
      failed: 0,
      total: 3,
      errors: [],
    });

    const res = await request(app)
      .post("/api/suppliers/products/bulk-import")
      .set("Authorization", "Bearer valid-token")
      .send({
        products: [
          {
            name: "Product 1",
            sku: "SKU-001",
            price: 10,
            stockQuantity: 5,
            category: "Wound Care",
          },
          {
            name: "Product 2",
            sku: "SKU-002",
            price: 20,
            stockQuantity: 10,
            category: "Wound Care",
          },
          {
            name: "Product 3",
            sku: "SKU-003",
            price: 30,
            stockQuantity: 15,
            category: "Wound Care",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.failed).toBe(0);
    expect(res.body.total).toBe(3);
    expect(res.body.errors).toEqual([]);
  });

  it("returns 200 with partial success for mixed valid/invalid", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockSupplierLookup(true);
    mockImportProducts.mockResolvedValue({
      imported: 1,
      failed: 1,
      total: 2,
      errors: [{ row: 2, sku: "BAD", reason: "Invalid name" }],
    });

    const res = await request(app)
      .post("/api/suppliers/products/bulk-import")
      .set("Authorization", "Bearer valid-token")
      .send({
        products: [
          {
            name: "Good Product",
            sku: "SKU-001",
            price: 10,
            stockQuantity: 5,
            category: "Wound Care",
          },
          { name: "", sku: "BAD", price: 10, stockQuantity: 5, category: "Wound Care" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
  });

  it("returns 403 for non-supplier user (customer)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/suppliers/products/bulk-import")
      .set("Authorization", "Bearer valid-token")
      .send({
        products: [
          { name: "Product", sku: "SKU-001", price: 10, stockQuantity: 5, category: "Wound Care" },
        ],
      });

    expect(res.status).toBe(403);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/suppliers/products/bulk-import")
      .send({
        products: [
          { name: "Product", sku: "SKU-001", price: 10, stockQuantity: 5, category: "Wound Care" },
        ],
      });

    expect(res.status).toBe(401);
  });

  it("returns 400 for empty products array", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockSupplierLookup(true);

    const res = await request(app)
      .post("/api/suppliers/products/bulk-import")
      .set("Authorization", "Bearer valid-token")
      .send({ products: [] });

    expect(res.status).toBe(400);
  });
});
