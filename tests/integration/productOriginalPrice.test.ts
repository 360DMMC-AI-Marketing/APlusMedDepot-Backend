import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockList = jest.fn();
const mockSearch = jest.fn();
const mockGetById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();
const mockGetSupplierIdForUser = jest.fn();

jest.mock("../../src/services/product.service", () => ({
  ProductService: {
    list: mockList,
    search: mockSearch,
    getById: mockGetById,
    create: mockCreate,
    update: mockUpdate,
    softDelete: mockSoftDelete,
    getSupplierIdForUser: mockGetSupplierIdForUser,
  },
}));

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {
    getSignedUrls: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../src/services/cart.service", () => ({
  CartService: {},
}));

jest.mock("../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const PRODUCT_ID = "a0000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "b0000000-0000-4000-8000-000000000002";

const supplierUser = {
  id: "user-supplier-1",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const baseProduct = {
  id: PRODUCT_ID,
  supplierId: SUPPLIER_ID,
  name: "Test Product",
  description: "A test product",
  sku: "TEST-001",
  price: 39.99,
  originalPrice: null as number | null,
  stockQuantity: 100,
  category: "medical",
  status: "active",
  images: [],
  specifications: {},
  weight: null,
  dimensions: null,
  isDeleted: false,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  supplierName: "Test Supplier",
};

beforeEach(() => {
  jest.clearAllMocks();
});

const customerUser = {
  id: "user-customer-1",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

describe("Product originalPrice field", () => {
  describe("GET /api/products", () => {
    it("returns products with originalPrice field (null for regular products)", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockList.mockResolvedValue({
        data: [baseProduct],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const res = await request(app)
        .get("/api/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data[0].originalPrice).toBeNull();
    });

    it("returns products with originalPrice set", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockList.mockResolvedValue({
        data: [{ ...baseProduct, originalPrice: 49.99 }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const res = await request(app)
        .get("/api/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data[0].originalPrice).toBe(49.99);
      expect(res.body.data[0].price).toBe(39.99);
    });
  });

  describe("GET /api/products/:id", () => {
    it("returns product with originalPrice", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockGetById.mockResolvedValue({ ...baseProduct, originalPrice: 49.99 });

      const res = await request(app)
        .get(`/api/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.originalPrice).toBe(49.99);
    });

    it("returns product with originalPrice null", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockGetById.mockResolvedValue(baseProduct);

      const res = await request(app)
        .get(`/api/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.originalPrice).toBeNull();
    });
  });

  describe("POST /api/products", () => {
    it("creates product with originalPrice", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);
      mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
      mockCreate.mockResolvedValue({
        ...baseProduct,
        originalPrice: 49.99,
        price: 39.99,
      });

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", "Bearer valid-token")
        .send({
          name: "Test Product",
          sku: "TEST-001",
          price: 39.99,
          originalPrice: 49.99,
          stockQuantity: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.originalPrice).toBe(49.99);
      expect(res.body.price).toBe(39.99);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ originalPrice: 49.99 }),
        SUPPLIER_ID,
      );
    });

    it("creates product without originalPrice (defaults to null)", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);
      mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
      mockCreate.mockResolvedValue(baseProduct);

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", "Bearer valid-token")
        .send({
          name: "Test Product",
          sku: "TEST-001",
          price: 39.99,
          stockQuantity: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.originalPrice).toBeNull();
    });
  });

  describe("PUT /api/products/:id", () => {
    it("updates product to set originalPrice", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);
      mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
      mockUpdate.mockResolvedValue({ ...baseProduct, originalPrice: 59.99 });

      const res = await request(app)
        .put(`/api/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token")
        .send({ originalPrice: 59.99 });

      expect(res.status).toBe(200);
      expect(res.body.originalPrice).toBe(59.99);
      expect(mockUpdate).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ originalPrice: 59.99 }),
        SUPPLIER_ID,
        false,
      );
    });

    it("updates product to remove originalPrice (set to null)", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);
      mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
      mockUpdate.mockResolvedValue({ ...baseProduct, originalPrice: null });

      const res = await request(app)
        .put(`/api/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token")
        .send({ originalPrice: null });

      expect(res.status).toBe(200);
      expect(res.body.originalPrice).toBeNull();
    });
  });
});
