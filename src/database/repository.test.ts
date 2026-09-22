import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vite-plus/test";
import { CatalogRepository } from "./repository.js";
import type { Database } from "./client.js";
import * as schema from "./schema.js";

describe("battle candidate query", () => {
  it("filters required tags in SQL before limiting owned candidates", async () => {
    const queries: string[] = [];
    const db = drizzle(
      async (sql) => {
        queries.push(sql);
        return { rows: [] };
      },
      { schema },
    );
    const repository = new CatalogRepository(db as unknown as Database);

    await repository.candidates({ requiredTags: ["heal"], strictRequiredTags: true, limit: 200 });

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/"catalog_entities"\."tags"\s*@>/);
    expect(queries[0]).toMatch(/limit\s+\$\d+/i);
  });
});
