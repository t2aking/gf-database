import { createDatabase } from "./client.js";
import { catalogEntities } from "./schema.js";
import { normalizeName } from "../domain/normalization.js";
import type { CatalogInput } from "../domain/catalog.js";

const samples = [
  {
    kind: "character" as const,
    name: "サンプル剣士",
    element: "fire" as const,
    rarity: "SSR",
    tags: ["attack"],
    details: {
      roles: ["attacker"],
      weaponProficiencies: ["sword"],
      races: ["human"],
    },
  },
  {
    kind: "weapon" as const,
    name: "サンプルソード",
    element: "fire" as const,
    rarity: "SSR",
    tags: ["normal-attack"],
    details: {
      weaponType: "sword",
      skillEffects: ["attack"],
      maxUncapLevel: 4,
    },
  },
  {
    kind: "summon" as const,
    name: "サンプルドラゴン",
    element: "fire" as const,
    rarity: "SSR",
    tags: ["damage-cut"],
    details: {
      auraEffects: ["element-attack"],
      callEffects: ["damage-cut"],
      maxUncapLevel: 4,
    },
  },
] satisfies CatalogInput[];

const connection = createDatabase();

try {
  for (const sample of samples) {
    await connection.db
      .insert(catalogEntities)
      .values({ ...sample, normalizedName: normalizeName(sample.name) })
      .onConflictDoNothing();
  }
  console.info("Inserted fictional sample data.");
} finally {
  await connection.close();
}
