import request from "supertest";

// ---------- Module-level mocks (must come before app import) ----------

const mockVerifyToken = jest.fn();

jest.mock("../../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

jest.mock("../../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../../src/services/storage.service", () => ({
  StorageService: {},
}));

const mockGetCart = jest.fn();
const mockAddItemToCart = jest.fn();
const mockClearCart = jest.fn();

jest.mock("../../../src/services/cart.service", () => ({
  CartService: {
    getCart: mockGetCart,
    addItemToCart: mockAddItemToCart,
    getOrCreateCart: jest.fn(),
    updateCartItem: jest.fn(),
    removeCartItem: jest.fn(),
    clearCart: mockClearCart,
    validateCartItems: jest.fn(),
    refreshCart: jest.fn(),
    calculateCartTotals: jest.fn(),
  },
}));

const mockValidateCheckout = jest.fn();

jest.mock("../../../src/services/checkout.service", () => ({
  CheckoutService: {
    validateCheckout: mockValidateCheckout,
  },
}));

const mockCreateOrder = jest.fn();
const mockGetOrderById = jest.fn();

jest.mock("../../../src/services/order.service", () => ({
  OrderService: {
    createOrder: mockCreateOrder,
    listOrders: jest.fn(),
    updateOrderStatus: jest.fn(),
    getOrderById: mockGetOrderById,
    updateMasterOrderStatus: jest.fn(),
  },
}));

jest.mock("../../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
  checkAndDecrementStock: jest.fn(),
  incrementStock: jest.fn(),
}));

// Stripe SDK mock
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
const mockRefundsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("../../../src/config/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
      cancel: mockPaymentIntentsCancel,
    },
    refunds: {
      create: mockRefundsCreate,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

jest.mock("../../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_WEBHOOK_TOLERANCE: 300,
  }),
}));

// Supabase admin mock
const mockFrom = jest.fn();

jest.mock("../../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockOnPaymentSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnPaymentRefunded = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: mockOnPaymentSuccess,
  onPaymentRefunded: mockOnPaymentRefunded,
}));

jest.mock("../../../src/services/email.service", () => ({
  sendOrderConfirmation: jest.fn(),
  sendOrderStatusUpdate: jest.fn(),
}));

