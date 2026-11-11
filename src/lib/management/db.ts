import pg, { type PoolClient } from "pg";
import { databaseOptions } from "./database-options.mjs";

let pool: pg.Pool | undefined;
export function database() {
  if (!pool) {
    pool = new pg.Pool(databaseOptions());
    pool.on("error", (error) => console.error("PostgreSQL pool error", error));
  }
  return pool;
}
export async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
