import { Client } from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ROLLBACKS_DIR = path.resolve(process.cwd(), "migrations", "rollbacks");
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationName = process.argv[2];

if (!migrationName) {
  console.error("Usage: ts-node scripts/rollback.ts <migration_name>");
  console.error("Example: ts-node scripts/rollback.ts 025_create_audit_logs.sql");
  process.exit(1);
}

const baseName = migrationName.replace(/\.sql$/, "");
const rollbackFile = path.join(ROLLBACKS_DIR, `${baseName}.rollback.sql`);

if (!fs.existsSync(rollbackFile)) {
  console.error(`Rollback file not found: ${rollbackFile}`);
  process.exit(1);
}

async function rollback(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const sqlFileName = baseName.endsWith(".sql") ? baseName : `${baseName}.sql`;

    const applied = await client.query("SELECT name FROM _migrations WHERE name = $1", [
      sqlFileName,
    ]);
    if (applied.rows.length === 0) {
      console.error(`Migration "${sqlFileName}" is not in _migrations. Nothing to roll back.`);
      process.exit(1);
    }

    const sql = fs.readFileSync(rollbackFile, "utf-8");

    console.log(`Rolling back: ${sqlFileName}`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM _migrations WHERE name = $1", [sqlFileName]);
    await client.query("COMMIT");
    console.log(`  Done. Removed "${sqlFileName}" from _migrations.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`Rollback FAILED: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

rollback().catch((err) => {
  console.error(err);
  process.exit(1);
});
