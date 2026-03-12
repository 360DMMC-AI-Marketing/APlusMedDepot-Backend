import request from "supertest";

const mockResetPassword = jest.fn();
const mockUpdatePasswordWithToken = jest.fn();
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    signIn: jest.fn(),
    getSession: jest.fn(),
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    resetPassword: mockResetPassword,
    updatePasswordWithToken: mockUpdatePasswordWithToken,
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

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 with generic message for valid email", async () => {
    mockResetPassword.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      "If an account exists with this email, a reset link has been sent.",
    );
    expect(mockResetPassword).toHaveBeenCalledWith("user@example.com");
  });

  it("returns 200 even if email does not exist (service throws)", async () => {
    mockResetPassword.mockRejectedValue(new Error("not found"));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      "If an account exists with this email, a reset link has been sent.",
    );
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("returns 400 for missing email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({});

    expect(res.status).toBe(400);
    expect(mockResetPassword).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  it("returns 200 with success message for valid token and password", async () => {
    mockUpdatePasswordWithToken.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "valid-token-abc", newPassword: "NewStr0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password has been reset successfully.");
    expect(mockUpdatePasswordWithToken).toHaveBeenCalledWith("valid-token-abc", "NewStr0ng!Pass");
  });

  it("returns 400 for invalid/garbage token", async () => {
    const error = new Error("Invalid or expired reset token");
    (error as Error & { statusCode: number; code: string }).statusCode = 400;
    (error as Error & { statusCode: number; code: string }).code = "INVALID_TOKEN";
    mockUpdatePasswordWithToken.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "garbage-token", newPassword: "NewStr0ng!Pass" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for weak password (validation)", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "valid-token", newPassword: "weak" });

    expect(res.status).toBe(400);
    expect(mockUpdatePasswordWithToken).not.toHaveBeenCalled();
  });

  it("returns 400 for missing token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "NewStr0ng!Pass" });

    expect(res.status).toBe(400);
    expect(mockUpdatePasswordWithToken).not.toHaveBeenCalled();
  });

  it("returns 400 for missing password", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "valid-token" });

    expect(res.status).toBe(400);
    expect(mockUpdatePasswordWithToken).not.toHaveBeenCalled();
  });
});
