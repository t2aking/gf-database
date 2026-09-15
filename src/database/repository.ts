import { and, eq, ilike, isNotNull, isNull } from "drizzle-orm";
import type { CatalogInput, Element, EntityKind, InventoryInput } from "../domain/catalog.js";
import { rankOwnedCandidates } from "../domain/catalog.js";
import { normalizeName } from "../domain/normalization.js";
import type { Database } from "./client.js";
import { catalogEntities, inventoryEntries, sourceReferences } from "./schema.js";

export type CatalogSearch = {
  query?: string;
  kind?: EntityKind;
  element?: Element;
  owned?: boolean;
  limit?: number;
};

export class CatalogRepository {
  constructor(private readonly db: Database) {}

  async search(options: CatalogSearch = {}) {
    const conditions = [];
    if (options.query)
      conditions.push(ilike(catalogEntities.normalizedName, `%${normalizeName(options.query)}%`));
    if (options.kind) conditions.push(eq(catalogEntities.kind, options.kind));
    if (options.element) conditions.push(eq(catalogEntities.element, options.element));
    if (options.owned === true) conditions.push(isNotNull(inventoryEntries.id));
    if (options.owned === false) conditions.push(isNull(inventoryEntries.id));

    return this.db
      .select({
        id: catalogEntities.id,
        kind: catalogEntities.kind,
        name: catalogEntities.name,
        element: catalogEntities.element,
        rarity: catalogEntities.rarity,
        tags: catalogEntities.tags,
        metadata: catalogEntities.metadata,
        owned: inventoryEntries.id,
        quantity: inventoryEntries.quantity,
        uncapLevel: inventoryEntries.uncapLevel,
        awakeningLevel: inventoryEntries.awakeningLevel,
        notes: inventoryEntries.notes,
        updatedAt: catalogEntities.updatedAt,
      })
      .from(catalogEntities)
      .leftJoin(inventoryEntries, eq(inventoryEntries.entityId, catalogEntities.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(catalogEntities.kind, catalogEntities.name)
      .limit(Math.min(options.limit ?? 100, 500));
  }

  async create(input: CatalogInput) {
    return this.db.transaction(async (tx) => {
      const [entity] = await tx
        .insert(catalogEntities)
        .values({
          kind: input.kind,
          name: input.name,
          normalizedName: normalizeName(input.name),
          element: input.element,
          rarity: input.rarity,
          tags: input.tags,
        })
        .returning();

      if (!entity) throw new Error("Failed to create catalog entity.");

      if (input.source) {
        await tx.insert(sourceReferences).values({
          entityId: entity.id,
          kind: input.source.kind,
          url: input.source.url,
          note: input.source.note,
          observedAt: new Date(input.source.observedAt),
        });
      }

      return entity;
    });
  }

  async setInventory(entityId: string, input: InventoryInput) {
    if (!input.owned) {
      await this.db.delete(inventoryEntries).where(eq(inventoryEntries.entityId, entityId));
      return null;
    }

    const [entry] = await this.db
      .insert(inventoryEntries)
      .values({
        entityId,
        quantity: input.quantity,
        uncapLevel: input.uncapLevel,
        awakeningLevel: input.awakeningLevel,
        notes: input.notes,
      })
      .onConflictDoUpdate({
        target: inventoryEntries.entityId,
        set: {
          quantity: input.quantity,
          uncapLevel: input.uncapLevel,
          awakeningLevel: input.awakeningLevel,
          notes: input.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return entry ?? null;
  }

  async inventorySummary() {
    const rows = await this.search({ owned: true, limit: 500 });
    return rows.reduce(
      (summary, row) => {
        summary.total += 1;
        summary[row.kind] += 1;
        return summary;
      },
      { total: 0, character: 0, weapon: 0, summon: 0 },
    );
  }

  async candidates(options: {
    kind?: EntityKind;
    element?: Element;
    requiredTags?: string[];
    limit?: number;
  }) {
    const rows = await this.search({
      kind: options.kind,
      element: undefined,
      owned: true,
      limit: options.limit ?? 200,
    });
    return rankOwnedCandidates(
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        element: row.element,
        tags: row.tags,
        quantity: row.quantity ?? 1,
        uncapLevel: row.uncapLevel ?? 0,
      })),
      options,
    );
  }
}
