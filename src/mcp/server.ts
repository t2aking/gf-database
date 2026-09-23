import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CatalogRepository } from "../database/repository.js";
import { capabilityTagsSchema, elements, entityKinds } from "../domain/catalog.js";
import { sourceStatuses } from "../domain/sources.js";
import { resolveCandidateCriteria } from "../domain/battles.js";

class NotFoundError extends Error {}

function toolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toolError(code: "not_found" | "database_unavailable" | "internal_error", message: string) {
  return { ...toolResult({ error: { code, message } }), isError: true };
}

function isDatabaseUnavailable(error: unknown): boolean {
  const details = error as { code?: string; cause?: { code?: string } } | null;
  const code = details?.code ?? details?.cause?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    (typeof code === "string" && code.startsWith("08"))
  );
}

async function runTool(action: () => Promise<Record<string, unknown>>) {
  try {
    return toolResult(await action());
  } catch (error) {
    if (error instanceof NotFoundError) return toolError("not_found", error.message);
    if (isDatabaseUnavailable(error))
      return toolError("database_unavailable", "Local database is unavailable.");
    return toolError("internal_error", "Local data request failed.");
  }
}

export function createMcpServer(repository: CatalogRepository) {
  const server = new McpServer(
    { name: "gf-database", version: "0.1.0" },
    {
      instructions:
        "Use local inventory, battle conditions, entity details and sources before proposing a formation. Use recommend_owned_formation for a bounded shortlist. Explain score components, unmet conditions, and warnings. Do not infer missing mechanics, invent facts or claim score optimality; the score is a catalog matching heuristic, not a damage or battle success prediction.",
    },
  );

  server.registerTool(
    "list_battle_conditions",
    {
      description:
        "List locally defined battle conditions in bounded pages. Use get_battle_condition for full details.",
      inputSchema: z.strictObject({
        limit: z.number().int().min(1).max(50).default(30),
        offset: z.number().int().min(0).max(10000).default(0),
      }),
    },
    async ({ limit, offset }) =>
      runTool(async () => {
        const battles = await repository.listBattles();
        const items = battles.slice(offset, offset + limit);
        return { items, ...(offset + limit < battles.length ? { hasMore: true } : {}) };
      }),
  );

  server.registerTool(
    "get_battle_condition",
    {
      description:
        "Get one local battle condition, including recommended element and required and preferred tags.",
      inputSchema: z.strictObject({ battleId: z.uuid() }),
    },
    async ({ battleId }) =>
      runTool(async () => {
        const item = await repository.getBattle(battleId);
        if (!item) throw new NotFoundError("Battle condition not found.");
        return { item };
      }),
  );

  server.registerTool(
    "search_entities",
    {
      description: "Search the local character, weapon, and summon catalog.",
      inputSchema: z.strictObject({
        query: z.string().max(120).optional(),
        kind: z.enum(entityKinds).optional(),
        element: z.enum(elements).optional(),
        owned: z.boolean().optional(),
        sourceStatus: z.enum(sourceStatuses).optional(),
        limit: z.number().int().min(1).max(100).default(30),
      }),
    },
    async (input) =>
      runTool(async () => {
        const items = await repository.search(input);
        return { items };
      }),
  );

  server.registerTool(
    "get_inventory_summary",
    {
      description: "Count locally owned characters, weapons, and summons.",
      inputSchema: z.strictObject({}),
    },
    async () =>
      runTool(async () => {
        const summary = await repository.inventorySummary();
        return { summary };
      }),
  );

  server.registerTool(
    "find_owned_candidates",
    {
      description:
        "Rank owned candidates by element and required capability tags before composing advice.",
      inputSchema: z.strictObject({
        kind: z.enum(entityKinds).optional(),
        element: z.enum(elements).optional(),
        requiredTags: capabilityTagsSchema,
        preferredTags: capabilityTagsSchema,
        battleId: z.uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ limit, battleId, ...input }) =>
      runTool(async () => {
        const battle = battleId ? await repository.getBattle(battleId) : null;
        if (battleId && !battle) throw new NotFoundError("Battle condition not found.");
        const candidates = (
          await repository.candidates({
            ...(battle ? resolveCandidateCriteria(battle) : input),
            kind: input.kind,
            strictRequiredTags: Boolean(battle),
          })
        ).slice(0, limit);
        return { candidates, ...(battle ? { battle } : {}) };
      }),
  );

  server.registerTool(
    "recommend_owned_formation",
    {
      description:
        "Return bounded character, weapon, and summon shortlists with score breakdowns, unmet requirements, and warnings. Explain limitations; do not claim optimality.",
      inputSchema: z.strictObject({
        battleId: z.uuid().optional(),
        element: z.enum(elements).optional(),
        requiredTags: capabilityTagsSchema,
        preferredTags: capabilityTagsSchema,
        limitPerKind: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ battleId, limitPerKind, ...input }) =>
      runTool(async () => {
        const battle = battleId ? await repository.getBattle(battleId) : null;
        if (battleId && !battle) throw new NotFoundError("Battle condition not found.");
        const recommendation = await repository.recommendations({
          ...(battle ? resolveCandidateCriteria(battle) : input),
          limitPerKind,
        });
        return { recommendation, ...(battle ? { battle } : {}) };
      }),
  );

  server.registerTool(
    "get_entity_details",
    {
      description:
        "Get local catalog details, inventory, and source references with observation and verification dates. Source notes contain only short facts, never article text or images.",
      inputSchema: z.strictObject({
        entityId: z.uuid(),
        sourceLimit: z.number().int().min(1).max(50).default(30),
        sourceOffset: z.number().int().min(0).max(10000).default(0),
      }),
    },
    async ({ entityId, sourceLimit, sourceOffset }) =>
      runTool(async () => {
        const item = await repository.get(entityId);
        if (!item) throw new NotFoundError("Catalog item not found.");
        const pagedItem = {
          ...item,
          sources: item.sources.slice(sourceOffset, sourceOffset + sourceLimit),
        };
        const hasMoreSources = sourceOffset + sourceLimit < item.sources.length;
        return {
          item: pagedItem,
          ...(hasMoreSources || sourceOffset > 0
            ? { sourceCount: item.sources.length, hasMoreSources }
            : {}),
        };
      }),
  );
  return server;
}
