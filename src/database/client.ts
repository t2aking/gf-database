import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "../config.js";
import * as schema from "./schema.js";

export function createDatabase(url = getDatabaseUrl()) {
  const client = postgres(url, { max: 5 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
