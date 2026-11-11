import { readFile } from "node:fs/promises";
import { connectDatabase } from "./database.mjs";

const pool = connectDatabase();
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(742027)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const version of ["001-management", "002-operations", "003-github"]) {
    const existing = await client.query("SELECT version FROM schema_migrations WHERE version=$1", [version]);
    if (!existing.rowCount) {
      await client.query(await readFile(new URL(`../database/${version}.sql`, import.meta.url), "utf8"));
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
    }
  }
  await client.query("COMMIT");
  console.log("Database migrations applied.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
