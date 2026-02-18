import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();
const mockGetSupplierIdFromUserId = jest.fn();

jest.mock("../../src/services/supplierProduct.service", () => ({
  SupplierProductService: {
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    softDelete: mockSoftDelete,
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
  },
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

const sampleProduct = {
  id: PRODUCT_ID,
  supplierId: SUPPLIER_ID,
  name: "Surgical Gloves",
  description: "High quality surgical gloves",
  sku: "SG-001",
  price: 29.99,
  stockQuantity: 100,
  category: "Surgical Supplies",
  status: "pending",
  images: [],
  specifications: { material: "Latex" },
  weight: 0.5,
  dimensions: { length: 30, width: 20, height: 5 },
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /api/suppliers/products ────────────────────────────────────────────

describe("GET /api/suppliers/products", () => {
  it("returns 200 with paginated products for approved supplier", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockList.mockResolvedValue({
      products: [sampleProduct],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });

    const res = await request(app)
      .get("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, total_pages: 1 });
    expect(mockGetSupplierIdFromUserId).toHaveBeenCalledWith("user-supplier-1");
    expect(mockList).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("returns 200 with status filter", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockList.mockResolvedValue({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });

    const res = await request(app)
      .get("/api/suppliers/products?status=pending")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("returns 200 with search filter", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockList.mockResolvedValue({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });

    const res = await request(app)
      .get("/api/suppliers/products?search=gloves")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ search: "gloves" }),
    );
  });

  it("returns 200 with category filter", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockList.mockResolvedValue({
      products: [sampleProduct],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });

    const res = await request(app)
      .get("/api/suppliers/products?category=Surgical+Supplies")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ category: "Surgical Supplies" }),
    );
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/suppliers/products");

    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 403 when customer tries to list supplier products", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .get("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 403 when supplier is not approved", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    const err = new Error("Supplier not approved");
    Object.assign(err, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockGetSupplierIdFromUserId.mockRejectedValue(err);

    const res = await request(app)
      .get("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it("returns 404 when supplier record does not exist", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    const err = new Error("Supplier not found");
    Object.assign(err, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockGetSupplierIdFromUserId.mockRejectedValue(err);

    const res = await request(app)
      .get("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/suppliers/products ───────────────────────────────────────────

describe("POST /api/suppliers/products", () => {
  const validPayload = {
    name: "Surgical Gloves",
    sku: "SG-001",
    price: 29.99,
    stock_quantity: 100,
  };

  it("creates product and returns 201", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockCreate.mockResolvedValue(sampleProduct);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(PRODUCT_ID);
    expect(res.body.status).toBe("pending");
    expect(mockCreate).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ sku: "SG-001" }),
    );
  });

  it("returns 409 for duplicate SKU within the same supplier", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error("SKU already exists for this supplier");
    Object.assign(err, { code: "CONFLICT", statusCode: 409, name: "AppError" });
    mockCreate.mockRejectedValue(err);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(409);
  });

  it("returns 403 when supplier is not approved", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    const err = new Error("Supplier not approved");
    Object.assign(err, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockGetSupplierIdFromUserId.mockRejectedValue(err);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when customer tries to create", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid SKU format", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validPayload, sku: "INVALID SKU WITH SPACES" });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for negative price", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validPayload, price: -5 });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for negative stock_quantity", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validPayload, stock_quantity: -1 });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates product with specifications and returns 201", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const productWithSpecs = {
      ...sampleProduct,
      specifications: { material: "Latex", size: "Large" },
    };
    mockCreate.mockResolvedValue(productWithSpecs);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer valid-token")
      .send({ ...validPayload, specifications: { material: "Latex", size: "Large" } });

    expect(res.status).toBe(201);
    expect(res.body.specifications).toEqual({ material: "Latex", size: "Large" });
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/suppliers/products").send(validPayload);

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

// ─── PUT /api/suppliers/products/:id ────────────────────────────────────────

describe("PUT /api/suppliers/products/:id", () => {
  it("updates pending product (full edit) and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockUpdate.mockResolvedValue({ ...sampleProduct, name: "Updated Gloves" });

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Updated Gloves" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Gloves");
    expect(mockUpdate).toHaveBeenCalledWith(
      SUPPLIER_ID,
      PRODUCT_ID,
      expect.objectContaining({ name: "Updated Gloves" }),
    );
  });

  it("returns 400 when trying to update restricted field on active product", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error(
      "Cannot update name for active products. Active products require re-approval for content changes.",
    );
    Object.assign(err, { code: "BAD_REQUEST", statusCode: 400, name: "AppError" });
    mockUpdate.mockRejectedValue(err);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "New Name" });

    expect(res.status).toBe(400);
  });

  it("resubmits rejected product for review and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const resubmittedProduct = { ...sampleProduct, status: "pending", name: "Fixed Gloves" };
    mockUpdate.mockResolvedValue(resubmittedProduct);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Fixed Gloves" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
  });

  it("returns 403 when non-owner tries to update", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue("c0000000-0000-4000-8000-000000000003");
    const err = new Error("Not authorized to update this product");
    Object.assign(err, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockUpdate.mockRejectedValue(err);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Hijacked" });

    expect(res.status).toBe(403);
  });

  it("returns 404 when product does not exist", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error("Product not found");
    Object.assign(err, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockUpdate.mockRejectedValue(err);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ price: 19.99 });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID in path", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);

    const res = await request(app)
      .put("/api/suppliers/products/not-a-uuid")
      .set("Authorization", "Bearer valid-token")
      .send({ price: 19.99 });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 for duplicate SKU on update", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error("SKU already exists for this supplier");
    Object.assign(err, { code: "CONFLICT", statusCode: 409, name: "AppError" });
    mockUpdate.mockRejectedValue(err);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ sku: "EXISTING-SKU" });

    expect(res.status).toBe(409);
  });

  it("returns 403 when customer tries to update", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ name: "Hijacked" });

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── DELETE /api/suppliers/products/:id ─────────────────────────────────────

describe("DELETE /api/suppliers/products/:id", () => {
  it("soft deletes product and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockSoftDelete.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product deleted");
    expect(mockSoftDelete).toHaveBeenCalledWith(SUPPLIER_ID, PRODUCT_ID);
  });

  it("returns 400 when product has open orders", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error("Cannot delete product with open orders");
    Object.assign(err, { code: "BAD_REQUEST", statusCode: 400, name: "AppError" });
    mockSoftDelete.mockRejectedValue(err);

    const res = await request(app)
      .delete(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(400);
  });

  it("returns 403 when non-owner tries to delete", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue("c0000000-0000-4000-8000-000000000003");
    const err = new Error("Not authorized to delete this product");
    Object.assign(err, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockSoftDelete.mockRejectedValue(err);

    const res = await request(app)
      .delete(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when product does not exist", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    const err = new Error("Product not found");
    Object.assign(err, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockSoftDelete.mockRejectedValue(err);

    const res = await request(app)
      .delete(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid UUID in path", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);

    const res = await request(app)
      .delete("/api/suppliers/products/not-a-uuid")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(400);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("returns 403 when customer tries to delete", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .delete(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).delete(`/api/suppliers/products/${PRODUCT_ID}`);

    expect(res.status).toBe(401);
    expect(mockSoftDelete).not.toHaveBeenCalled();
  });
});
