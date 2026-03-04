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

const mockListPending = jest.fn();
const mockGetReviewDetail = jest.fn();
const mockApprove = jest.fn();
const mockRequestChanges = jest.fn();
const mockReject = jest.fn();
const mockListProducts = jest.fn();
const mockGetProductDetail = jest.fn();
const mockFeatureProduct = jest.fn();
const mockUnfeatureProduct = jest.fn();

jest.mock("../../src/services/adminProduct.service", () => ({
  AdminProductService: {
    listPending: mockListPending,
    getReviewDetail: mockGetReviewDetail,
    approve: mockApprove,
    requestChanges: mockRequestChanges,
    reject: mockReject,
    listProducts: mockListProducts,
    getProductDetail: mockGetProductDetail,
    featureProduct: mockFeatureProduct,
    unfeatureProduct: mockUnfeatureProduct,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PRODUCT_ID = "a0000000-0000-4000-8000-000000000001";
const PRODUCT_ID_2 = "a0000000-0000-4000-8000-000000000002";
const ADMIN_USER_ID = "admin-user-001";
const SUPPLIER_ID = "b0000000-0000-4000-8000-000000000001";

const adminUser = {
  id: ADMIN_USER_ID,
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

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

const pendingListResponse = {
  products: [
    {
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      sku: "SG-001",
      price: 9.99,
      category: "PPE",
      images: null,
      created_at: "2025-01-01T00:00:00.000Z",
      supplier: { id: SUPPLIER_ID, business_name: "MedSupply Co" },
    },
    {
      id: PRODUCT_ID_2,
      name: "Face Masks",
      sku: "FM-001",
      price: 14.99,
      category: "PPE",
      images: null,
      created_at: "2025-01-02T00:00:00.000Z",
      supplier: { id: SUPPLIER_ID, business_name: "MedSupply Co" },
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, total_pages: 1 },
};

const reviewDetail = {
  id: PRODUCT_ID,
  supplier_id: SUPPLIER_ID,
  name: "Surgical Gloves",
  description: "High quality surgical gloves",
  sku: "SG-001",
  price: 9.99,
  stock_quantity: 100,
  category: "PPE",
  status: "pending",
  images: null,
  specifications: null,
  weight: null,
  dimensions: null,
  reviewed_by: null,
  reviewed_at: null,
  admin_feedback: null,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
  supplier: {
    id: SUPPLIER_ID,
    business_name: "MedSupply Co",
    contact_email: "contact@medsupply.com",
  },
  review_history: [],
};

const approvedProduct = {
  id: PRODUCT_ID,
  name: "Surgical Gloves",
  status: "active",
  reviewed_by: ADMIN_USER_ID,
  reviewed_at: "2025-01-05T00:00:00.000Z",
  admin_feedback: null,
};

const changesRequestedProduct = {
  id: PRODUCT_ID,
  name: "Surgical Gloves",
  status: "needs_revision",
  reviewed_by: ADMIN_USER_ID,
  reviewed_at: "2025-01-05T00:00:00.000Z",
  admin_feedback: "Please add clearer product images and update the description.",
};

const rejectedProduct = {
  id: PRODUCT_ID,
  name: "Surgical Gloves",
  status: "rejected",
  reviewed_by: ADMIN_USER_ID,
  reviewed_at: "2025-01-05T00:00:00.000Z",
  admin_feedback: "This product does not meet our quality standards for medical supplies.",
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
describe("Admin Product Approval API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Auth / RBAC
  // =========================================================================
  describe("Auth & RBAC", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/admin/products/pending");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when a supplier tries to access admin routes", async () => {
      authAs(supplierUser);
      const res = await request(app)
        .get("/api/admin/products/pending")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when a customer tries to access admin routes", async () => {
      authAs(customerUser);
      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // GET /api/admin/products/pending
  // =========================================================================
  describe("GET /pending", () => {
    it("returns paginated list of pending products with supplier names", async () => {
      authAs(adminUser);
      mockListPending.mockResolvedValue(pendingListResponse);

      const res = await request(app)
        .get("/api/admin/products/pending")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.products[0].supplier.business_name).toBe("MedSupply Co");
      expect(res.body.pagination.total).toBe(2);
      expect(mockListPending).toHaveBeenCalledWith(1, 20);
    });

    it("passes custom pagination params", async () => {
      authAs(adminUser);
      mockListPending.mockResolvedValue({
        products: [],
        pagination: { page: 2, limit: 5, total: 10, total_pages: 2 },
      });

      const res = await request(app)
        .get("/api/admin/products/pending?page=2&limit=5")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockListPending).toHaveBeenCalledWith(2, 5);
    });

    it("returns empty list when no pending products exist", async () => {
      authAs(adminUser);
      mockListPending.mockResolvedValue({
        products: [],
        pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
      });

      const res = await request(app)
        .get("/api/admin/products/pending")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/admin/products/:id/review
  // =========================================================================
  describe("GET /:id/review", () => {
    it("returns full product detail with supplier info", async () => {
      authAs(adminUser);
      mockGetReviewDetail.mockResolvedValue(reviewDetail);

      const res = await request(app)
        .get(`/api/admin/products/${PRODUCT_ID}/review`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(PRODUCT_ID);
      expect(res.body.supplier.business_name).toBe("MedSupply Co");
      expect(res.body.supplier.contact_email).toBe("contact@medsupply.com");
      expect(res.body.review_history).toEqual([]);
      expect(mockGetReviewDetail).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockGetReviewDetail.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .get(`/api/admin/products/${PRODUCT_ID}/review`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID format", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/products/not-a-uuid/review")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/products/:id/approve
  // =========================================================================
  describe("PUT /:id/approve", () => {
    it("approves a pending product and returns updated status", async () => {
      authAs(adminUser);
      mockApprove.mockResolvedValue(approvedProduct);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("active");
      expect(res.body.reviewed_by).toBe(ADMIN_USER_ID);
      expect(res.body.reviewed_at).toBeDefined();
      expect(res.body.admin_feedback).toBeNull();
      expect(mockApprove).toHaveBeenCalledWith(PRODUCT_ID, ADMIN_USER_ID);
    });

    it("returns 400 when product is not in pending status", async () => {
      authAs(adminUser);
      mockApprove.mockRejectedValue(
        new AppError(
          "Cannot approve product with status 'active'. Only pending products can be approved.",
          400,
          "BAD_REQUEST",
        ),
      );

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockApprove.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/admin/products/:id/request-changes
  // =========================================================================
  describe("PUT /:id/request-changes", () => {
    it("requests changes with valid feedback", async () => {
      authAs(adminUser);
      mockRequestChanges.mockResolvedValue(changesRequestedProduct);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "Please add clearer product images and update the description." });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("needs_revision");
      expect(res.body.reviewed_by).toBe(ADMIN_USER_ID);
      expect(res.body.admin_feedback).toBe(
        "Please add clearer product images and update the description.",
      );
      expect(mockRequestChanges).toHaveBeenCalledWith(
        PRODUCT_ID,
        ADMIN_USER_ID,
        "Please add clearer product images and update the description.",
      );
    });

    it("returns 400 when feedback is missing", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 400 when feedback is too short (< 10 chars)", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "Too short" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when product is not in pending status", async () => {
      authAs(adminUser);
      mockRequestChanges.mockRejectedValue(
        new AppError(
          "Cannot request changes for product with status 'active'.",
          400,
          "BAD_REQUEST",
        ),
      );

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "This feedback is long enough to pass validation." });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockRequestChanges.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "This feedback is long enough to pass validation." });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/admin/products/:id/reject
  // =========================================================================
  describe("PUT /:id/reject", () => {
    it("rejects a pending product with valid reason", async () => {
      authAs(adminUser);
      mockReject.mockResolvedValue(rejectedProduct);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "This product does not meet our quality standards for medical supplies." });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("rejected");
      expect(res.body.reviewed_by).toBe(ADMIN_USER_ID);
      expect(res.body.admin_feedback).toBe(
        "This product does not meet our quality standards for medical supplies.",
      );
      expect(mockReject).toHaveBeenCalledWith(
        PRODUCT_ID,
        ADMIN_USER_ID,
        "This product does not meet our quality standards for medical supplies.",
      );
    });

    it("returns 400 when reason is missing", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 400 when reason is too short (< 10 chars)", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Bad prod" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when product is not in pending status", async () => {
      authAs(adminUser);
      mockReject.mockRejectedValue(
        new AppError("Cannot reject product with status 'active'.", 400, "BAD_REQUEST"),
      );

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "This product does not meet quality standards." });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockReject.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "This product does not meet quality standards." });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Resubmission flow
  // =========================================================================
  describe("Resubmission flow", () => {
    it("product can be approved after being resubmitted (pending again)", async () => {
      authAs(adminUser);

      // Step 1: Admin requests changes
      mockRequestChanges.mockResolvedValue(changesRequestedProduct);

      const res1 = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "Please add clearer product images and update the description." });

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe("needs_revision");

      // Step 2: Supplier resubmits (out of scope — just simulate product is pending again)
      // Step 3: Admin approves the resubmitted product
      mockApprove.mockResolvedValue({
        ...approvedProduct,
        reviewed_at: "2025-01-10T00:00:00.000Z",
      });

      const res2 = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe("active");
      expect(mockApprove).toHaveBeenCalledWith(PRODUCT_ID, ADMIN_USER_ID);
    });
  });

  // =========================================================================
  // GET /api/admin/products  (list all products)
  // =========================================================================
  describe("GET / (list all products)", () => {
    it("returns paginated product list", async () => {
      authAs(adminUser);
      mockListProducts.mockResolvedValue({
        data: [
          {
            id: PRODUCT_ID,
            name: "Surgical Gloves",
            sku: "SG-001",
            price: 9.99,
            stockQuantity: 100,
            category: "PPE",
            status: "active",
            supplierName: "MedSupply Co",
            supplierId: SUPPLIER_ID,
            isFeatured: false,
            createdAt: "2025-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app)
        .get("/api/admin/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe("Surgical Gloves");
      expect(res.body.total).toBe(1);
    });

    it("passes filter params to service", async () => {
      authAs(adminUser);
      mockListProducts.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await request(app)
        .get("/api/admin/products?status=pending&category=PPE&search=glove&page=2&limit=10")
        .set("Authorization", "Bearer valid-token");

      expect(mockListProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "pending",
          category: "PPE",
          search: "glove",
          page: 2,
          limit: 10,
        }),
      );
    });

    it("returns 400 for invalid status filter", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/products?status=invalid_status")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });

    it("returns 403 for non-admin user", async () => {
      authAs(supplierUser);

      const res = await request(app)
        .get("/api/admin/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/admin/products/:id  (product detail)
  // =========================================================================
  describe("GET /:id (product detail)", () => {
    const productDetail = {
      id: PRODUCT_ID,
      name: "Surgical Gloves",
      description: "High quality surgical gloves",
      sku: "SG-001",
      price: 9.99,
      stockQuantity: 100,
      category: "PPE",
      status: "active",
      images: null,
      specifications: null,
      weight: null,
      dimensions: null,
      isFeatured: true,
      isDeleted: false,
      reviewedBy: ADMIN_USER_ID,
      reviewedAt: "2025-01-05T00:00:00Z",
      adminFeedback: null,
      supplier: {
        id: SUPPLIER_ID,
        businessName: "MedSupply Co",
        status: "approved",
        commissionRate: 15,
      },
      salesStats: {
        totalOrders: 5,
        totalSold: 50,
        totalRevenue: 499.5,
      },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-05T00:00:00Z",
    };

    it("returns full product detail with supplier info and sales stats", async () => {
      authAs(adminUser);
      mockGetProductDetail.mockResolvedValue(productDetail);

      const res = await request(app)
        .get(`/api/admin/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(PRODUCT_ID);
      expect(res.body.supplier.businessName).toBe("MedSupply Co");
      expect(res.body.salesStats.totalOrders).toBe(5);
      expect(res.body.salesStats.totalRevenue).toBe(499.5);
      expect(res.body.isFeatured).toBe(true);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockGetProductDetail.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .get(`/api/admin/products/${PRODUCT_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/products/not-a-uuid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/products/:id/feature
  // =========================================================================
  describe("PUT /:id/feature", () => {
    it("features an active product", async () => {
      authAs(adminUser);
      mockFeatureProduct.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/feature`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Product featured successfully");
      expect(mockFeatureProduct).toHaveBeenCalledWith(PRODUCT_ID, ADMIN_USER_ID);
    });

    it("returns 409 when product is not active", async () => {
      authAs(adminUser);
      mockFeatureProduct.mockRejectedValue(
        new AppError("Only active products can be featured", 409, "CONFLICT"),
      );

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/feature`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(409);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockFeatureProduct.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/feature`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put("/api/admin/products/not-a-uuid/feature")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/products/:id/unfeature
  // =========================================================================
  describe("PUT /:id/unfeature", () => {
    it("unfeatures a product", async () => {
      authAs(adminUser);
      mockUnfeatureProduct.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/unfeature`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Product unfeatured successfully");
      expect(mockUnfeatureProduct).toHaveBeenCalledWith(PRODUCT_ID, ADMIN_USER_ID);
    });

    it("returns 404 for non-existent product", async () => {
      authAs(adminUser);
      mockUnfeatureProduct.mockRejectedValue(new AppError("Product not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/unfeature`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Full lifecycle: pending → needs_revision → re-approve → featured
  // =========================================================================
  describe("Full lifecycle: pending → needs_revision → approved → featured", () => {
    it("completes the full product lifecycle", async () => {
      authAs(adminUser);

      // Step 1: Request changes on pending product
      mockRequestChanges.mockResolvedValue(changesRequestedProduct);
      const res1 = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/request-changes`)
        .set("Authorization", "Bearer valid-token")
        .send({ feedback: "Please add clearer product images and update the description." });
      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe("needs_revision");

      // Step 2: Approve the revised product (re-approval)
      mockApprove.mockResolvedValue({
        ...approvedProduct,
        reviewed_at: "2025-01-10T00:00:00.000Z",
      });
      const res2 = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/approve`)
        .set("Authorization", "Bearer valid-token");
      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe("active");

      // Step 3: Feature the approved product
      mockFeatureProduct.mockResolvedValue(undefined);
      const res3 = await request(app)
        .put(`/api/admin/products/${PRODUCT_ID}/feature`)
        .set("Authorization", "Bearer valid-token");
      expect(res3.status).toBe(200);
      expect(res3.body.message).toBe("Product featured successfully");
    });
  });
});
