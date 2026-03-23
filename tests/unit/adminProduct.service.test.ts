const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    storage: {
      listBuckets: jest.fn().mockResolvedValue({ data: [], error: null }),
      createBucket: jest.fn().mockResolvedValue({ data: null, error: null }),
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: null, error: null }),
        createSignedUrl: jest
          .fn()
          .mockResolvedValue({ data: { signedUrl: "http://signed" }, error: null }),
        createSignedUrls: jest
          .fn()
          .mockResolvedValue({ data: [{ signedUrl: "http://signed" }], error: null }),
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  },
}));

jest.mock("../../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logAdminAction: jest.fn(),
}));

import { AdminProductService } from "../../src/services/adminProduct.service";
import { sendEmail } from "../../src/services/email.service";
import { logAdminAction } from "../../src/utils/securityLogger";

function mockQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
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
  chain.neq = jest.fn(self);
  chain.or = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.ilike = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ADMIN_ID = "admin-uuid-1";
const PRODUCT_ID = "prod-uuid-1";
const SUPPLIER_ID = "sup-uuid-1";

function makeProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    supplier_id: SUPPLIER_ID,
    name: "Test Product",
    sku: "TP-001",
    status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listProducts ───────────────────────────────────────────────────────

describe("AdminProductService.listProducts", () => {
  it("returns paginated results with correct mapping", async () => {
    const rows = [
      {
        id: PRODUCT_ID,
        name: "Test Product",
        sku: "TP-001",
        price: "29.99",
        stock_quantity: 100,
        category: "PPE",
        status: "active",
        supplier_id: SUPPLIER_ID,
        is_featured: false,
        created_at: "2026-01-01T00:00:00Z",
        suppliers: { business_name: "MedCo" },
      },
    ];
    const q = mockQuery({ data: rows, count: 1 });
    mockFrom.mockReturnValue(q);

    const result = await AdminProductService.listProducts();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe("Test Product");
    expect(result.data[0].price).toBe(29.99);
    expect(result.data[0].supplierName).toBe("MedCo");
    expect(result.data[0].isFeatured).toBe(false);
    expect(result.total).toBe(1);
  });

  it("applies status filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminProductService.listProducts({ status: "active" });

    expect(q.eq).toHaveBeenCalledWith("status", "active");
  });

  it("applies search across name, sku, description", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminProductService.listProducts({ search: "glove" });

    expect(q.or).toHaveBeenCalledWith(
      "name.ilike.%glove%,sku.ilike.%glove%,description.ilike.%glove%",
    );
  });

  it("applies supplierId filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminProductService.listProducts({ supplierId: SUPPLIER_ID });

    expect(q.eq).toHaveBeenCalledWith("supplier_id", SUPPLIER_ID);
  });

  it("applies category filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminProductService.listProducts({ category: "PPE" });

    expect(q.eq).toHaveBeenCalledWith("category", "PPE");
  });
});

// ── getProductDetail ───────────────────────────────────────────────────

describe("AdminProductService.getProductDetail", () => {
  it("returns product detail with supplier info and sales stats", async () => {
    const product = {
      id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      name: "Test Product",
      description: "A test product",
      sku: "TP-001",
      price: "29.99",
      stock_quantity: 100,
      category: "PPE",
      status: "active",
      images: ["img1.jpg"],
      specifications: { material: "latex" },
      weight: "0.5",
      dimensions: { length: 10, width: 5, height: 2 },
      is_deleted: false,
      is_featured: true,
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const supplier = {
      id: SUPPLIER_ID,
      business_name: "MedCo",
      status: "approved",
      commission_rate: "12.00",
    };
    const salesRows = [
      { quantity: 10, subtotal: "299.90" },
      { quantity: 5, subtotal: "149.95" },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: product });
      if (callCount === 2) return mockQuery({ data: supplier });
      return mockQuery({ data: salesRows });
    });

    const result = await AdminProductService.getProductDetail(PRODUCT_ID);

    expect(result.name).toBe("Test Product");
    expect(result.price).toBe(29.99);
    expect(result.isFeatured).toBe(true);
    expect(result.supplier.businessName).toBe("MedCo");
    expect(result.supplier.commissionRate).toBe(12);
    expect(result.salesStats.totalOrders).toBe(2);
    expect(result.salesStats.totalSold).toBe(15);
    expect(result.salesStats.totalRevenue).toBe(449.85);
  });

  it("throws 404 for non-existent product", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: null }));

    await expect(AdminProductService.getProductDetail("nonexistent")).rejects.toThrow(
      "Product not found",
    );
  });
});

// ── approve (updated to allow rejected) ────────────────────────────────

