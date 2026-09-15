import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";
import { catalogEntities } from "./schema.js";

describe("catalog schema", () => {
  it("stores required kind details in a non-null JSONB column", () => {
    const columns = getTableColumns(catalogEntities);

    expect(getTableName(catalogEntities)).toBe("catalog_entities");
    expect(columns.details.notNull).toBe(true);
    expect(columns.details.dataType).toBe("json");
  });

  it("does not define fields for article bodies or game images", () => {
    const columnNames = Object.keys(getTableColumns(catalogEntities));

    expect(columnNames).not.toContain("articleBody");
    expect(columnNames).not.toContain("image");
    expect(columnNames).not.toContain("imageUrl");
  });
});
