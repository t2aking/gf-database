import { and, arrayContains, eq, ilike, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  CatalogInput,
  CatalogUpdate,
  Element,
  EntityKind,
  InventoryInput,
} from "../domain/catalog.js";
import { catalogUpdateSchema } from "../domain/catalog.js";
import { parseImportCsv, type ImportPreview } from "../domain/csv-import.js";
import { exportCatalogCsv } from "../domain/csv-export.js";
import { rankOwnedCandidates } from "../domain/catalog.js";
import { sourceReviewCutoff, type SourceInput, type SourceStatus } from "../domain/sources.js";
import { normalizeName, normalizeTags } from "../domain/normalization.js";
import type { BattleInput } from "../domain/battles.js";
import { recommendOwned, type RecommendationCriteria } from "../domain/recommendations.js";
import type { Database } from "./client.js";
import { battleContents, catalogEntities, inventoryEntries, sourceReferences } from "./schema.js";

export type CatalogSearch = {
  query?: string;
  kind?: EntityKind;
  element?: Element;
  owned?: boolean;
  sourceStatus?: SourceStatus;
  requiredTags?: string[];
  limit?: number;
};

export class CatalogRepository {
  constructor(private readonly db: Database) {}

  listBattles() {
    return this.db.select().from(battleContents).orderBy(battleContents.name);
  }

  async getBattle(id: string) {
    const [battle] = await this.db.select().from(battleContents).where(eq(battleContents.id, id));
    return battle ?? null;
  }

  async createBattle(input: BattleInput) {
    const [battle] = await this.db.insert(battleContents).values(input).returning();
    if (!battle) throw new Error("Failed to create battle condition.");
    return battle;
  }

