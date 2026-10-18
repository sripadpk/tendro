import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing from api/.env");
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10000,
});

async function main() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const filename = "001_initial_schema.sql";

    const existing = await client.query(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [filename]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      await client.query("COMMIT");
      console.log(`Migration ${filename} already applied.`);
      return;
    }

    const sql = await readFile(
      new URL("./migrations/001_initial_schema.sql", import.meta.url),
      "utf8"
    );

    await client.query(sql);

    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );

    await client.query("COMMIT");
    console.log(`Migration ${filename} applied successfully.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
