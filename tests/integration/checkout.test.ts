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

jest.mock("../../src/services/cart.service", () => ({
  CartService: {},
}));

const mockValidateCheckout = jest.fn();

jest.mock("../../src/services/checkout.service", () => ({
  CheckoutService: {
    validateCheckout: mockValidateCheckout,
  },
}));

jest.mock("../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

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

const validAddress = {
  shipping_address: {
    street: "123 Main St",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    country: "US",
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/checkout/validate — integration", () => {
  it("returns 200 with valid:true and order_preview", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockValidateCheckout.mockResolvedValue({
      valid: true,
      order_preview: {
        items: [
          {
            product_id: "prod-1",
            product_name: "Surgical Gloves",
            supplier_id: "sup-1",
            supplier_name: "MedSupply Co",
            quantity: 2,
            current_price: 15.0,
            subtotal: 30.0,
          },
        ],
        supplier_groups: [
          {
            supplier_id: "sup-1",
            supplier_name: "MedSupply Co",
            items: [
              {
                product_id: "prod-1",
                product_name: "Surgical Gloves",
                supplier_id: "sup-1",
                supplier_name: "MedSupply Co",
                quantity: 2,
                current_price: 15.0,
                subtotal: 30.0,
              },
            ],
            subtotal: 30.0,
          },
        ],
        subtotal: 30.0,
        tax_rate: 0.0825,
        tax_amount: 2.48,
        total: 32.48,
        shipping_address: validAddress.shipping_address,
      },
    });

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send(validAddress);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.order_preview.subtotal).toBe(30.0);
    expect(res.body.order_preview.tax_amount).toBe(2.48);
    expect(res.body.order_preview.total).toBe(32.48);
    expect(res.body.order_preview.items).toHaveLength(1);
    expect(res.body.order_preview.supplier_groups).toHaveLength(1);
    expect(mockValidateCheckout).toHaveBeenCalledWith(
      customerUser.id,
      validAddress.shipping_address,
    );
  });

  it("returns 200 with valid:false when cart has issues", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockValidateCheckout.mockResolvedValue({
      valid: false,
      errors: [
        {
          type: "out_of_stock",
          product_id: "prod-1",
          product_name: "Surgical Gloves",
          available: 3,
          requested: 5,
        },
      ],
    });

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send(validAddress);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].type).toBe("out_of_stock");
  });

  it("returns 400 for malformed request body (missing shipping_address)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockValidateCheckout).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid zip_code format", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send({
        shipping_address: {
          street: "123 Main St",
          city: "Austin",
          state: "TX",
          zip_code: "ABC",
          country: "US",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockValidateCheckout).not.toHaveBeenCalled();
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/checkout/validate").send(validAddress);

    expect(res.status).toBe(401);
    expect(mockValidateCheckout).not.toHaveBeenCalled();
  });

  it("returns 403 when supplier tries to checkout", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send(validAddress);

    expect(res.status).toBe(403);
    expect(mockValidateCheckout).not.toHaveBeenCalled();
  });
});
