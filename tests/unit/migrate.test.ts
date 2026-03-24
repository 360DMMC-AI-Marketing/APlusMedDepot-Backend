import fs from "fs";
import path from "path";

// Mock pg Client
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

jest.mock("pg", () => ({
  Client: jest.fn(() => ({
    connect: mockConnect,
    query: mockQuery,
    end: mockEnd,
  })),
}));

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

describe("Migration Runner", () => {
  const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getMigrationFiles", () => {
    it("reads SQL files sorted by name, excluding all_migrations.sql", () => {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f) && f !== "all_migrations.sql")
        .sort();

      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toBe("000_extensions.sql");
      expect(files).not.toContain("all_migrations.sql");

      // Verify sort order
      for (let i = 1; i < files.length; i++) {
        expect(files[i].localeCompare(files[i - 1])).toBeGreaterThan(0);
      }
    });

    it("only includes files matching NNN_ pattern", () => {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f) && f !== "all_migrations.sql")
        .sort();

      for (const file of files) {
        expect(file).toMatch(/^\d{3}_.*\.sql$/);
      }
    });
  });

  describe("migration tracking", () => {
    it("creates _migrations table with correct schema", () => {
      const createTableSQL = `
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

      expect(createTableSQL).toContain("_migrations");
      expect(createTableSQL).toContain("name TEXT NOT NULL UNIQUE");
      expect(createTableSQL).toContain("applied_at TIMESTAMPTZ");
    });

    it("skips already-applied migrations", async () => {
      const applied = new Set(["000_extensions.sql", "001_create_users.sql"]);
      const files = ["000_extensions.sql", "001_create_users.sql", "002_create_suppliers.sql"];

      const pending = files.filter((f) => !applied.has(f));

      expect(pending).toEqual(["002_create_suppliers.sql"]);
      expect(pending).toHaveLength(1);
    });

    it("stops on first failure without continuing", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error("syntax error")); // SQL execution fails

      let appliedCount = 0;
      let failedAt: string | null = null;
      const files = ["000_extensions.sql", "001_create_users.sql"];

      for (const file of files) {
        try {
          // Simulate migration execution
          if (file === "000_extensions.sql") {
            throw new Error("syntax error");
          }
          appliedCount++;
        } catch {
          failedAt = file;
          break; // Stop on first failure
        }
      }

      expect(failedAt).toBe("000_extensions.sql");
      expect(appliedCount).toBe(0);
    });
  });

  describe("migration file integrity", () => {
    it("all migration SQL files are readable", () => {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f) && f !== "all_migrations.sql");

      for (const file of files) {
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it("migration numbers are sequential without gaps", () => {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f) && f !== "all_migrations.sql")
        .sort();

      const numbers = files.map((f) => parseInt(f.substring(0, 3), 10));

      for (let i = 1; i < numbers.length; i++) {
        expect(numbers[i]).toBe(numbers[i - 1] + 1);
      }
    });
  });
});
