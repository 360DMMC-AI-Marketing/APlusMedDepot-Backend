import request from "supertest";

const mockSignUp = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: mockSignUp,
  },
}));

jest.mock("../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const customerPayload = {
  email: "customer@example.com",
  password: "Str0ng!Pass",
  firstName: "Jane",
  lastName: "Doe",
  companyName: "Acme Medical",
  phone: "555-0100",
  role: "customer",
};

const supplierPayload = {
  email: "supplier@example.com",
  password: "Str0ng!Pass",
  firstName: "Sam",
  lastName: "Supply",
  phone: "555-0200",
  role: "supplier",
};

const mockUserResponse = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: "user-uuid-1",
    email: "customer@example.com",
    firstName: "Jane",
    lastName: "Doe",
    companyName: "Acme Medical",
    phone: "555-0100",
    role: "customer",
    status: "pending",
    lastLogin: null,
    ...overrides,
  },
  session: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 1700000000,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("registers a customer with companyName and returns 201", async () => {
    mockSignUp.mockResolvedValue(mockUserResponse());

    const res = await request(app).post("/api/auth/register").send(customerPayload);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe(
      "Registration successful. Your account is pending admin approval.",
    );
    expect(res.body.user).toEqual({
      id: "user-uuid-1",
      email: "customer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      companyName: "Acme Medical",
      role: "customer",
      status: "pending",
    });
    expect(mockSignUp).toHaveBeenCalledWith(
      "customer@example.com",
      "Str0ng!Pass",
      "Jane",
      "Doe",
      "Acme Medical",
      "555-0100",
      "customer",
    );
  });

  it("registers a supplier without companyName and returns 201", async () => {
    mockSignUp.mockResolvedValue(
      mockUserResponse({
        email: "supplier@example.com",
        firstName: "Sam",
        lastName: "Supply",
        companyName: null,
        phone: "555-0200",
        role: "supplier",
      }),
    );

    const res = await request(app).post("/api/auth/register").send(supplierPayload);

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("supplier");
    expect(mockSignUp).toHaveBeenCalledWith(
      "supplier@example.com",
      "Str0ng!Pass",
      "Sam",
      "Supply",
      null,
      "555-0200",
      "supplier",
    );
  });

  it("returns 400 when email is missing", async () => {
    const payload = {
      password: customerPayload.password,
      firstName: customerPayload.firstName,
      lastName: customerPayload.lastName,
      companyName: customerPayload.companyName,
      phone: customerPayload.phone,
      role: customerPayload.role,
    };

    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns 400 when password is too weak", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...customerPayload, password: "weak" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toBeDefined();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns 400 when role is invalid", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...customerPayload, role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("returns 409 when email is already registered", async () => {
    const duplicateError = new Error("Email already in use");
    Object.assign(duplicateError, {
      code: "DUPLICATE_EMAIL",
      statusCode: 409,
      name: "AuthServiceError",
    });
    mockSignUp.mockRejectedValue(duplicateError);

    const res = await request(app).post("/api/auth/register").send(customerPayload);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_EMAIL");
    expect(res.body.error.message).toBe("Email already in use");
  });

  it("returns 400 when customer is missing companyName", async () => {
    const payload = {
      email: customerPayload.email,
      password: customerPayload.password,
      firstName: customerPayload.firstName,
      lastName: customerPayload.lastName,
      phone: customerPayload.phone,
      role: customerPayload.role,
    };

    const res = await request(app).post("/api/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
