import pg from "pg";
import { databaseOptions, managedIdentityToken } from "../src/lib/management/database-options.mjs";

if (process.env.MIGRATION_CLIENT_ID) {
  const role = process.env.DATABASE_USER;
  const oid = process.env.DATABASE_PRINCIPAL_ID;
  const admin = process.env.MIGRATION_DATABASE_USER;
  if (!role || !oid || !admin || !process.env.DATABASE_URL) throw new Error("Incomplete database bootstrap configuration.");
  const identifier = value => `"${value.replaceAll('"', '""')}"`;
  const url = new URL(process.env.DATABASE_URL);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  url.username = admin;
  url.pathname = "/postgres";
  const options = {
    ...databaseOptions(url.toString()),
    password: () => managedIdentityToken(process.env.MIGRATION_CLIENT_ID),
  };
  const pool = new pg.Pool(options);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(742029)");
    const existing = await client.query(
      "SELECT object_id FROM pg_catalog.pgaadauth_list_principals(false) AS principals(role_name,principal_type,object_id,tenant_id,is_mfa,is_admin) WHERE role_name=$1",
      [role],
    );
    if (existing.rows.length && existing.rows[0].object_id !== oid) throw new Error("Database principal identity does not match.");
    if (!existing.rows.length) {
      await client.query("SELECT pg_catalog.pgaadauth_create_principal_with_oid($1,$2,'service',false,false)", [role, oid]);
    }
    await client.query(`GRANT CONNECT, CREATE ON DATABASE ${identifier(dbName)} TO ${identifier(role)}`);
    console.log("Managed database principal initialized.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(742029)");
    client.release();
    await pool.end();
  }
  url.pathname = `/${dbName}`;
  const schemaPool = new pg.Pool({
    ...databaseOptions(url.toString()),
    password: options.password,
  });
  try {
    await schemaPool.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${identifier(role)}`);
  } finally {
    await schemaPool.end();
  }
}
