import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CatalogDetails } from "../domain/catalog.js";
import type { BattlePurpose } from "../domain/battles.js";

export const entityKind = pgEnum("entity_kind", ["character", "weapon", "summon"]);
export const element = pgEnum("element", [
  "fire",
  "water",
  "earth",
  "wind",
  "light",
  "dark",
  "plain",
]);
export const sourceKind = pgEnum("source_kind", ["gameplay", "official", "guide", "user"]);

export const catalogEntities = pgTable(
  "catalog_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: entityKind("kind").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    element: element("element"),
    rarity: text("rarity"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    details: jsonb("details").$type<CatalogDetails>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("catalog_entities_kind_name_unique").on(table.kind, table.normalizedName),
    index("catalog_entities_name_index").on(table.normalizedName),
    index("catalog_entities_kind_element_index").on(table.kind, table.element),
  ],
);

export const inventoryEntries = pgTable(
  "inventory_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => catalogEntities.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    uncapLevel: integer("uncap_level").notNull().default(0),
    awakeningLevel: integer("awakening_level"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_entries_entity_unique").on(table.entityId),
    check("inventory_quantity_positive", sql`${table.quantity} > 0`),
    check("inventory_uncap_nonnegative", sql`${table.uncapLevel} >= 0`),
  ],
);

export const sourceReferences = pgTable(
  "source_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => catalogEntities.id, { onDelete: "cascade" }),
    kind: sourceKind("kind").notNull(),
    url: text("url"),
    note: text("note"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("source_references_entity_index").on(table.entityId)],
);

export const battleContents = pgTable("battle_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  enemyElement: element("enemy_element"),
  recommendedElement: element("recommended_element"),
  purpose: text("purpose").$type<BattlePurpose>().notNull().default("other"),
  requiredTags: text("required_tags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  preferredTags: text("preferred_tags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CatalogEntity = typeof catalogEntities.$inferSelect;
export type NewCatalogEntity = typeof catalogEntities.$inferInsert;
export type InventoryEntry = typeof inventoryEntries.$inferSelect;
