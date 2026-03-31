import request from "supertest";

const mockVerifyEmail = jest.fn();
const mockResendVerification = jest.fn();
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    signIn: jest.fn(),
    getSession: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    resetPassword: jest.fn(),
    updatePasswordWithToken: jest.fn(),
    sendVerificationEmail: jest.fn(),
    verifyEmail: mockVerifyEmail,
    resendVerification: mockResendVerification,
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

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/auth/verify-email", () => {
  it("returns 200 with success message for valid code", async () => {
    mockVerifyEmail.mockResolvedValue(undefined);

    const res = await request(app).post("/api/auth/verify-email").send({ code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified successfully.");
    expect(mockVerifyEmail).toHaveBeenCalledWith("123456");
  });

  it("returns 400 for invalid code (not found in DB)", async () => {
    const error = new Error("Invalid or expired verification code");
    (error as Error & { statusCode: number; code: string }).statusCode = 400;
    (error as Error & { statusCode: number; code: string }).code = "INVALID_CODE";
    mockVerifyEmail.mockRejectedValue(error);

    const res = await request(app).post("/api/auth/verify-email").send({ code: "654321" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for expired code", async () => {
    const error = new Error("Verification token has expired. Please request a new one.");
    (error as Error & { statusCode: number; code: string }).statusCode = 400;
    (error as Error & { statusCode: number; code: string }).code = "TOKEN_EXPIRED";
    mockVerifyEmail.mockRejectedValue(error);

    const res = await request(app).post("/api/auth/verify-email").send({ code: "111111" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for missing code", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({});

    expect(res.status).toBe(400);
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for non-numeric code", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ code: "abcdef" });

    expect(res.status).toBe(400);
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("works without authentication (no Bearer token needed)", async () => {
    mockVerifyEmail.mockResolvedValue(undefined);

    const res = await request(app).post("/api/auth/verify-email").send({ code: "123456" });

    // Should not return 401
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("returns 200 for unverified email", async () => {
    mockResendVerification.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "unverified@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      "If the email is registered and unverified, a verification link has been sent.",
    );
    expect(mockResendVerification).toHaveBeenCalledWith("unverified@example.com");
  });

  it("returns 409 for already verified email", async () => {
    const error = new Error("Email is already verified");
    (error as Error & { statusCode: number; code: string }).statusCode = 409;
    (error as Error & { statusCode: number; code: string }).code = "ALREADY_VERIFIED";
    mockResendVerification.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "verified@example.com" });

    expect(res.status).toBe(409);
  });

  it("returns 200 for non-existent email (no error)", async () => {
    mockResendVerification.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(mockResendVerification).not.toHaveBeenCalled();
  });

  it("works without authentication (no Bearer token needed)", async () => {
    mockResendVerification.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "test@example.com" });

    expect(res.status).not.toBe(401);
  });
});
