import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

jest.mock("../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {},
}));

const mockGetCart = jest.fn();
const mockAddItemToCart = jest.fn();
const mockUpdateCartItem = jest.fn();
const mockRemoveCartItem = jest.fn();
const mockClearCart = jest.fn();
const mockValidateCartItems = jest.fn();
const mockRefreshCart = jest.fn();

jest.mock("../../src/services/cart.service", () => ({
  CartService: {
    getCart: mockGetCart,
    getOrCreateCart: jest.fn(),
    addItemToCart: mockAddItemToCart,
    updateCartItem: mockUpdateCartItem,
    removeCartItem: mockRemoveCartItem,
    clearCart: mockClearCart,
    calculateCartTotals: jest.fn(),
    validateCartItems: mockValidateCartItems,
    refreshCart: mockRefreshCart,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const PRODUCT_ID = "a0000000-0000-4000-8000-000000000001";
const CART_ID = "c0000000-0000-4000-8000-000000000001";
const ITEM_ID = "d0000000-0000-4000-8000-000000000001";

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

const sampleCartItem = {
  id: ITEM_ID,
  productId: PRODUCT_ID,
  productName: "Surgical Gloves",
  productImage: "img1.jpg",
  supplierId: "supplier-uuid-1",
  quantity: 2,
  unitPrice: 29.99,
  subtotal: 59.98,
};

const sampleCart = {
  id: CART_ID,
  customerId: customerUser.id,
  items: [sampleCartItem],
  subtotal: 59.98,
  taxRate: 0.0825,
  taxAmount: 4.95,
  total: 64.93,
  itemCount: 2,
};

const emptyCart = {
  id: "",
  customerId: customerUser.id,
  items: [],
  subtotal: 0,
  taxRate: 0.0825,
  taxAmount: 0,
  total: 0,
  itemCount: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/cart", () => {
  it("returns 200 with cart and correct totals", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetCart.mockResolvedValue(sampleCart);

    const res = await request(app).get("/api/cart").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.subtotal).toBe(59.98);
    expect(res.body.cart.taxAmount).toBe(4.95);
    expect(res.body.cart.total).toBe(64.93);
    expect(res.body.cart.itemCount).toBe(2);
  });

  it("returns 200 with empty cart structure when no cart exists", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetCart.mockResolvedValue(emptyCart);

    const res = await request(app).get("/api/cart").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(0);
    expect(res.body.cart.subtotal).toBe(0);
    expect(res.body.cart.total).toBe(0);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/cart");
    expect(res.status).toBe(401);
    expect(mockGetCart).not.toHaveBeenCalled();
  });

  it("returns 403 when supplier tries to access cart", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app).get("/api/cart").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
    expect(mockGetCart).not.toHaveBeenCalled();
  });
});

describe("POST /api/cart/items", () => {
  const validPayload = { productId: PRODUCT_ID, quantity: 2 };

  it("returns 201 when item is added successfully", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockAddItemToCart.mockResolvedValue(sampleCartItem);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.productId).toBe(PRODUCT_ID);
    expect(res.body.quantity).toBe(2);
    expect(res.body.unitPrice).toBe(29.99);
    expect(mockAddItemToCart).toHaveBeenCalledWith(customerUser.id, PRODUCT_ID, 2);
  });

  it("returns 400 for invalid input (missing productId)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid input (quantity 0)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send({ productId: PRODUCT_ID, quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when stock is insufficient", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const stockError = new Error("Insufficient stock. Available: 5");
    Object.assign(stockError, { code: "BAD_REQUEST", statusCode: 400, name: "AppError" });
    mockAddItemToCart.mockRejectedValue(stockError);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/cart/items").send(validPayload);
    expect(res.status).toBe(401);
    expect(mockAddItemToCart).not.toHaveBeenCalled();
  });

  it("returns 403 when supplier tries to add item", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send(validPayload);

    expect(res.status).toBe(403);
    expect(mockAddItemToCart).not.toHaveBeenCalled();
  });
});