  async updateBattle(id: string, input: BattleInput) {
    const [battle] = await this.db
      .update(battleContents)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(battleContents.id, id))
      .returning();
    return battle ?? null;
  }

  async deleteBattle(id: string) {
    const [battle] = await this.db
      .delete(battleContents)
      .where(eq(battleContents.id, id))
      .returning({ id: battleContents.id });
    return battle ?? null;
  }

  async search(options: CatalogSearch = {}) {
    const sourceCount = sql<number>`(select count(*)::int from ${sourceReferences} where ${sourceReferences.entityId} = ${catalogEntities.id})`;
    const lastConfirmedAt =
      sql<Date | null>`(select max(greatest(${sourceReferences.observedAt}, ${sourceReferences.verifiedAt})) from ${sourceReferences} where ${sourceReferences.entityId} = ${catalogEntities.id})`.mapWith(
        sourceReferences.observedAt,
      );
    const sourceStatus = sql<SourceStatus>`case when ${sourceCount} = 0 then 'missing' when ${lastConfirmedAt} <= ${sourceReviewCutoff().toISOString()} then 'stale' else 'current' end`;
    const conditions = [];
    if (options.sourceStatus) conditions.push(sql`${sourceStatus} = ${options.sourceStatus}`);
    if (options.query)
      conditions.push(ilike(catalogEntities.normalizedName, `%${normalizeName(options.query)}%`));
    if (options.kind) conditions.push(eq(catalogEntities.kind, options.kind));
    if (options.element) conditions.push(eq(catalogEntities.element, options.element));
    if (options.requiredTags?.length)
      conditions.push(arrayContains(catalogEntities.tags, normalizeTags(options.requiredTags)));
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
        details: catalogEntities.details,
        metadata: catalogEntities.metadata,
        owned: inventoryEntries.id,
        quantity: inventoryEntries.quantity,
        uncapLevel: inventoryEntries.uncapLevel,
        awakeningLevel: inventoryEntries.awakeningLevel,
        notes: inventoryEntries.notes,
        updatedAt: catalogEntities.updatedAt,
        sourceCount,
        lastConfirmedAt,
        sourceStatus,
      })
      .from(catalogEntities)
      .leftJoin(inventoryEntries, eq(inventoryEntries.entityId, catalogEntities.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(catalogEntities.kind, catalogEntities.name)
      .limit(Math.min(options.limit ?? 100, 500));
  }

  async exportCatalog() {
    const rows = await this.db
      .select({
        kind: catalogEntities.kind,
        name: catalogEntities.name,
        element: catalogEntities.element,
        rarity: catalogEntities.rarity,
        tags: catalogEntities.tags,
        details: catalogEntities.details,
        ownedId: inventoryEntries.id,
        quantity: inventoryEntries.quantity,
        uncapLevel: inventoryEntries.uncapLevel,
        awakeningLevel: inventoryEntries.awakeningLevel,
        notes: inventoryEntries.notes,
      })
      .from(catalogEntities)
      .leftJoin(inventoryEntries, eq(inventoryEntries.entityId, catalogEntities.id))
      .orderBy(catalogEntities.kind, catalogEntities.name, catalogEntities.id);
    return {
      total: rows.length,
      files: exportCatalogCsv(
        rows.map(({ ownedId, ...row }) => ({ ...row, owned: ownedId !== null })),
      ),
    };
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
          details: input.details,
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
          verifiedAt: input.source.verifiedAt ? new Date(input.source.verifiedAt) : null,
        });
      }

      return entity;
    });
  }

  async get(entityId: string) {
    const [entity] = await this.db
      .select()
      .from(catalogEntities)
      .where(eq(catalogEntities.id, entityId));
    if (!entity) return null;
    const [inventory] = await this.db
      .select()
      .from(inventoryEntries)
      .where(eq(inventoryEntries.entityId, entityId));
    const sources = await this.db
      .select()
      .from(sourceReferences)
      .where(eq(sourceReferences.entityId, entityId))
      .orderBy(sourceReferences.createdAt, sourceReferences.id);
    return { ...entity, inventory: inventory ?? null, sources };
  }

  async update(entityId: string, input: CatalogUpdate) {
    const [entity] = await this.db
      .update(catalogEntities)
      .set({
        kind: input.kind,
        name: input.name,
        normalizedName: normalizeName(input.name),
        element: input.element ?? null,
        rarity: input.rarity ?? null,
        tags: input.tags,
        details: input.details,
        updatedAt: new Date(),
      })
      .where(eq(catalogEntities.id, entityId))
      .returning();
    return entity ?? null;
  }

  async delete(entityId: string) {
    // PostgreSQL cascades inventory and source references atomically.
    const [entity] = await this.db
      .delete(catalogEntities)
      .where(eq(catalogEntities.id, entityId))
      .returning({ id: catalogEntities.id });
    return entity ?? null;
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
        awakeningLevel: input.awakeningLevel ?? null,
        notes: input.notes ?? null,
      })
      .onConflictDoUpdate({
        target: inventoryEntries.entityId,
        set: {
          quantity: input.quantity,
          uncapLevel: input.uncapLevel,
          awakeningLevel: input.awakeningLevel ?? null,
          notes: input.notes ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return entry ?? null;
  }

  async listSources(entityId: string) {
    const detail = await this.get(entityId);
    return detail?.sources ?? null;
  }

  async createSource(entityId: string, input: SourceInput) {
    const [source] = await this.db
      .insert(sourceReferences)
      .values({
        entityId,
        kind: input.kind,
        url: input.url ?? null,
        note: input.note ?? null,
        observedAt: new Date(input.observedAt),
        verifiedAt: input.verifiedAt ? new Date(input.verifiedAt) : null,
      })
      .returning();
    return source ?? null;
  }

  async updateSource(entityId: string, sourceId: string, input: SourceInput) {
    const [source] = await this.db
      .update(sourceReferences)
      .set({
        kind: input.kind,
        url: input.url ?? null,
        note: input.note ?? null,
        observedAt: new Date(input.observedAt),
        verifiedAt: input.verifiedAt ? new Date(input.verifiedAt) : null,
      })
      .where(and(eq(sourceReferences.entityId, entityId), eq(sourceReferences.id, sourceId)))
      .returning();
    return source ?? null;
  }

  async deleteSource(entityId: string, sourceId: string) {
    const [source] = await this.db
      .delete(sourceReferences)
      .where(and(eq(sourceReferences.entityId, entityId), eq(sourceReferences.id, sourceId)))
      .returning({ id: sourceReferences.id });
    return source ?? null;
  }

  private async prepareImport(csv: string, db: Pick<Database, "select"> = this.db) {
    const parsed = parseImportCsv(csv);
    const errors = [...parsed.errors];
    const ready = [];
    const items: ImportPreview["items"] = [];
    for (const row of parsed.rows) {
      const [existing] = await db
        .select()
        .from(catalogEntities)
        .where(
          and(
            eq(catalogEntities.kind, row.catalog.kind),
            eq(catalogEntities.normalizedName, normalizeName(row.catalog.name)),
          ),
        );
      const catalog = catalogUpdateSchema.safeParse({
        ...row.catalog,
        details: row.catalog.details ?? existing?.details,
      });
      if (!catalog.success) {
        for (const issue of catalog.error.issues)
          errors.push({
            line: row.line,
            field: issue.path.join(".") || "catalog",
            message:
              issue.path[0] === "details" && !row.catalog.details && !existing
                ? "新規登録ではdetailsが必須です。"
                : issue.message,
          });
        continue;
      }
      ready.push({
        catalog: catalog.data,
        inventory: row.inventory,
        preserveDetails: row.catalog.details === undefined,
      });
      items.push({
        line: row.line,
        kind: catalog.data.kind,
        name: catalog.data.name,
        action: existing ? "update" : "create",
        owned: row.inventory.owned,
        quantity: row.inventory.quantity,
      });
    }
    const preview: ImportPreview = {
      total: parsed.total,
      newCount: items.filter((item) => item.action === "create").length,
      updateCount: items.filter((item) => item.action === "update").length,
      errorCount: new Set(errors.map((error) => error.line)).size,
      errors,
      items,
    };
    return { preview, ready };
  }

  async previewImport(csv: string) {
    return (await this.prepareImport(csv)).preview;
  }

  async applyImport(csv: string, authorize: (preview: ImportPreview) => boolean) {
    return this.db.transaction(
      async (tx) => {
        const { preview, ready } = await this.prepareImport(csv, tx);
        if (preview.errors.length) return { preview, applied: false, conflict: false };
        if (!authorize(preview)) return { preview, applied: false, conflict: true };
        for (const { catalog, inventory, preserveDetails } of ready) {
          const values = {
            kind: catalog.kind,
            name: catalog.name,
            normalizedName: normalizeName(catalog.name),
            element: catalog.element ?? null,
            rarity: catalog.rarity ?? null,
            tags: catalog.tags,
            details: catalog.details,
          };
          const [entity] = await tx
            .insert(catalogEntities)
            .values(values)
            .onConflictDoUpdate({
              target: [catalogEntities.kind, catalogEntities.normalizedName],
              set: {
                ...values,
                details: preserveDetails ? sql`${catalogEntities.details}` : values.details,
                updatedAt: new Date(),
              },
            })
            .returning({ id: catalogEntities.id });
          if (!entity) throw new Error("Import write failed.");
          if (!inventory.owned)
            await tx.delete(inventoryEntries).where(eq(inventoryEntries.entityId, entity.id));
          else {
            const values = {
              entityId: entity.id,
              quantity: inventory.quantity,
              uncapLevel: inventory.uncapLevel,
              awakeningLevel: inventory.awakeningLevel ?? null,
              notes: inventory.notes ?? null,
            };
            await tx
              .insert(inventoryEntries)
              .values(values)
              .onConflictDoUpdate({
                target: inventoryEntries.entityId,
                set: { ...values, updatedAt: new Date() },
              });
          }
        }
        return { preview, applied: true, conflict: false };
      },
      { isolationLevel: "serializable" },
    );
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
    preferredTags?: string[];
    strictRequiredTags?: boolean;
    limit?: number;
  }) {
    const rows = await this.search({
      kind: options.kind,
      element: undefined,
      owned: true,
      requiredTags: options.strictRequiredTags ? options.requiredTags : undefined,
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

  async recommendations(criteria: RecommendationCriteria) {
    const rows = await this.db
      .select({
        id: catalogEntities.id,
        kind: catalogEntities.kind,
        name: catalogEntities.name,
        element: catalogEntities.element,
        tags: catalogEntities.tags,
        quantity: inventoryEntries.quantity,
        uncapLevel: inventoryEntries.uncapLevel,
      })
      .from(catalogEntities)
      .innerJoin(inventoryEntries, eq(inventoryEntries.entityId, catalogEntities.id));
    return recommendOwned(rows, criteria);
  }
}
