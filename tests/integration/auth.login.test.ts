import request from "supertest";

const mockSignIn = jest.fn();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockRefreshSession = jest.fn();
const mockResetPassword = jest.fn();
const mockUpdatePasswordWithToken = jest.fn();
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    signIn: mockSignIn,
    getSession: mockGetSession,
    signOut: mockSignOut,
    refreshSession: mockRefreshSession,
    resetPassword: mockResetPassword,
    updatePasswordWithToken: mockUpdatePasswordWithToken,
    verifyToken: mockVerifyToken,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const approvedUser = {
  id: "user-uuid-1",
  email: "user@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: "Acme Medical",
  phone: "555-0100",
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: new Date().toISOString(),
};

const sessionData = {
  accessToken: "access-token-123",
  refreshToken: "refresh-token-456",
  expiresAt: 1700000000,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/auth/login", () => {
  it("returns 200 with user and session on valid credentials", async () => {
    mockSignIn.mockResolvedValue({ user: approvedUser, session: sessionData });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "Str0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: "user-uuid-1",
      email: "user@example.com",
      firstName: "Jane",
      lastName: "Doe",
      role: "customer",
      status: "approved",
    });
    expect(res.body.session).toEqual({
      accessToken: "access-token-123",
      refreshToken: "refresh-token-456",
      expiresAt: 1700000000,
    });
    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "Str0ng!Pass");
  });

  it("returns 401 on wrong password", async () => {
    const credError = new Error("Invalid email or password");
    Object.assign(credError, {
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
      name: "AuthServiceError",
    });
    mockSignIn.mockRejectedValue(credError);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPass1!" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 403 for pending user", async () => {
    const pendingError = new Error("Account pending approval");
    Object.assign(pendingError, {
      code: "ACCOUNT_PENDING",
      statusCode: 403,
      name: "AuthServiceError",
    });
    mockSignIn.mockRejectedValue(pendingError);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "pending@example.com", password: "Str0ng!Pass" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_PENDING");
    expect(res.body.error.message).toBe("Account pending approval");
  });

  it("returns 403 for suspended user", async () => {
    const suspendedError = new Error("Account suspended");
    Object.assign(suspendedError, {
      code: "ACCOUNT_SUSPENDED",
      statusCode: 403,
      name: "AuthServiceError",
    });
    mockSignIn.mockRejectedValue(suspendedError);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "suspended@example.com", password: "Str0ng!Pass" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
    expect(res.body.error.message).toBe("Account suspended");
  });

  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "user@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/session", () => {
  it("returns 200 with user and session for valid token", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    mockGetSession.mockResolvedValue({ user: approvedUser, session: sessionData });

    const res = await request(app)
      .get("/api/auth/session")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.session).toBeDefined();
    expect(mockGetSession).toHaveBeenCalledWith("valid-token");
  });

  it("returns 401 for invalid token", async () => {
    mockVerifyToken.mockRejectedValue(new Error("Invalid token"));

    const res = await request(app)
      .get("/api/auth/session")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 on successful logout", async () => {
    mockSignOut.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out successfully");
    expect(mockSignOut).toHaveBeenCalledWith("valid-token");
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 for existing email", async () => {
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

  it("returns 200 for non-existing email (same response)", async () => {
    mockResetPassword.mockRejectedValue(new Error("User not found"));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe(
      "If an account exists with this email, a reset link has been sent.",
    );
  });
});
