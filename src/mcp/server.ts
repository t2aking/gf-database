import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CatalogRepository } from "../database/repository.js";
import { capabilityTagsSchema, elements, entityKinds } from "../domain/catalog.js";
import { sourceStatuses } from "../domain/sources.js";
import { resolveCandidateCriteria } from "../domain/battles.js";

export function createMcpServer(repository: CatalogRepository) {
  const server = new McpServer(
    { name: "gf-database", version: "0.1.0" },
    {
      instructions:
        "Use recommend_owned_formation for a bounded, evidence-based shortlist before proposing a formation. Explain score components, unmet conditions, and warnings. Do not invent missing mechanics or claim optimality.",
    },
  );

  server.registerTool(
    "list_battle_conditions",
    { description: "List locally defined battle conditions for candidate recommendations." },
    async () => {
      const items = await repository.listBattles();
      const payload = { items };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "search_entities",
    {
      description: "Search the local character, weapon, and summon catalog.",
      inputSchema: z.object({
        query: z.string().optional(),
        kind: z.enum(entityKinds).optional(),
        element: z.enum(elements).optional(),
        owned: z.boolean().optional(),
        sourceStatus: z.enum(sourceStatuses).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    },
    async (input) => {
      const items = await repository.search(input);
      const payload = { items };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "get_inventory_summary",
    {
      description: "Count locally owned characters, weapons, and summons.",
    },
    async () => {
      const summary = await repository.inventorySummary();
      const payload = { summary };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "find_owned_candidates",
    {
      description:
        "Rank owned candidates by element and required capability tags before composing advice.",
      inputSchema: z.object({
        kind: z.enum(entityKinds).optional(),
        element: z.enum(elements).optional(),
        requiredTags: capabilityTagsSchema,
        preferredTags: capabilityTagsSchema,
        battleId: z.uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ limit, battleId, ...input }) => {
      const battle = battleId ? await repository.getBattle(battleId) : null;
      if (battleId && !battle)
        return { isError: true, content: [{ type: "text" as const, text: "Battle not found." }] };
      const candidates = (
        await repository.candidates({
          ...(battle ? resolveCandidateCriteria(battle) : input),
          kind: input.kind,
          strictRequiredTags: Boolean(battle),
        })
      ).slice(0, limit);
      const payload = { candidates, ...(battle ? { battle } : {}) };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "recommend_owned_formation",
    {
      description:
        "Return bounded character, weapon, and summon shortlists with score breakdowns, unmet requirements, and warnings. Explain limitations; do not claim optimality.",
      inputSchema: z.object({
        battleId: z.uuid().optional(),
        element: z.enum(elements).optional(),
        requiredTags: capabilityTagsSchema,
        preferredTags: capabilityTagsSchema,
        limitPerKind: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ battleId, limitPerKind, ...input }) => {
      const battle = battleId ? await repository.getBattle(battleId) : null;
      if (battleId && !battle)
        return { isError: true, content: [{ type: "text" as const, text: "Battle not found." }] };
      const recommendation = await repository.recommendations({
        ...(battle ? resolveCandidateCriteria(battle) : input),
        limitPerKind,
      });
      const payload = { recommendation, ...(battle ? { battle } : {}) };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "get_entity_details",
    {
      description:
        "Get local catalog details, inventory, and source references with observation and verification dates. Source notes contain only short facts, never article text or images.",
      inputSchema: z.object({ entityId: z.uuid() }),
    },
    async ({ entityId }) => {
      const item = await repository.get(entityId);
      if (!item)
        return { isError: true, content: [{ type: "text", text: "Catalog item not found." }] };
      const payload = { item };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );
  return server;
}
