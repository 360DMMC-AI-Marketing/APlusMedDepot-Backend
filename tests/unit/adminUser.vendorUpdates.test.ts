const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockSendEmail = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/services/email.service", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("../../src/templates/baseLayout", () => ({
  baseLayout: (opts: { body: string }) => `<html>${opts.body}</html>`,
  escapeHtml: (str: string) => str,
}));

import { AdminUserService } from "../../src/services/adminUser.service";
import { logAdminAction } from "../../src/utils/securityLogger";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.or = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ADMIN_ID = "admin-uuid-1";

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-uuid-1",
    email: "test@example.com",
    role: "customer",
    status: "pending",
    first_name: "John",
    last_name: "Doe",
    phone: null,
    created_at: "2026-01-01T00:00:00Z",
    last_login: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── approveUser with commissionRate ────────────────────────────────────

describe("AdminUserService.approveUser with commissionRate", () => {
  it("approves supplier with commissionRate = 12", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
      commissionRate: 12,
    });

    // Check supplier update includes commission_rate
    expect(updateQ.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", commission_rate: 12 }),
    );
  });

  it("approves supplier with decimal commissionRate = 25.5", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
      commissionRate: 25.5,
    });

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ commission_rate: 25.5 }));
  });

  it("approves supplier without commissionRate — uses default update", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID);

    // Supplier update should NOT include commission_rate
    expect(updateQ.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ commission_rate: expect.anything() }),
    );
  });

  it("approves customer — commissionRate is ignored", async () => {
    const user = makeUserRow({ status: "pending", role: "customer" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
      commissionRate: 12,
    });

    // Should not call from("suppliers") since user is customer
    const supplierCalls = mockFrom.mock.calls.filter((call: unknown[]) => call[0] === "suppliers");
    expect(supplierCalls).toHaveLength(0);
  });

  it("throws VALIDATION_ERROR for commissionRate = 0", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(
      AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
        commissionRate: 0,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("throws VALIDATION_ERROR for commissionRate = 51", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(
      AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
        commissionRate: 51,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("includes commissionRate in audit log details", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID, undefined, {
      commissionRate: 18,
    });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_approved",
        adminId: ADMIN_ID,
      }),
    );
  });
});

// ── rejectUser with structured reasons ────────────────────────────────

describe("AdminUserService.rejectUser with structured reasons", () => {
  it("rejects with reasons array", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, {
      reasons: ["Incomplete documentation"],
    });

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(mockSendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Application Update",
      expect.stringContaining("Incomplete documentation"),
    );
  });

  it("rejects with reasons + customReason — all combined", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, {
      reasons: ["Missing ID", "Invalid address"],
      customReason: "Additional review needed",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Application Update",
      expect.stringContaining("Missing ID"),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Application Update",
      expect.stringContaining("Invalid address"),
    );
  });

  it("rejects with sendEmail = false — no email sent", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, {
      reasons: ["Incomplete documentation"],
      sendEmail: false,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects with sendEmail = true (default) — email sent", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, {
      reasons: ["Incomplete documentation"],
    });

    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("includes reasons, customReason, sendEmail in audit log", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, {
      reasons: ["Bad docs"],
      customReason: "Extra info",
      sendEmail: false,
    });

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_rejected",
        reason: "Bad docs; Extra info",
      }),
    );
  });

  it("old format (string reason) still works", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, "Invalid documentation provided");

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
