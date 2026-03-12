import request from "supertest";

const mockGetProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockChangePassword = jest.fn();
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/userProfile.service", () => ({
  UserProfileService: {
    getProfile: mockGetProfile,
    updateProfile: mockUpdateProfile,
    changePassword: mockChangePassword,
  },
}));

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
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
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

const customerProfile = {
  id: "user-1",
  email: "customer@test.com",
  firstName: "Jane",
  lastName: "Doe",
  name: "Jane Doe",
  role: "customer" as const,
  status: "approved",
  phone: "555-0100",
  company: "Test Corp",
  emailVerified: true,
  vendorId: null,
  commissionRate: null,
  vendorStatus: null,
  currentBalance: null,
  createdAt: "2025-01-01T00:00:00Z",
  lastLogin: "2025-03-01T00:00:00Z",
};

const supplierProfile = {
  ...customerProfile,
  id: "user-2",
  email: "supplier@test.com",
  role: "supplier" as const,
  vendorId: "vendor-1",
  commissionRate: 15,
  vendorStatus: "approved",
  currentBalance: 1250.5,
};

const approvedUser = {
  id: "user-1",
  email: "customer@test.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: "Test Corp",
  phone: "555-0100",
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: "2025-03-01T00:00:00Z",
};

const approvedSupplier = {
  ...approvedUser,
  id: "user-2",
  email: "supplier@test.com",
  role: "supplier" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/users/me", () => {
  it("returns 200 with customer profile", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    mockGetProfile.mockResolvedValue(customerProfile);

    const res = await request(app).get("/api/users/me").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("customer@test.com");
    expect(res.body.vendorId).toBeNull();
    expect(res.body.commissionRate).toBeNull();
  });

  it("returns 200 with supplier profile including vendor data", async () => {
    mockVerifyToken.mockResolvedValue(approvedSupplier);
    mockGetProfile.mockResolvedValue(supplierProfile);

    const res = await request(app).get("/api/users/me").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.vendorId).toBe("vendor-1");
    expect(res.body.commissionRate).toBe(15);
    expect(res.body.currentBalance).toBe(1250.5);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/users/me");

    expect(res.status).toBe(401);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });
});

describe("PUT /api/users/me", () => {
  it("returns 200 with updated profile for valid data", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    mockUpdateProfile.mockResolvedValue({
      ...customerProfile,
      firstName: "Updated",
      name: "Updated Doe",
    });

    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", "Bearer valid-token")
      .send({ firstName: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("Updated");
    expect(mockUpdateProfile).toHaveBeenCalledWith("user-1", { firstName: "Updated" });
  });

  it("returns 400 for empty body", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);

    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(400);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});

describe("POST /api/users/me/change-password", () => {
  it("returns 200 for correct current password", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    mockChangePassword.mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/users/me/change-password")
      .set("Authorization", "Bearer valid-token")
      .send({ currentPassword: "OldStr0ng!Pass", newPassword: "NewStr0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Password changed successfully.");
    expect(mockChangePassword).toHaveBeenCalledWith("user-1", "OldStr0ng!Pass", "NewStr0ng!Pass");
  });

  it("returns 401 for wrong current password", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    const error = new Error("Current password is incorrect");
    (error as Error & { statusCode: number; code: string }).statusCode = 401;
    (error as Error & { statusCode: number; code: string }).code = "INVALID_CREDENTIALS";
    mockChangePassword.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/users/me/change-password")
      .set("Authorization", "Bearer valid-token")
      .send({ currentPassword: "WrongPass1!", newPassword: "NewStr0ng!Pass" });

    expect(res.status).toBe(401);
  });

  it("returns 400 for weak new password", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    const error = new Error("Password must be at least 8 characters");
    (error as Error & { statusCode: number; code: string }).statusCode = 400;
    (error as Error & { statusCode: number; code: string }).code = "WEAK_PASSWORD";
    mockChangePassword.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/users/me/change-password")
      .set("Authorization", "Bearer valid-token")
      .send({ currentPassword: "OldStr0ng!Pass", newPassword: "weak" });

    expect(res.status).toBe(400);
  });
});
