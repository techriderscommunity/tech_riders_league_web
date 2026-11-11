import pg from "pg";
import { databaseOptions } from "../src/lib/management/database-options.mjs";

export function connectDatabase() {
  return new pg.Pool(databaseOptions());
}