describe("PUT /api/cart/items/:id", () => {
  it("returns 200 when item is updated successfully", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const updatedItem = { ...sampleCartItem, quantity: 5, subtotal: 149.95 };
    mockUpdateCartItem.mockResolvedValue(updatedItem);

    const res = await request(app)
      .put(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(5);
    expect(mockUpdateCartItem).toHaveBeenCalledWith(customerUser.id, ITEM_ID, 5);
  });

  it("returns 400 for invalid quantity", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .put(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when stock is insufficient", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const stockError = new Error("Insufficient stock. Available: 3");
    Object.assign(stockError, { code: "BAD_REQUEST", statusCode: 400, name: "AppError" });
    mockUpdateCartItem.mockRejectedValue(stockError);

    const res = await request(app)
      .put(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: 10 });

    expect(res.status).toBe(400);
  });

  it("returns 403 when item belongs to different user", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const forbiddenError = new Error("Not authorized to update this cart item");
    Object.assign(forbiddenError, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockUpdateCartItem.mockRejectedValue(forbiddenError);

    const res = await request(app)
      .put(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: 3 });

    expect(res.status).toBe(403);
  });

  it("returns 404 when item does not exist", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const notFoundError = new Error("Cart item not found");
    Object.assign(notFoundError, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockUpdateCartItem.mockRejectedValue(notFoundError);

    const res = await request(app)
      .put(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token")
      .send({ quantity: 3 });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/cart/items/:id", () => {
  it("returns 200 when item is removed successfully", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockRemoveCartItem.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRemoveCartItem).toHaveBeenCalledWith(customerUser.id, ITEM_ID);
  });

  it("returns 403 when item belongs to different user", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const forbiddenError = new Error("Not authorized to remove this cart item");
    Object.assign(forbiddenError, { code: "FORBIDDEN", statusCode: 403, name: "AppError" });
    mockRemoveCartItem.mockRejectedValue(forbiddenError);

    const res = await request(app)
      .delete(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when item does not exist", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const notFoundError = new Error("Cart item not found");
    Object.assign(notFoundError, { code: "NOT_FOUND", statusCode: 404, name: "AppError" });
    mockRemoveCartItem.mockRejectedValue(notFoundError);

    const res = await request(app)
      .delete(`/api/cart/items/${ITEM_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/cart", () => {
  it("returns 200 with empty cart structure", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockClearCart.mockResolvedValue(emptyCart);

    const res = await request(app).delete("/api/cart").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(0);
    expect(res.body.cart.subtotal).toBe(0);
    expect(res.body.cart.total).toBe(0);
  });
});

describe("GET /api/cart/validate", () => {
  it("returns 200 with valid result when cart is clean", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockValidateCartItems.mockResolvedValue({ valid: true, issues: [] });

    const res = await request(app)
      .get("/api/cart/validate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.issues).toHaveLength(0);
    expect(mockValidateCartItems).toHaveBeenCalledWith(customerUser.id);
  });

  it("returns 200 with issues when cart has problems", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockValidateCartItems.mockResolvedValue({
      valid: false,
      issues: [
        {
          cartItemId: ITEM_ID,
          productId: PRODUCT_ID,
          issueType: "price_changed",
          details: { oldPrice: 29.99, newPrice: 34.99 },
        },
      ],
    });

    const res = await request(app)
      .get("/api/cart/validate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].issueType).toBe("price_changed");
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/cart/validate");
    expect(res.status).toBe(401);
    expect(mockValidateCartItems).not.toHaveBeenCalled();
  });
});

describe("POST /api/cart/refresh", () => {
  it("returns 200 with changes_made array", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockRefreshCart.mockResolvedValue({
      cart: sampleCart,
      changesMade: [
        {
          cartItemId: ITEM_ID,
          changeType: "price_updated",
          before: { unitPrice: 25.0 },
          after: { unitPrice: 29.99 },
        },
      ],
    });

    const res = await request(app)
      .post("/api/cart/refresh")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.cart.id).toBe(CART_ID);
    expect(res.body.changesMade).toHaveLength(1);
    expect(res.body.changesMade[0].changeType).toBe("price_updated");
    expect(mockRefreshCart).toHaveBeenCalledWith(customerUser.id);
  });

  it("returns 200 with empty changes when cart is already valid", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockRefreshCart.mockResolvedValue({
      cart: sampleCart,
      changesMade: [],
    });

    const res = await request(app)
      .post("/api/cart/refresh")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.changesMade).toHaveLength(0);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/cart/refresh");
    expect(res.status).toBe(401);
    expect(mockRefreshCart).not.toHaveBeenCalled();
  });
});
