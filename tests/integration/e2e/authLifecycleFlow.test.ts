import request from "supertest";

// ---------- Module-level mocks (must come before app import) ----------

const mockVerifyToken = jest.fn();
const mockSignUp = jest.fn();
const mockSignIn = jest.fn();
const mockSignOut = jest.fn();
const mockResetPassword = jest.fn();
const mockUpdatePasswordWithToken = jest.fn();
const mockVerifyEmail = jest.fn();
const mockResendVerification = jest.fn();
const mockRefreshSession = jest.fn();
const mockGetSession = jest.fn();
const mockSendVerificationEmail = jest.fn();

jest.mock("../../../src/services/auth.service", () => ({
  AuthService: {
    signUp: mockSignUp,
    signIn: mockSignIn,
    signOut: mockSignOut,
    getSession: mockGetSession,
    verifyToken: mockVerifyToken,
    resetPassword: mockResetPassword,
    updatePasswordWithToken: mockUpdatePasswordWithToken,
    verifyEmail: mockVerifyEmail,
    resendVerification: mockResendVerification,
    refreshSession: mockRefreshSession,
    sendVerificationEmail: mockSendVerificationEmail,
  },
}));

jest.mock("../../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock("../../../src/services/cart.service", () => ({
  CartService: {},
}));

jest.mock("../../../src/services/checkout.service", () => ({
  CheckoutService: {},
}));

jest.mock("../../../src/services/order.service", () => ({
  OrderService: {},
}));

jest.mock("../../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
  checkAndDecrementStock: jest.fn(),
  incrementStock: jest.fn(),
}));

const mockGetProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockChangePassword = jest.fn();

jest.mock("../../../src/services/userProfile.service", () => ({
  UserProfileService: {
    getProfile: mockGetProfile,
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
  },
}));

jest.mock("../../../src/config/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      cancel: jest.fn(),
    },
    refunds: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  }),
}));

jest.mock("../../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_WEBHOOK_TOLERANCE: 300,
  }),
}));

jest.mock("../../../src/config/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("../../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: jest.fn().mockResolvedValue(undefined),
  onPaymentRefunded: jest.fn().mockResolvedValue(undefined),
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

// ---------- Test data ----------

const USER_ID = "a0000000-0000-4000-a000-000000000060";

const registeredUser = {
  id: USER_ID,
  email: "newcustomer@example.com",
  firstName: "Alice",
  lastName: "Smith",
  companyName: "MedCorp",
  role: "customer" as const,
  status: "pending" as const,
  lastLogin: null,
};

const approvedUser = {
  ...registeredUser,
  companyName: "MedCorp",
  phone: null,
  status: "approved" as const,
};

const session = {
  accessToken: "access-token-123",
  refreshToken: "refresh-token-456",
  expiresAt: 1800000000,
};

// ---------- Tests ----------

describe("Auth Lifecycle Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Step 1: Register new customer", async () => {
    mockSignUp.mockResolvedValue({
      user: registeredUser,
      session,
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "newcustomer@example.com",
      password: "SecureP@ss1",
      firstName: "Alice",
      lastName: "Smith",
      companyName: "MedCorp",
      role: "customer",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("newcustomer@example.com");
    expect(res.body.user.status).toBe("pending");
    expect(res.body.user.role).toBe("customer");
    expect(mockSignUp).toHaveBeenCalledWith(
      "newcustomer@example.com",
      "SecureP@ss1",
      "Alice",
      "Smith",
      "MedCorp",
      null,
      "customer",
    );
  });

  it("Step 2: Verify email with code", async () => {
    mockVerifyEmail.mockResolvedValue(undefined);

    const res = await request(app).post("/api/auth/verify-email").send({ code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified successfully.");
    expect(mockVerifyEmail).toHaveBeenCalledWith("123456");
  });

  it("Step 3: User logs in after admin approval", async () => {
    mockSignIn.mockResolvedValue({
      user: approvedUser,
      session,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "newcustomer@example.com",
      password: "SecureP@ss1",
    });

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe("approved");
    expect(res.body.session.accessToken).toBe("access-token-123");
  });

  it("Step 4: User views profile", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);

    mockGetProfile.mockResolvedValue({
      id: USER_ID,
      email: "newcustomer@example.com",
      firstName: "Alice",
      lastName: "Smith",
      companyName: "MedCorp",
      phone: null,
      role: "customer",
      status: "approved",
    });

    const res = await request(app).get("/api/users/me").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("Alice");
    expect(res.body.email).toBe("newcustomer@example.com");
  });

  it("Step 5: User updates profile", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);

    mockUpdateProfile.mockResolvedValue({
      id: USER_ID,
      email: "newcustomer@example.com",
      firstName: "Alice",
      lastName: "Johnson",
      companyName: "MedCorp Updated",
      phone: "555-0200",
      role: "customer",
      status: "approved",
    });

    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", "Bearer valid-token")
      .send({
        lastName: "Johnson",
        companyName: "MedCorp Updated",
        phone: "555-0200",
      });

    expect(res.status).toBe(200);
    expect(res.body.lastName).toBe("Johnson");
    expect(res.body.companyName).toBe("MedCorp Updated");
    expect(mockUpdateProfile).toHaveBeenCalledWith(USER_ID, {
      lastName: "Johnson",
      companyName: "MedCorp Updated",
      phone: "555-0200",
    });
  });

  it("Step 6: User changes password", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    mockChangePassword.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/users/me/change-password")
      .set("Authorization", "Bearer valid-token")
      .send({
        currentPassword: "SecureP@ss1",
        newPassword: "NewSecureP@ss2",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password changed successfully.");
    expect(mockChangePassword).toHaveBeenCalledWith(USER_ID, "SecureP@ss1", "NewSecureP@ss2");
  });

  it("Step 7: User forgot password — sends reset email", async () => {
    mockResetPassword.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "newcustomer@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("reset link has been sent");
  });

  it("Step 8: User resets password with token", async () => {
    mockUpdatePasswordWithToken.mockResolvedValue(undefined);

    const res = await request(app).post("/api/auth/reset-password").send({
      token: "reset-token-xyz",
      newPassword: "FinalP@ssw0rd!",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password has been reset successfully.");
    expect(mockUpdatePasswordWithToken).toHaveBeenCalledWith("reset-token-xyz", "FinalP@ssw0rd!");
  });

  it("Step 9: User logs in with new password", async () => {
    mockSignIn.mockResolvedValue({
      user: approvedUser,
      session: { ...session, accessToken: "new-access-token" },
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "newcustomer@example.com",
      password: "FinalP@ssw0rd!",
    });

    expect(res.status).toBe(200);
    expect(res.body.session.accessToken).toBe("new-access-token");
  });

  it("Step 10: Registration with weak password — validation error", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "test@example.com",
      password: "weak",
      firstName: "Test",
      lastName: "User",
      companyName: "TestCo",
      role: "customer",
    });

    expect(res.status).toBe(400);
  });

  it("Step 11: Resend verification email", async () => {
    mockResendVerification.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "newcustomer@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("verification link has been sent");
  });
});
