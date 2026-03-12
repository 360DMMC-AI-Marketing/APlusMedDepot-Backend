import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockVerifyVendor = jest.fn();

jest.mock("../../src/services/aiVerification.service", () => ({
  AIVerificationService: {
    verifyVendor: mockVerifyVendor,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

const VENDOR_ID = "a0000000-0000-4000-8000-000000000001";

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
  firstName: "Sup",
  lastName: "Plier",
  companyName: "MedCo",
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const validResult = {
  score: 85,
  recommendation: "approve",
  checks: {
    businessInfo: { passed: true, notes: "Business info is complete" },
    documentation: { passed: true, notes: "Documents verified" },
    riskAssessment: { passed: true, notes: "Low risk profile" },
  },
  missingItems: [],
  riskFactors: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AI Verification Routes", () => {
  describe("POST /api/admin/vendors/:id/ai-verify", () => {
    it("returns 200 with verification result for admin", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockVerifyVendor.mockResolvedValue(validResult);

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.score).toBe(85);
      expect(res.body.recommendation).toBe("approve");
      expect(res.body.checks.businessInfo.passed).toBe(true);
      expect(res.body.checks.documentation.passed).toBe(true);
      expect(res.body.checks.riskAssessment.passed).toBe(true);
      expect(res.body.missingItems).toEqual([]);
      expect(res.body.riskFactors).toEqual([]);
      expect(mockVerifyVendor).toHaveBeenCalledWith(VENDOR_ID);
    });

    it("returns 403 for customer role", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 403 for supplier role", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 401 without auth token", async () => {
      const res = await request(app).post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`);

      expect(res.status).toBe(401);
    });

    it("returns 404 for non-existent vendor", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockVerifyVendor.mockRejectedValue(new AppError("Vendor not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns correct response shape with all required fields", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockVerifyVendor.mockResolvedValue({
        score: 72,
        recommendation: "review",
        checks: {
          businessInfo: { passed: true, notes: "OK" },
          documentation: { passed: false, notes: "Missing license" },
          riskAssessment: { passed: true, notes: "Medium risk" },
        },
        missingItems: ["Business license"],
        riskFactors: ["New business"],
      });

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(typeof res.body.score).toBe("number");
      expect(typeof res.body.recommendation).toBe("string");
      expect(typeof res.body.checks).toBe("object");
      expect(typeof res.body.checks.businessInfo.passed).toBe("boolean");
      expect(typeof res.body.checks.businessInfo.notes).toBe("string");
      expect(typeof res.body.checks.documentation.passed).toBe("boolean");
      expect(typeof res.body.checks.riskAssessment.passed).toBe("boolean");
      expect(Array.isArray(res.body.missingItems)).toBe(true);
      expect(Array.isArray(res.body.riskFactors)).toBe(true);
    });

    it("forwards 502 from AI service error", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockVerifyVendor.mockRejectedValue(
        new AppError("AI verification service error", 502, "AI_SERVICE_ERROR"),
      );

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(502);
    });

    it("forwards 503 when AI not configured", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockVerifyVendor.mockRejectedValue(
        new AppError("AI verification is not configured", 503, "SERVICE_UNAVAILABLE"),
      );

      const res = await request(app)
        .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(503);
    });
  });
});
