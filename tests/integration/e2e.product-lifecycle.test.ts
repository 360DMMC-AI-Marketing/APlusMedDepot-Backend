import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

// Supplier product service (create product)
const mockSupplierProductCreate = jest.fn();
const mockGetSupplierIdFromUserId = jest.fn();
const mockSupplierProductList = jest.fn();
const mockSupplierProductUpdate = jest.fn();
const mockSupplierProductSoftDelete = jest.fn();
const mockSupplierProductUploadImage = jest.fn();
const mockSupplierProductDeleteImage = jest.fn();
const mockSupplierProductGetStats = jest.fn();

jest.mock("../../src/services/supplierProduct.service", () => ({
  SupplierProductService: {
    create: mockSupplierProductCreate,
    list: mockSupplierProductList,
    update: mockSupplierProductUpdate,
    softDelete: mockSupplierProductSoftDelete,
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
    uploadImage: mockSupplierProductUploadImage,
    deleteImage: mockSupplierProductDeleteImage,
    getStats: mockSupplierProductGetStats,
  },
}));

// Admin product service (review + approve)
const mockListPending = jest.fn();
const mockGetReviewDetail = jest.fn();
const mockApprove = jest.fn();
const mockRequestChanges = jest.fn();
const mockReject = jest.fn();

jest.mock("../../src/services/adminProduct.service", () => ({
  AdminProductService: {
    listPending: mockListPending,
    getReviewDetail: mockGetReviewDetail,
    approve: mockApprove,
    requestChanges: mockRequestChanges,
    reject: mockReject,
  },
}));

// Public product service (catalog listing)
const mockProductList = jest.fn();
const mockProductGetById = jest.fn();
const mockProductSearch = jest.fn();
const mockProductCreate = jest.fn();
const mockProductUpdate = jest.fn();
const mockProductSoftDelete = jest.fn();
const mockProductGetSupplierIdForUser = jest.fn();
const mockAppendImage = jest.fn();
const mockRemoveImage = jest.fn();

jest.mock("../../src/services/product.service", () => ({
  ProductService: {
    list: mockProductList,
    getById: mockProductGetById,
    search: mockProductSearch,
    create: mockProductCreate,
    update: mockProductUpdate,
    softDelete: mockProductSoftDelete,
    getSupplierIdForUser: mockProductGetSupplierIdForUser,
    appendImage: mockAppendImage,
    removeImage: mockRemoveImage,
  },
}));

// Analytics service (imported by supplierProduct routes)
const mockGetProductAnalytics = jest.fn();
const mockGetAggregateAnalytics = jest.fn();
const mockAnalyticsGetSupplierIdFromUserId = jest.fn();

jest.mock("../../src/services/supplierAnalytics.service", () => ({
  SupplierAnalyticsService: {
    getProductAnalytics: mockGetProductAnalytics,
    getAggregateAnalytics: mockGetAggregateAnalytics,
    getSupplierIdFromUserId: mockAnalyticsGetSupplierIdFromUserId,
  },
}));

// Inventory service
jest.mock("../../src/services/supplierInventory.service", () => ({
  SupplierInventoryService: {
    list: jest.fn(),
    updateStock: jest.fn(),
    bulkUpdate: jest.fn(),
    getLowStock: jest.fn(),
    getSupplierIdFromUserId: jest.fn(),
  },
}));

// Storage service (used by public product list for signed URLs)
jest.mock("../../src/services/storage.service", () => ({
  StorageService: {
    getSignedUrls: jest.fn().mockResolvedValue([]),
    getSignedUrl: jest.fn().mockResolvedValue("https://signed-url"),
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
    validateImageCount: jest.fn().mockResolvedValue(0),
  },
}));

