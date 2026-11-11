import { readFileSync } from "node:fs";

export async function managedIdentityToken(clientId) {
  if (!process.env.IDENTITY_ENDPOINT || !process.env.IDENTITY_HEADER || !clientId) {
    throw new Error("Managed identity endpoint, header and client ID are required.");
  }
  const endpoint = new URL(process.env.IDENTITY_ENDPOINT);
  endpoint.searchParams.set("api-version", "2019-08-01");
  endpoint.searchParams.set("resource", "https://ossrdbms-aad.database.windows.net");
  endpoint.searchParams.set("client_id", clientId);
  const response = await fetch(endpoint, {
    headers: { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Managed identity token request failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (typeof result.access_token !== "string" || !result.access_token) {
    throw new Error("Managed identity did not return a database token.");
  }
  return result.access_token;
}

export function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const url = new URL(connectionString);
  const auth = process.env.DATABASE_AUTH ?? "password";
  if (!["password", "managed-identity"].includes(auth)) throw new Error("Unsupported DATABASE_AUTH.");
  const tls = process.env.DATABASE_SSL === "true";
  if ((process.env.NODE_ENV === "production" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || auth === "managed-identity") && !tls) {
    throw new Error("Production database connections require verified TLS.");
  }
  if (auth === "managed-identity" && (url.password || !process.env.AZURE_CLIENT_ID)) {
    throw new Error("Managed identity requires AZURE_CLIENT_ID and a password-free database URL.");
  }
  if (auth === "managed-identity" && url.search) {
    throw new Error("Managed identity database options must use environment settings, not URL query parameters.");
  }
  return {
    ...(auth === "managed-identity" ? {
      host: url.hostname,
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.slice(1)),
    } : { connectionString }),
    max: 5,
    connectionTimeoutMillis: auth === "managed-identity" ? 60000 : 5000,
    ssl: tls ? {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_CA_FILE ? { ca: readFileSync(process.env.DATABASE_CA_FILE, "utf8") } : {}),
    } : undefined,
    ...(auth === "managed-identity" ? { password: () => managedIdentityToken(process.env.AZURE_CLIENT_ID) } : {}),
  };
}
