import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { createDatabase } from "../database/client.js";
import { CatalogRepository } from "../database/repository.js";
import { elements, entityKinds } from "../domain/catalog.js";

const connection = createDatabase();
const repository = new CatalogRepository(connection.db);
const server = new McpServer(
  { name: "gf-database", version: "0.1.0" },
  {
    instructions:
      "Use the catalog and inventory tools to propose candidates. Treat scores as a shortlist, explain trade-offs, and do not invent missing mechanics.",
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
      requiredTags: z.array(z.string()).max(20).default([]),
      limit: z.number().int().min(1).max(50).default(20),
    }),
  },
  async ({ limit, ...input }) => {
    const candidates = (await repository.candidates(input)).slice(0, limit);
    const payload = { candidates };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("GF Database MCP server is running over stdio.");

async function shutdown() {
  await server.close();
  await connection.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