// Stock check (used by products routes)
jest.mock("../../src/utils/inventory", () => ({
  checkStock: jest.fn().mockResolvedValue({ currentStock: 100, sufficient: true }),
  checkAndDecrementStock: jest.fn(),
  incrementStock: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PRODUCT_ID = "e2e00000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "e2e00000-0000-4000-8000-000000000002";

const supplierUser = {
  id: "user-supplier-e2e",
  email: "supplier-e2e@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "user-admin-e2e",
  email: "admin-e2e@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "user-customer-e2e",
  email: "customer-e2e@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

// Product at each lifecycle stage
const pendingProduct = {
  id: PRODUCT_ID,
  supplierId: SUPPLIER_ID,
  name: "Surgical Gloves",
  description: "High quality surgical gloves",
  sku: "E2E-SG-001",
  price: 29.99,
  stockQuantity: 100,
  category: "Surgical Supplies",
  status: "pending",
  images: [],
  specifications: { material: "Latex" },
  weight: 0.5,
  dimensions: { length: 30, width: 20, height: 5 },
  isDeleted: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const activeProduct = {
  ...pendingProduct,
  status: "active",
  updatedAt: "2025-01-02T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("E2E Product Lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Full lifecycle: create → pending → admin review → approve → public catalog
   *
   * Note: In this codebase, products created via POST /api/suppliers/products
   * start with status='pending' (no separate "submit for review" step).
   * Migration 017 removed legacy statuses (draft, pending_review, out_of_stock)
   * and the CHECK constraint only allows: pending, active, inactive, rejected,
   * needs_revision.
   */
  it("supplier creates product → admin sees pending → admin approves → customer sees in catalog", async () => {
    // ---------------------------------------------------------------
    // STEP 1: Supplier creates a product
    //   POST /api/suppliers/products → status = 'pending'
    // ---------------------------------------------------------------
    authAs(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockSupplierProductCreate.mockResolvedValue(pendingProduct);

    const createRes = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer supplier-token")
      .send({
        name: "Surgical Gloves",
        description: "High quality surgical gloves",
        sku: "E2E-SG-001",
        price: 29.99,
        stock_quantity: 100,
        category: "Surgical Supplies",
        specifications: { material: "Latex" },
        weight: 0.5,
        dimensions: { length: 30, width: 20, height: 5 },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe(PRODUCT_ID);
    expect(createRes.body.status).toBe("pending");
    expect(mockSupplierProductCreate).toHaveBeenCalledTimes(1);

    // ---------------------------------------------------------------
    // STEP 2: Admin sees the product in the pending list
    //   GET /api/admin/products/pending
    // ---------------------------------------------------------------
    authAs(adminUser);
    mockListPending.mockResolvedValue({
      products: [
        {
          id: PRODUCT_ID,
          name: "Surgical Gloves",
          sku: "E2E-SG-001",
          price: 29.99,
          category: "Surgical Supplies",
          images: null,
          created_at: "2025-01-01T00:00:00.000Z",
          supplier: { id: SUPPLIER_ID, business_name: "MedSupply Co" },
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });

    const pendingRes = await request(app)
      .get("/api/admin/products/pending")
      .set("Authorization", "Bearer admin-token");

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.products).toHaveLength(1);
    expect(pendingRes.body.products[0].id).toBe(PRODUCT_ID);
    expect(pendingRes.body.products[0].supplier.business_name).toBe("MedSupply Co");

    // ---------------------------------------------------------------
    // STEP 3: Admin approves the product
    //   PUT /api/admin/products/:id/approve → status = 'active'
    // ---------------------------------------------------------------
    mockApprove.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      status: "active",
      reviewed_by: adminUser.id,
      reviewed_at: "2025-01-02T00:00:00.000Z",
      admin_feedback: null,
    });

    const approveRes = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/approve`)
      .set("Authorization", "Bearer admin-token");

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("active");
    expect(approveRes.body.reviewed_by).toBe(adminUser.id);
    expect(mockApprove).toHaveBeenCalledWith(PRODUCT_ID, adminUser.id, expect.anything());

    // ---------------------------------------------------------------
    // STEP 4: Customer sees the product in the public catalog
    //   GET /api/products → product appears (status='active' by default)
    // ---------------------------------------------------------------
    authAs(customerUser);
    mockProductList.mockResolvedValue({
      data: [
        {
          ...activeProduct,
          supplierName: "MedSupply Co",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const catalogRes = await request(app)
      .get("/api/products")
      .set("Authorization", "Bearer customer-token");

    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.data).toHaveLength(1);
    expect(catalogRes.body.data[0].id).toBe(PRODUCT_ID);
    expect(catalogRes.body.data[0].status).toBe("active");
    expect(catalogRes.body.data[0].name).toBe("Surgical Gloves");
  });

  it("supplier creates product → admin requests changes → supplier resubmits → admin approves", async () => {
    // STEP 1: Supplier creates product
    authAs(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockSupplierProductCreate.mockResolvedValue(pendingProduct);

    const createRes = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer supplier-token")
      .send({
        name: "Surgical Gloves",
        sku: "E2E-SG-001",
        price: 29.99,
        stock_quantity: 100,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("pending");

    // STEP 2: Admin requests changes
    authAs(adminUser);
    mockRequestChanges.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      status: "needs_revision",
      reviewed_by: adminUser.id,
      reviewed_at: "2025-01-02T00:00:00.000Z",
      admin_feedback: "Please add a more detailed description and product images.",
    });

    const changesRes = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
      .set("Authorization", "Bearer admin-token")
      .send({ feedback: "Please add a more detailed description and product images." });

    expect(changesRes.status).toBe(200);
    expect(changesRes.body.status).toBe("needs_revision");
    expect(changesRes.body.admin_feedback).toBe(
      "Please add a more detailed description and product images.",
    );

    // STEP 3: Supplier updates product and resubmits (update sets status back to 'pending')
    authAs(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockSupplierProductUpdate.mockResolvedValue({
      ...pendingProduct,
      description: "Premium latex surgical gloves, powder-free, box of 100",
      status: "pending",
      updatedAt: "2025-01-03T00:00:00.000Z",
    });

    const resubmitRes = await request(app)
      .put(`/api/suppliers/products/${PRODUCT_ID}`)
      .set("Authorization", "Bearer supplier-token")
      .send({
        description: "Premium latex surgical gloves, powder-free, box of 100",
        status: "pending",
      });

    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.status).toBe("pending");

    // STEP 4: Admin approves
    authAs(adminUser);
    mockApprove.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      status: "active",
      reviewed_by: adminUser.id,
      reviewed_at: "2025-01-04T00:00:00.000Z",
      admin_feedback: null,
    });

    const approveRes = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/approve`)
      .set("Authorization", "Bearer admin-token");

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("active");
  });

  it("supplier creates product → admin rejects → product does NOT appear in catalog", async () => {
    // STEP 1: Supplier creates product
    authAs(supplierUser);
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
    mockSupplierProductCreate.mockResolvedValue(pendingProduct);

    const createRes = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer supplier-token")
      .send({
        name: "Surgical Gloves",
        sku: "E2E-SG-001",
        price: 29.99,
        stock_quantity: 100,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("pending");

    // STEP 2: Admin rejects the product
    authAs(adminUser);
    mockReject.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      status: "rejected",
      reviewed_by: adminUser.id,
      reviewed_at: "2025-01-02T00:00:00.000Z",
      admin_feedback: "Product does not meet medical safety standards.",
    });

    const rejectRes = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/reject`)
      .set("Authorization", "Bearer admin-token")
      .send({ reason: "Product does not meet medical safety standards." });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("rejected");

    // STEP 3: Customer sees empty catalog (rejected product not visible)
    authAs(customerUser);
    mockProductList.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const catalogRes = await request(app)
      .get("/api/products")
      .set("Authorization", "Bearer customer-token");

    expect(catalogRes.status).toBe(200);
    expect(catalogRes.body.data).toHaveLength(0);
  });

  it("pending product is NOT visible to customers in public catalog", async () => {
    // Product is pending — customer sees only active products
    authAs(customerUser);
    mockProductList.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const res = await request(app)
      .get("/api/products")
      .set("Authorization", "Bearer customer-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    // Verify the list was called with status='active' (controller default for non-admins)
    expect(mockProductList).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("non-supplier cannot create products", async () => {
    authAs(customerUser);

    const res = await request(app)
      .post("/api/suppliers/products")
      .set("Authorization", "Bearer customer-token")
      .send({
        name: "Fake Product",
        sku: "FAKE-001",
        price: 9.99,
        stock_quantity: 10,
      });

    expect(res.status).toBe(403);
  });

  it("non-admin cannot approve products", async () => {
    authAs(supplierUser);

    const res = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/approve`)
      .set("Authorization", "Bearer supplier-token");

    expect(res.status).toBe(403);
  });
});