describe("AdminProductService.approve", () => {
  it("approves a pending product", async () => {
    const product = makeProductRow({ status: "pending" });
    const updated = {
      id: PRODUCT_ID,
      name: "Test Product",
      status: "active",
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: null,
    };
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({ data: updated });
    const emailQ = mockQuery({ data: { contact_email: "supplier@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      if (callCount === 2) return updateQ;
      return emailQ;
    });

    const result = await AdminProductService.approve(PRODUCT_ID, ADMIN_ID);

    expect(result.status).toBe("active");
    expect(sendEmail).toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product_approved" }),
    );
  });

  it("approves a rejected product (re-approval)", async () => {
    const product = makeProductRow({ status: "rejected" });
    const updated = {
      id: PRODUCT_ID,
      name: "Test Product",
      status: "active",
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: null,
    };
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({ data: updated });
    const emailQ = mockQuery({ data: { contact_email: "supplier@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      if (callCount === 2) return updateQ;
      return emailQ;
    });

    const result = await AdminProductService.approve(PRODUCT_ID, ADMIN_ID);

    expect(result.status).toBe("active");
  });

  it("approves a needs_revision product", async () => {
    const product = makeProductRow({ status: "needs_revision" });
    const updated = {
      id: PRODUCT_ID,
      name: "Test Product",
      status: "active",
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: null,
    };
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({ data: updated });
    const emailQ = mockQuery({ data: { contact_email: "supplier@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      if (callCount === 2) return updateQ;
      return emailQ;
    });

    const result = await AdminProductService.approve(PRODUCT_ID, ADMIN_ID);

    expect(result.status).toBe("active");
  });

  it("throws error when product is already active", async () => {
    const product = makeProductRow({ status: "active" });
    mockFrom.mockReturnValue(mockQuery({ data: product }));

    await expect(AdminProductService.approve(PRODUCT_ID, ADMIN_ID)).rejects.toThrow(
      "Cannot approve product with status 'active'",
    );
  });
});

// ── reject ─────────────────────────────────────────────────────────────

describe("AdminProductService.reject", () => {
  it("rejects a pending product with reason", async () => {
    const product = makeProductRow({ status: "pending" });
    const updated = {
      id: PRODUCT_ID,
      name: "Test Product",
      status: "rejected",
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: "Does not meet standards",
    };
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({ data: updated });
    const emailQ = mockQuery({ data: { contact_email: "supplier@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      if (callCount === 2) return updateQ;
      return emailQ;
    });

    const result = await AdminProductService.reject(
      PRODUCT_ID,
      ADMIN_ID,
      "Does not meet standards",
    );

    expect(result.status).toBe("rejected");
    expect(result.admin_feedback).toBe("Does not meet standards");
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product_rejected", reason: "Does not meet standards" }),
    );
  });
});

// ── requestChanges ─────────────────────────────────────────────────────

describe("AdminProductService.requestChanges", () => {
  it("requests changes and stores feedback", async () => {
    const product = makeProductRow({ status: "pending" });
    const updated = {
      id: PRODUCT_ID,
      name: "Test Product",
      status: "needs_revision",
      reviewed_by: ADMIN_ID,
      reviewed_at: "2026-01-01T00:00:00Z",
      admin_feedback: "Add better images",
    };
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({ data: updated });
    const emailQ = mockQuery({ data: { contact_email: "supplier@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      if (callCount === 2) return updateQ;
      return emailQ;
    });

    const result = await AdminProductService.requestChanges(
      PRODUCT_ID,
      ADMIN_ID,
      "Add better images",
    );

    expect(result.status).toBe("needs_revision");
    expect(result.admin_feedback).toBe("Add better images");
    expect(sendEmail).toHaveBeenCalled();
  });
});

// ── featureProduct ─────────────────────────────────────────────────────

describe("AdminProductService.featureProduct", () => {
  it("features an active product", async () => {
    const product = makeProductRow({ status: "active" });
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({});

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminProductService.featureProduct(PRODUCT_ID, ADMIN_ID);

    expect(updateQ.update).toHaveBeenCalledWith({ is_featured: true });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product_featured" }),
    );
  });

  it("throws conflict when product is not active", async () => {
    const product = makeProductRow({ status: "pending" });
    mockFrom.mockReturnValue(mockQuery({ data: product }));

    await expect(AdminProductService.featureProduct(PRODUCT_ID, ADMIN_ID)).rejects.toThrow(
      "Only active products can be featured",
    );
  });

  it("throws conflict when product is rejected", async () => {
    const product = makeProductRow({ status: "rejected" });
    mockFrom.mockReturnValue(mockQuery({ data: product }));

    await expect(AdminProductService.featureProduct(PRODUCT_ID, ADMIN_ID)).rejects.toThrow(
      "Only active products can be featured",
    );
  });
});

// ── unfeatureProduct ───────────────────────────────────────────────────

describe("AdminProductService.unfeatureProduct", () => {
  it("unfeatures a product", async () => {
    const product = makeProductRow({ status: "active" });
    const selectQ = mockQuery({ data: product });
    const updateQ = mockQuery({});

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminProductService.unfeatureProduct(PRODUCT_ID, ADMIN_ID);

    expect(updateQ.update).toHaveBeenCalledWith({ is_featured: false });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product_unfeatured" }),
    );
  });
});
