import { connectDatabase } from "./database.mjs";

const pool = connectDatabase();
try {
  const migrations = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  const expected = ["001-management", "002-operations", "003-github"];
  if (JSON.stringify(migrations.rows.map(r => r.version)) !== JSON.stringify(expected)) throw new Error("Unexpected database migration state.");
  const result = await pool.query("SELECT pg_has_role(current_user,'azure_pg_admin','member') AS admin, ssl, version FROM pg_stat_ssl WHERE pid=pg_backend_pid()");
  if (result.rows[0]?.admin || !result.rows[0]?.ssl) throw new Error("Runtime database access must be non-admin and use TLS.");
  if (process.env.REGISTRATION_ENABLED !== "false") throw new Error("Registration must remain disabled in this test deployment.");
  console.log(JSON.stringify({ migrations: 3, runtimeAdmin: false, tls: result.rows[0].version, registrationEnabled: false }));
} finally {
  await pool.end();
}
