import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetById = jest.fn();
const mockAppendImage = jest.fn();
const mockRemoveImage = jest.fn();
const mockGetSupplierIdForUser = jest.fn();
const mockList = jest.fn();
const mockSearch = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSoftDelete = jest.fn();

jest.mock("../../src/services/product.service", () => ({
  ProductService: {
    list: mockList,
    search: mockSearch,
    getById: mockGetById,
    create: mockCreate,
    update: mockUpdate,
    softDelete: mockSoftDelete,
    getSupplierIdForUser: mockGetSupplierIdForUser,
    appendImage: mockAppendImage,
    removeImage: mockRemoveImage,
  },
}));

const mockUploadImage = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockGetSignedUrls = jest.fn();
const mockDeleteImage = jest.fn();
const mockValidateImageCount = jest.fn();
const mockEnsureBucket = jest.fn();

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {
    ensureBucket: mockEnsureBucket,
    uploadImage: mockUploadImage,
    getSignedUrl: mockGetSignedUrl,
    getSignedUrls: mockGetSignedUrls,
    deleteImage: mockDeleteImage,
    validateImageCount: mockValidateImageCount,
  },
}));

jest.mock("../../src/services/cart.service", () => ({
  CartService: {},
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

const sampleProduct = {
  id: PRODUCT_ID,
  supplierId: SUPPLIER_ID,
  name: "Surgical Gloves",
  description: "High quality surgical gloves",
  sku: "SG-001",
  price: 29.99,
  stockQuantity: 100,
  category: "Wound Care",
  status: "active",
  images: ["sup1/prod1/img1.jpg", "sup1/prod1/img2.jpg"],
  specifications: {},
  weight: 0.5,
  dimensions: null,
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  supplierName: "Medical Supply Co",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/products/:id/images", () => {
  it("uploads a valid JPEG and returns 201 with storagePath and signedUrl", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockValidateImageCount.mockResolvedValue(2);
    mockUploadImage.mockResolvedValue("sup1/prod1/12345_test.jpg");
    mockAppendImage.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue(
      "https://storage.example.com/signed/sup1/prod1/12345_test.jpg?token=abc",
    );

    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .set("Authorization", "Bearer valid-token")
      .attach("image", Buffer.from("fake-jpeg-data"), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body.storagePath).toBe("sup1/prod1/12345_test.jpg");
    expect(res.body.signedUrl).toContain("signed");
    expect(res.body.totalImages).toBe(3);
    expect(mockUploadImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      "test.jpg",
      "image/jpeg",
      PRODUCT_ID,
      SUPPLIER_ID,
    );
    expect(mockAppendImage).toHaveBeenCalledWith(PRODUCT_ID, "sup1/prod1/12345_test.jpg");
  });

  it("returns 400 for invalid file type", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);

    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .set("Authorization", "Bearer valid-token")
      .attach("image", Buffer.from("fake-gif-data"), {
        filename: "test.gif",
        contentType: "image/gif",
      });

    expect(res.status).toBe(400);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("returns 400 when file exceeds 5MB", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);

    const largeBuffer = Buffer.alloc(6 * 1024 * 1024, "x");

    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .set("Authorization", "Bearer valid-token")
      .attach("image", largeBuffer, {
        filename: "large.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(400);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("returns 403 when non-owner supplier uploads", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue("c0000000-0000-4000-8000-000000000003");

    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .set("Authorization", "Bearer valid-token")
      .attach("image", Buffer.from("fake-jpeg-data"), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(403);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("returns 400 when product already has 5 images", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockValidateImageCount.mockResolvedValue(5);

    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .set("Authorization", "Bearer valid-token")
      .attach("image", Buffer.from("fake-jpeg-data"), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Maximum 5 images per product");
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .post(`/api/products/${PRODUCT_ID}/images`)
      .attach("image", Buffer.from("fake-jpeg-data"), {
        filename: "test.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(401);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/products/:id/images/:imageIndex", () => {
  it("deletes image as owner and returns 200", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue(SUPPLIER_ID);
    mockDeleteImage.mockResolvedValue(undefined);
    mockRemoveImage.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/products/${PRODUCT_ID}/images/0`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Image deleted");
    expect(res.body.totalImages).toBe(1);
    expect(mockDeleteImage).toHaveBeenCalledWith("sup1/prod1/img1.jpg");
    expect(mockRemoveImage).toHaveBeenCalledWith(PRODUCT_ID, 0);
  });

  it("returns 403 when non-owner tries to delete", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockGetById.mockResolvedValue(sampleProduct);
    mockGetSupplierIdForUser.mockResolvedValue("c0000000-0000-4000-8000-000000000003");

    const res = await request(app)
      .delete(`/api/products/${PRODUCT_ID}/images/0`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});
