import fs from "fs";
import path from "path";

jest.mock("pg", () => ({
  Client: jest.fn(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  })),
}));

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

describe("Rollback Runner", () => {
  const ROLLBACKS_DIR = path.resolve(process.cwd(), "migrations", "rollbacks");

  describe("rollback files", () => {
    it("all rollback files have matching migration files", () => {
      const rollbackFiles = fs
        .readdirSync(ROLLBACKS_DIR)
        .filter((f) => f.endsWith(".rollback.sql"));

      const migrationsDir = path.resolve(process.cwd(), "migrations");
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f));

      for (const rollback of rollbackFiles) {
        const migrationName = rollback.replace(".rollback.sql", ".sql");
        expect(migrationFiles).toContain(migrationName);
      }
    });

    it("rollback files contain valid SQL", () => {
      const rollbackFiles = fs
        .readdirSync(ROLLBACKS_DIR)
        .filter((f) => f.endsWith(".rollback.sql"));

      expect(rollbackFiles.length).toBeGreaterThan(0);

      for (const file of rollbackFiles) {
        const content = fs.readFileSync(path.join(ROLLBACKS_DIR, file), "utf-8").trim();
        expect(content.length).toBeGreaterThan(0);
        // Each rollback should contain SQL statements
        expect(content).toMatch(/DROP|ALTER|SELECT|DELETE/i);
      }
    });

    it("Sprint 4/4.5 rollbacks exist (024-031)", () => {
      const expectedRollbacks = [
        "024_create_notifications.rollback.sql",
        "025_create_audit_logs.rollback.sql",
        "026_create_password_reset_tokens.rollback.sql",
        "027_email_verification.rollback.sql",
        "028_add_product_original_price.rollback.sql",
        "029_add_paypal_fields.rollback.sql",
        "030_create_credit_and_invoices.rollback.sql",
        "031_performance_indexes.rollback.sql",
      ];

      for (const expected of expectedRollbacks) {
        expect(fs.existsSync(path.join(ROLLBACKS_DIR, expected))).toBe(true);
      }
    });

    it("025_create_audit_logs rollback drops audit_logs table", () => {
      const content = fs.readFileSync(
        path.join(ROLLBACKS_DIR, "025_create_audit_logs.rollback.sql"),
        "utf-8",
      );
      expect(content).toContain("DROP TABLE IF EXISTS audit_logs");
    });

    it("030_create_credit_and_invoices rollback drops tables and functions", () => {
      const content = fs.readFileSync(
        path.join(ROLLBACKS_DIR, "030_create_credit_and_invoices.rollback.sql"),
        "utf-8",
      );
      expect(content).toContain("DROP FUNCTION IF EXISTS deduct_credit");
      expect(content).toContain("DROP FUNCTION IF EXISTS restore_credit");
      expect(content).toContain("DROP TABLE IF EXISTS invoices");
      expect(content).toContain("DROP TABLE IF EXISTS user_credit");
    });

    it("027_email_verification rollback drops table and column", () => {
      const content = fs.readFileSync(
        path.join(ROLLBACKS_DIR, "027_email_verification.rollback.sql"),
        "utf-8",
      );
      expect(content).toContain("DROP TABLE IF EXISTS email_verification_tokens");
      expect(content).toContain("ALTER TABLE users DROP COLUMN IF EXISTS email_verified");
    });
  });
});
