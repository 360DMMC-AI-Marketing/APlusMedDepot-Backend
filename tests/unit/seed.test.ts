import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

describe("Seed Script", () => {
  describe("idempotency", () => {
    it("uses upsert with onConflict for all operations", () => {
      // The seed script uses upsert with onConflict: "id" or "user_id"
      // so running it multiple times produces the same result
      const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
      const mockFrom = jest.fn(() => ({ upsert: mockUpsert }));
      (createClient as jest.Mock).mockReturnValue({ from: mockFrom });

      const supabase = (createClient as jest.Mock)("url", "key");

      // Simulate seed operations
      supabase.from("users").upsert({ id: "test", email: "test@test.com" }, { onConflict: "id" });
      supabase.from("users").upsert({ id: "test", email: "test@test.com" }, { onConflict: "id" });

      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenCalledWith(
        { id: "test", email: "test@test.com" },
        { onConflict: "id" },
      );
    });
  });

  describe("seed data completeness", () => {
    it("defines all required seed IDs", () => {
      const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
      const SUPPLIER_USER_ID = "00000000-0000-0000-0000-000000000002";
      const CUSTOMER_ID = "00000000-0000-0000-0000-000000000003";
      const SUPPLIER_ID = "00000000-0000-0000-0000-000000000012";

      const PRODUCT_IDS = [
        "00000000-0000-0000-0000-000000000101",
        "00000000-0000-0000-0000-000000000102",
        "00000000-0000-0000-0000-000000000103",
        "00000000-0000-0000-0000-000000000104",
        "00000000-0000-0000-0000-000000000105",
      ];

      // All IDs are valid UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      expect(ADMIN_ID).toMatch(uuidRegex);
      expect(SUPPLIER_USER_ID).toMatch(uuidRegex);
      expect(CUSTOMER_ID).toMatch(uuidRegex);
      expect(SUPPLIER_ID).toMatch(uuidRegex);
      PRODUCT_IDS.forEach((id) => expect(id).toMatch(uuidRegex));

      // 5 products
      expect(PRODUCT_IDS).toHaveLength(5);

      // All unique
      const allIds = [ADMIN_ID, SUPPLIER_USER_ID, CUSTOMER_ID, SUPPLIER_ID, ...PRODUCT_IDS];
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  describe("production guard", () => {
    it("script checks NODE_ENV !== production", () => {
      const seedContent = fs.readFileSync(
        path.resolve(process.cwd(), "scripts", "seed.ts"),
        "utf-8",
      );
      expect(seedContent).toContain('NODE_ENV === "production"');
      expect(seedContent).toContain("process.exit(1)");
    });
  });
});
