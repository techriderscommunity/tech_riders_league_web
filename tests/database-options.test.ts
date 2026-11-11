import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { databaseOptions, managedIdentityToken } from "../src/lib/management/database-options.mjs";

test("Database auth preserves local passwords and requires verified TLS for managed identity", async () => {
  const keys = ["DATABASE_URL", "DATABASE_SSL", "DATABASE_AUTH", "AZURE_CLIENT_ID", "IDENTITY_ENDPOINT", "IDENTITY_HEADER", "NODE_ENV"];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.DATABASE_URL = "postgresql://local:fixture@localhost/league";
    process.env.DATABASE_SSL = "false";
    process.env.DATABASE_AUTH = "password";
    assert.equal(databaseOptions().password, undefined);
    assert.equal(databaseOptions().connectionTimeoutMillis, 5000);
    process.env.DATABASE_AUTH = "managed-identity";
    assert.throws(databaseOptions, /verified TLS/);
    process.env.DATABASE_SSL = "true";
    process.env.AZURE_CLIENT_ID = "fixture-id";
    assert.throws(databaseOptions, /password-free/);
    process.env.DATABASE_URL = "postgresql://runtime@private.postgres.database.azure.com/league";
    const options = databaseOptions();
    assert.equal(options.connectionTimeoutMillis, 60000);
    assert.deepEqual(options.ssl, { rejectUnauthorized: true });
    const client = new pg.Client(options);
    assert.equal(client.password, options.password);
    assert.equal(client.host, "private.postgres.database.azure.com");
    assert.equal(client.user, "runtime");
    assert.equal(client.database, "league");
    const bootstrap = new pg.Client(databaseOptions("postgresql://bootstrap@private.postgres.database.azure.com/postgres"));
    assert.equal(bootstrap.user, "bootstrap");
    assert.equal(bootstrap.database, "postgres");
    assert.throws(() => databaseOptions("postgresql://runtime@private.postgres.database.azure.com/league?sslmode=disable"), /query parameters/);
    process.env.IDENTITY_ENDPOINT = "http://127.0.0.1:12345/token";
    process.env.IDENTITY_HEADER = "fixture-header";
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("resource"), "https://ossrdbms-aad.database.windows.net");
      assert.equal(url.searchParams.get("client_id"), "fixture-id");
      assert.equal(new Headers(init?.headers).get("X-IDENTITY-HEADER"), "fixture-header");
      return Response.json({ access_token: `fixture-${calls}` });
    };
    assert.equal(await options.password!(), "fixture-1");
    assert.equal(await options.password!(), "fixture-2");
    globalThis.fetch = async () => Response.json({}, { status: 403 });
    await assert.rejects(managedIdentityToken("fixture-id"), /HTTP 403/);
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(managedIdentityToken("fixture-id"), /database token/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
    }
  }
});
