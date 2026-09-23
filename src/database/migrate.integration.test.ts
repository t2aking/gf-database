import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describe, expect, it } from "vite-plus/test";

const testUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testUrl)("PostgreSQL migrations", () => {
  it("applies every migration to an empty database and can run again", async () => {
    const databaseName = `gf_test_${randomUUID().replaceAll("-", "")}`;
    const admin = postgres(testUrl!, { max: 1 });
    const url = new URL(testUrl!);
    url.pathname = `/${databaseName}`;
    let testClient: ReturnType<typeof postgres> | undefined;

    try {
      await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
      testClient = postgres(url.toString(), { max: 1 });
      const db = drizzle(testClient);
      await migrate(db, { migrationsFolder: "drizzle" });
      await migrate(db, { migrationsFolder: "drizzle" });

      const tables = await testClient.unsafe<{ table_name: string }[]>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('catalog_entities', 'inventory_entries', 'source_references', 'battle_contents') ORDER BY table_name",
      );
      expect(tables.map((row) => row.table_name)).toEqual([
        "battle_contents",
        "catalog_entities",
        "inventory_entries",
        "source_references",
      ]);
      const columns = await testClient.unsafe<{ column_name: string }[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'battle_contents'",
      );
      expect(columns.map((row) => row.column_name)).toEqual(
        expect.arrayContaining([
          "enemy_element",
          "recommended_element",
          "purpose",
          "preferred_tags",
        ]),
      );
      const journal = await testClient.unsafe<{ count: string }[]>(
        "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
      );
      expect(journal[0]?.count).toBe("3");
    } finally {
      await testClient?.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  });
});
