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

const mockCheckStock = jest.fn();

jest.mock("../../src/utils/inventory", () => ({
  checkStock: mockCheckStock,
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

const customerUser = {
  id: "user-customer-1",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: "Acme",
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "user-admin-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const sampleProduct = {
  id: PRODUCT_ID,
  supplierId: SUPPLIER_ID,
  name: "Surgical Gloves",
  description: "High quality surgical gloves",
  sku: "SG-001",
  price: 29.99,
  stockQuantity: 100,
  category: "Surgical Supplies",
  status: "active",
  images: ["https://example.com/img1.jpg"],
  specifications: { material: "Latex", size: "Medium" },
  weight: 0.5,
  dimensions: { length: 30, width: 20, height: 5 },
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  supplierName: "Medical Supply Co",
};

const paginatedResponse = {
  data: [sampleProduct],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

const emptyPaginatedResponse = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/products", () => {
  it("returns 200 with paginated products", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockList.mockResolvedValue(paginatedResponse);

    const res = await request(app).get("/api/products").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("returns 200 with search filter", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockList.mockResolvedValue(emptyPaginatedResponse);

    const res = await request(app)
      .get("/api/products?search=bandage")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ search: "bandage" }));
  });

  it("returns 200 filtered by category", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockList.mockResolvedValue(paginatedResponse);

    const res = await request(app)
      .get("/api/products?category=Surgical+Supplies")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Surgical Supplies" }),
    );
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe("GET /api/products/search", () => {
  it("returns 200 with full-text search results", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockSearch.mockResolvedValue(paginatedResponse);

    const res = await request(app)
      .get("/api/products/search?q=surgical")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ q: "surgical" }));
  });
});

describe("GET /api/products/:id", () => {
  it("returns 200 for existing product", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetById.mockResolvedValue(sampleProduct);

    const res = await request(app)
      .get(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PRODUCT_ID);
    expect(res.body.name).toBe("Surgical Gloves");
  });

  it("returns 404 for non-existent product", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/products", () => {
  const validPayload = {
    name: "Surgical Gloves",
    sku: "SG-001",
    price: 29.99,
    stockQuantity: 100,
  };

  it("creates product as supplier and returns 201", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockCreate.mockResolvedValue(sampleProduct);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockGetSupplierIdForUser).toHaveBeenCalledWith("user-supplier-1");
  });

  it("returns 403 when customer tries to create", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 409 for duplicate SKU", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    const dupError = new Error("SKU already exists");
    Object.assign(dupError, { code: "CONFLICT", statusCode: 409, name: "AppError" });
    mockCreate.mockRejectedValue(dupError);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(409);
  });

  it("returns 400 when more than 5 images are provided", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer valid-token")
      .send({
        ...validPayload,
        images: [
          "https://example.com/1.jpg",
          "https://example.com/2.jpg",
          "https://example.com/3.jpg",
          "https://example.com/4.jpg",
          "https://example.com/5.jpg",
          "https://example.com/6.jpg",
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates product with specifications and returns 201", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    const productWithSpecs = {
      ...sampleProduct,
      specifications: { material: "Latex", size: "Large" },
    };
    mockCreate.mockResolvedValue(productWithSpecs);

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", "Bearer valid-token")
      .send({
        ...validPayload,
        specifications: { material: "Latex", size: "Large" },
      });

    expect(res.status).toBe(201);
    expect(res.body.specifications).toEqual({ material: "Latex", size: "Large" });
  });
});

describe("PUT /api/products/:id", () => {
  it("updates product as owner and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockUpdate.mockResolvedValue({ ...sampleProduct, name: "Updated Gloves" });

    const res = await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Updated Gloves" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Gloves");
  });

  it("returns 403 when non-owner supplier updates", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue("c0000000-0000-4000-8000-000000000003");
    const forbiddenError = new Error("Not authorized to update this product");
    Object.assign(forbiddenError, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockUpdate.mockRejectedValue(forbiddenError);

    const res = await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Hijacked" });

    expect(res.status).toBe(403);
  });

  it("updates product as admin and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockUpdate.mockResolvedValue({ ...sampleProduct, name: "Admin Updated" });

    const res = await request(app)
      .put(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Admin Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Admin Updated");
    expect(mockGetSupplierIdForUser).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/products/:id", () => {
  it("soft deletes product as owner and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockSoftDelete.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product deleted");
    expect(mockSoftDelete).toHaveBeenCalledWith(PRODUCT_ID, SUPPLIER_ID, false);
  });

  it("returns 403 when non-owner tries to delete", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdForUser.mockResolvedValue("c0000000-0000-4000-8000-000000000003");
    const forbiddenError = new Error("Not authorized to delete this product");
    Object.assign(forbiddenError, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockSoftDelete.mockRejectedValue(forbiddenError);

    const res = await request(app)
      .delete(`/api/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });
});

describe("GET /api/products/:id/stock", () => {
  it("returns 200 with stock info and in_stock: true", async () => {
    mockCheckStock.mockResolvedValue({ available: true, currentStock: 50 });

    const res = await request(app).get(`/api/products/${PRODUCT_ID}/stock`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      product_id: PRODUCT_ID,
      stock_quantity: 50,
      in_stock: true,
    });
    expect(mockCheckStock).toHaveBeenCalledWith(PRODUCT_ID, 0);
  });

  it("returns 200 with in_stock: false when stock is 0", async () => {
    mockCheckStock.mockResolvedValue({ available: true, currentStock: 0 });

    const res = await request(app).get(`/api/products/${PRODUCT_ID}/stock`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      product_id: PRODUCT_ID,
      stock_quantity: 0,
      in_stock: false,
    });
  });

  it("returns 404 when product not found", async () => {
    const notFoundErr = new Error("Product not found");
    Object.assign(notFoundErr, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockCheckStock.mockRejectedValue(notFoundErr);

    const res = await request(app).get(`/api/products/${PRODUCT_ID}/stock`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid UUID", async () => {
    const res = await request(app).get("/api/products/not-a-uuid/stock");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockCheckStock).not.toHaveBeenCalled();
  });
});
