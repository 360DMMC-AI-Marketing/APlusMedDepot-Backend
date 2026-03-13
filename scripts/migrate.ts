import { Client } from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function getClient(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && /^\d{3}_/.test(f) && f !== "all_migrations.sql")
    .sort();
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const result = await client.query("SELECT name FROM _migrations ORDER BY name");
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

async function showStatus(): Promise<void> {
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();

    console.log(`\nMigration Status (${files.length} total):\n`);
    for (const file of files) {
      const status = applied.has(file) ? "applied" : "pending";
      const marker = status === "applied" ? "[x]" : "[ ]";
      console.log(`  ${marker} ${file}`);
    }

    const appliedCount = files.filter((f) => applied.has(f)).length;
    const pendingCount = files.length - appliedCount;
    console.log(`\n  ${appliedCount} applied, ${pendingCount} pending\n`);
  } finally {
    await client.end();
  }
}

async function runMigrations(): Promise<void> {
  const client = await getClient();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        skippedCount++;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      console.log(`Applying: ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        appliedCount++;
        console.log(`  Done.`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  FAILED: ${(err as Error).message}`);
        console.error(`\nStopping. Fix the error and re-run.`);
        process.exit(1);
      }
    }

    console.log(`\n${appliedCount} applied, ${skippedCount} skipped, ${files.length} total`);
  } finally {
    await client.end();
  }
}

const isStatusMode = process.argv.includes("--status");

if (isStatusMode) {
  showStatus().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
