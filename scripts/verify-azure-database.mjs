import { connectDatabase } from "./database.mjs";
import { assertExpectedMigrations, DATABASE_MIGRATIONS } from "./database-migrations.mjs";

const pool = connectDatabase();
try {
  const migrations = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  assertExpectedMigrations(migrations.rows.map(r => r.version));
  const result = await pool.query("SELECT pg_has_role(current_user,'azure_pg_admin','member') AS admin, ssl, version FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
  if (result.rows[0]?.admin || !result.rows[0]?.ssl) throw new Error("Runtime database access must be non-admin and use TLS.");
  if (process.env.REGISTRATION_ENABLED !== "false") throw new Error("Registration must remain disabled in this test deployment.");
  console.log(JSON.stringify({ migrations: DATABASE_MIGRATIONS.length, runtimeAdmin: false, tls: result.rows[0].version, registrationEnabled: false }));
} finally {
  await pool.end();
}
