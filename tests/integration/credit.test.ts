import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetCreditInfo = jest.fn();
const mockPlaceNet30Order = jest.fn();

jest.mock("../../src/services/credit.service", () => ({
  CreditService: {
    getCreditInfo: mockGetCreditInfo,
  },
}));

jest.mock("../../src/services/net30.service", () => ({
  Net30Service: {
    placeNet30Order: mockPlaceNet30Order,
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

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

const ORDER_ID = "a0000000-0000-4000-8000-000000000001";

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Credit & Net30 Routes", () => {
  describe("GET /api/users/me/credit", () => {
    it("returns credit info for user without credit record", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockGetCreditInfo.mockResolvedValue({
        eligible: false,
        limit: 0,
        used: 0,
        available: 0,
      });

      const res = await request(app)
        .get("/api/users/me/credit")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.eligible).toBe(false);
      expect(res.body.limit).toBe(0);
      expect(res.body.used).toBe(0);
      expect(res.body.available).toBe(0);
    });

    it("returns correct values for user with credit record", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockGetCreditInfo.mockResolvedValue({
        eligible: true,
        limit: 50000,
        used: 10000,
        available: 40000,
      });

      const res = await request(app)
        .get("/api/users/me/credit")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.eligible).toBe(true);
      expect(res.body.limit).toBe(50000);
      expect(res.body.used).toBe(10000);
      expect(res.body.available).toBe(40000);
    });

    it("returns 401 without auth", async () => {
      const res = await request(app).get("/api/users/me/credit");

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/payments/net30", () => {
    it("returns 201 with invoice details for eligible user", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockPlaceNet30Order.mockResolvedValue({
        orderId: ORDER_ID,
        invoiceId: "invoice-001",
        invoiceDueDate: "2026-04-10T00:00:00.000Z",
        amount: 1500,
        status: "confirmed",
      });

      const res = await request(app)
        .post("/api/payments/net30")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBe(ORDER_ID);
      expect(res.body.invoiceId).toBe("invoice-001");
      expect(res.body.invoiceDueDate).toBeTruthy();
      expect(res.body.amount).toBe(1500);
      expect(res.body.status).toBe("confirmed");
      expect(mockPlaceNet30Order).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
    });

    it("returns 403 for ineligible user", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockPlaceNet30Order.mockRejectedValue(
        new AppError(
          "Net30 terms are not enabled for your account. Contact support to apply.",
          403,
          "CREDIT_INELIGIBLE",
        ),
      );

      const res = await request(app)
        .post("/api/payments/net30")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(403);
    });

    it("returns 403 with amounts for insufficient credit", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockPlaceNet30Order.mockRejectedValue(
        new AppError(
          "Insufficient credit. Available: $500.00, Required: $1500.00",
          403,
          "CREDIT_INELIGIBLE",
        ),
      );

      const res = await request(app)
        .post("/api/payments/net30")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("$500.00");
      expect(res.body.error.message).toContain("$1500.00");
    });

    it("returns 401 without auth", async () => {
      const res = await request(app).post("/api/payments/net30").send({ orderId: ORDER_ID });

      expect(res.status).toBe(401);
    });

    it("returns 404 for non-existent order", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockPlaceNet30Order.mockRejectedValue(new AppError("Order not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .post("/api/payments/net30")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(404);
    });
  });
});
