import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client.js";

const connection = createDatabase();

try {
  await migrate(connection.db, { migrationsFolder: "drizzle" });
  console.info("Database migrations completed.");
} finally {
  await connection.close();
}
