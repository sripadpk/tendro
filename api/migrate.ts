
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationDirectory = new URL("./migrations/", import.meta.url);

    const files = (await readdir(migrationDirectory))
      .filter((filename) => /^\d+.*\.sql$/.test(filename))
      .sort((a, b) => a.localeCompare(b, undefined, {
        numeric: true,
      }));

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const filename of files) {
      let inTransaction = false;

      try {
        await client.query("BEGIN");
        inTransaction = true;

        const existing = await client.query(
          "SELECT filename FROM schema_migrations WHERE filename = $1",
          [filename],
        );

        if (existing.rowCount && existing.rowCount > 0) {
          await client.query("COMMIT");
          inTransaction = false;
          console.log(`Migration ${filename} already applied.`);
          continue;
        }

        const sql = await readFile(
          new URL(filename, migrationDirectory),
          "utf8",
        );

        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );

        await client.query("COMMIT");
        inTransaction = false;
        console.log(`Migration ${filename} applied successfully.`);
      } catch (error) {
        if (inTransaction) {
          await client.query("ROLLBACK");
        }

        throw new Error(`Failed to apply ${filename}`, {
          cause: error,
        });
      }
    }
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    if (error instanceof Error && error.cause) {
      console.error("Cause:", error.cause);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