jest.mock("../../../src/services/orderConfirmation.service", () => ({
  OrderConfirmationService: {
    confirmOrder: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../../src/utils/securityLogger", () => ({
  logSuspiciousActivity: jest.fn(),
  logWebhookVerificationFailure: jest.fn(),
  logWebhookProcessed: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../../src/index";
import { WebhookService } from "../../../src/services/webhook.service";
import type Stripe from "stripe";

// ---------- Test data ----------

const customerUser = {
  id: "cust-e2e-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

// Valid UUIDs for Zod validation
const PRODUCT_1 = "a0000000-0000-4000-a000-000000000001";
const PRODUCT_2 = "a0000000-0000-4000-a000-000000000002";
const PRODUCT_3 = "a0000000-0000-4000-a000-000000000003";
const SUPPLIER_A = "b0000000-0000-4000-a000-000000000001";
const SUPPLIER_B = "b0000000-0000-4000-a000-000000000002";
const ORDER_ID = "c0000000-0000-4000-a000-000000000001";
const ORDER_NUMBER = "ORD-20260312-E2E1";
const PI_ID = "pi_e2e";
const PI_SECRET = "pi_e2e_secret";

const shippingAddress = {
  street: "123 Main St",
  city: "Austin",
  state: "TX",
  zip_code: "78701",
  country: "US",
};

// ---------- Helpers ----------

function mockSelectQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.not = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  return chain;
}

function mockUpdateQuery() {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.update = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.not = jest.fn(self);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
    );
  return chain;
}

function mockInsertQuery() {
  const chain: Record<string, jest.Mock> = {};
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

function makeStripeEvent(type: string, dataObject: unknown, eventId = "evt_test_1"): Stripe.Event {
  return { id: eventId, type, data: { object: dataObject } } as unknown as Stripe.Event;
}

// ---------- Tests ----------

describe("Customer Purchase Flow — Stripe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebhookService.clearProcessedEvents();
  });

  it("Step 1: Add items to cart", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockAddItemToCart.mockResolvedValue({
      id: "d0000000-0000-4000-a000-000000000001",
      cartId: "e0000000-0000-4000-a000-000000000001",
      productId: PRODUCT_1,
      productName: "Surgical Gloves",
      quantity: 2,
      unitPrice: 15.0,
      subtotal: 30.0,
      supplierId: SUPPLIER_A,
      supplierName: "MedSupply Co",
      productImage: "img/gloves.jpg",
    });

    const res = await request(app)
      .post("/api/cart/items")
      .set("Authorization", "Bearer valid-token")
      .send({ productId: PRODUCT_1, quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.productId).toBe(PRODUCT_1);
    expect(res.body.quantity).toBe(2);
    expect(mockAddItemToCart).toHaveBeenCalledWith(customerUser.id, PRODUCT_1, 2);
  });

  it("Step 2: Get cart with items", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockGetCart.mockResolvedValue({
      id: "e0000000-0000-4000-a000-000000000001",
      customerId: customerUser.id,
      items: [
        {
          id: "d0000000-0000-4000-a000-000000000001",
          productId: PRODUCT_1,
          productName: "Surgical Gloves",
          quantity: 2,
          unitPrice: 15.0,
          subtotal: 30.0,
          supplierId: SUPPLIER_A,
          supplierName: "MedSupply Co",
          productImage: "img/gloves.jpg",
        },
        {
          id: "d0000000-0000-4000-a000-000000000002",
          productId: PRODUCT_2,
          productName: "Gauze Pads",
          quantity: 3,
          unitPrice: 8.99,
          subtotal: 26.97,
          supplierId: SUPPLIER_A,
          supplierName: "MedSupply Co",
          productImage: "img/gauze.jpg",
        },
        {
          id: "d0000000-0000-4000-a000-000000000003",
          productId: PRODUCT_3,
          productName: "Stethoscope",
          quantity: 1,
          unitPrice: 45.0,
          subtotal: 45.0,
          supplierId: SUPPLIER_B,
          supplierName: "DiagEquip Inc",
          productImage: "img/stethoscope.jpg",
        },
      ],
      subtotal: 101.97,
      taxRate: 0.0825,
      taxAmount: 8.41,
      total: 110.38,
      itemCount: 3,
    });

    const res = await request(app).get("/api/cart").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(3);
    expect(res.body.cart.subtotal).toBe(101.97);
    expect(res.body.cart.itemCount).toBe(3);
  });

  it("Step 3: Validate checkout", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockValidateCheckout.mockResolvedValue({
      valid: true,
      order_preview: {
        items: [
          {
            product_id: PRODUCT_1,
            product_name: "Surgical Gloves",
            supplier_id: SUPPLIER_A,
            supplier_name: "MedSupply Co",
            quantity: 2,
            current_price: 15.0,
            subtotal: 30.0,
          },
          {
            product_id: PRODUCT_2,
            product_name: "Gauze Pads",
            supplier_id: SUPPLIER_A,
            supplier_name: "MedSupply Co",
            quantity: 3,
            current_price: 8.99,
            subtotal: 26.97,
          },
          {
            product_id: PRODUCT_3,
            product_name: "Stethoscope",
            supplier_id: SUPPLIER_B,
            supplier_name: "DiagEquip Inc",
            quantity: 1,
            current_price: 45.0,
            subtotal: 45.0,
          },
        ],
        supplier_groups: [
          {
            supplier_id: SUPPLIER_A,
            supplier_name: "MedSupply Co",
            items: [
              {
                product_id: PRODUCT_1,
                product_name: "Surgical Gloves",
                supplier_id: SUPPLIER_A,
                supplier_name: "MedSupply Co",
                quantity: 2,
                current_price: 15.0,
                subtotal: 30.0,
              },
              {
                product_id: PRODUCT_2,
                product_name: "Gauze Pads",
                supplier_id: SUPPLIER_A,
                supplier_name: "MedSupply Co",
                quantity: 3,
                current_price: 8.99,
                subtotal: 26.97,
              },
            ],
            subtotal: 56.97,
          },
          {
            supplier_id: SUPPLIER_B,
            supplier_name: "DiagEquip Inc",
            items: [
              {
                product_id: PRODUCT_3,
                product_name: "Stethoscope",
                supplier_id: SUPPLIER_B,
                supplier_name: "DiagEquip Inc",
                quantity: 1,
                current_price: 45.0,
                subtotal: 45.0,
              },
            ],
            subtotal: 45.0,
          },
        ],
        subtotal: 101.97,
        tax_rate: 0.0825,
        tax_amount: 8.41,
        total: 110.38,
        shipping_address: shippingAddress,
      },
    });

    const res = await request(app)
      .post("/api/checkout/validate")
      .set("Authorization", "Bearer valid-token")
      .send({ shipping_address: shippingAddress });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.order_preview.supplier_groups).toHaveLength(2);
    expect(res.body.order_preview.subtotal).toBe(101.97);
    expect(res.body.order_preview.total).toBe(110.38);
    expect(mockValidateCheckout).toHaveBeenCalledWith(customerUser.id, shippingAddress);
  });

  it("Step 4: Create order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const orderResponse = {
      id: ORDER_ID,
      order_number: ORDER_NUMBER,
      customer_id: customerUser.id,
      parent_order_id: null,
      supplier_id: null,
      total_amount: 110.38,
      tax_amount: 8.41,
      shipping_address: shippingAddress,
      status: "pending_payment",
      payment_status: "pending",
      payment_intent_id: null,
      notes: null,
      items: [
        {
          id: "f0000000-0000-4000-a000-000000000001",
          order_id: ORDER_ID,
          product_id: PRODUCT_1,
          product_name: "Surgical Gloves",
          supplier_id: SUPPLIER_A,
          quantity: 2,
          unit_price: 15.0,
          subtotal: 30.0,
          fulfillment_status: "pending",
          tracking_number: null,
          carrier: null,
          product_image: "img/gloves.jpg",
          supplier_name: "MedSupply Co",
        },
        {
          id: "f0000000-0000-4000-a000-000000000002",
          order_id: ORDER_ID,
          product_id: PRODUCT_2,
          product_name: "Gauze Pads",
          supplier_id: SUPPLIER_A,
          quantity: 3,
          unit_price: 8.99,
          subtotal: 26.97,
          fulfillment_status: "pending",
          tracking_number: null,
          carrier: null,
          product_image: "img/gauze.jpg",
          supplier_name: "MedSupply Co",
        },
        {
          id: "f0000000-0000-4000-a000-000000000003",
          order_id: ORDER_ID,
          product_id: PRODUCT_3,
          product_name: "Stethoscope",
          supplier_id: SUPPLIER_B,
          quantity: 1,
          unit_price: 45.0,
          subtotal: 45.0,
          fulfillment_status: "pending",
          tracking_number: null,
          carrier: null,
          product_image: "img/stethoscope.jpg",
          supplier_name: "DiagEquip Inc",
        },
      ],
      created_at: "2026-03-12T00:00:00Z",
      updated_at: "2026-03-12T00:00:00Z",
    };

    mockCreateOrder.mockResolvedValue(orderResponse);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send({ shipping_address: shippingAddress });

    expect(res.status).toBe(201);
    expect(res.body.order.id).toBe(ORDER_ID);
    expect(res.body.order.order_number).toBe(ORDER_NUMBER);
    expect(res.body.order.status).toBe("pending_payment");
    expect(res.body.order.payment_status).toBe("pending");
    expect(res.body.order.items).toHaveLength(3);
    expect(mockCreateOrder).toHaveBeenCalledWith(customerUser.id, shippingAddress, undefined);
  });

  it("Step 5: Create Stripe PaymentIntent", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    // Mock Supabase: order lookup returns pending_payment order
    const selectChain = mockSelectQuery({
      data: {
        id: ORDER_ID,
        customer_id: customerUser.id,
        status: "pending_payment",
        payment_intent_id: null,
        payment_status: "pending",
        total_amount: "110.38",
        order_number: ORDER_NUMBER,
      },
    });

    // Mock Supabase: order update (set payment_intent_id)
    const updateChain = mockUpdateQuery();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain;
      return updateChain;
    });

    mockPaymentIntentsCreate.mockResolvedValue({
      id: PI_ID,
      client_secret: PI_SECRET,
    });

    const res = await request(app)
      .post("/api/payments/intent")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(201);
    expect(res.body.paymentIntentId).toBe(PI_ID);
    expect(res.body.clientSecret).toBe(PI_SECRET);
    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 11038,
        currency: "usd",
        metadata: expect.objectContaining({ order_id: ORDER_ID }),
      }),
    );
  });

  it("Step 6: Webhook — payment_intent.succeeded", async () => {
    const pi = {
      id: PI_ID,
      amount: 11038,
      currency: "usd",
      metadata: { order_id: ORDER_ID },
      payment_method_types: ["card"],
    };
    const event = makeStripeEvent("payment_intent.succeeded", pi);
    mockConstructEvent.mockReturnValue(event);

    // Mock Supabase: order lookup
    const selectChain = mockSelectQuery({
      data: { id: ORDER_ID, payment_status: "processing" },
    });
    // Mock Supabase: order update (payment_status -> paid)
    const updateChain = mockUpdateQuery();
    // Mock Supabase: payment record insert
    const insertChain = mockInsertQuery();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectChain;
      if (callCount === 2) return updateChain;
      return insertChain;
    });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({
      payment_status: "paid",
      status: "payment_confirmed",
    });
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: ORDER_ID,
        status: "succeeded",
        amount: 110.38,
      }),
    );
    expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
  });

  it("Step 7: Verify order is paid", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockGetOrderById.mockResolvedValue({
      id: ORDER_ID,
      order_number: ORDER_NUMBER,
      customer_id: customerUser.id,
      status: "confirmed",
      payment_status: "paid",
      total_amount: 110.38,
      tax_amount: 8.41,
      shipping_address: shippingAddress,
      payment_intent_id: PI_ID,
      items: [
        {
          id: "f0000000-0000-4000-a000-000000000001",
          order_id: ORDER_ID,
          product_id: PRODUCT_1,
          product_name: "Surgical Gloves",
          supplier_id: SUPPLIER_A,
          quantity: 2,
          unit_price: 15.0,
          subtotal: 30.0,
          fulfillment_status: "pending",
          supplier_name: "MedSupply Co",
        },
        {
          id: "f0000000-0000-4000-a000-000000000002",
          order_id: ORDER_ID,
          product_id: PRODUCT_2,
          product_name: "Gauze Pads",
          supplier_id: SUPPLIER_A,
          quantity: 3,
          unit_price: 8.99,
          subtotal: 26.97,
          fulfillment_status: "pending",
          supplier_name: "MedSupply Co",
        },
        {
          id: "f0000000-0000-4000-a000-000000000003",
          order_id: ORDER_ID,
          product_id: PRODUCT_3,
          product_name: "Stethoscope",
          supplier_id: SUPPLIER_B,
          quantity: 1,
          unit_price: 45.0,
          subtotal: 45.0,
          fulfillment_status: "pending",
          supplier_name: "DiagEquip Inc",
        },
      ],
      created_at: "2026-03-12T00:00:00Z",
      updated_at: "2026-03-12T00:01:00Z",
    });

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("confirmed");
    expect(res.body.order.payment_status).toBe("paid");
    expect(res.body.order.id).toBe(ORDER_ID);
    expect(res.body.order.total_amount).toBe(110.38);
    expect(mockGetOrderById).toHaveBeenCalledWith(ORDER_ID, customerUser.id, "customer");
  });
});
