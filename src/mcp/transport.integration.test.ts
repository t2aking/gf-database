import { InMemoryTransport, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createMcpServer } from "./server.js";

describe("MCP client transport", () => {
  it("negotiates, lists tool input schemas, and calls catalog tools across JSON-RPC", async () => {
    const repository = {
      search: async () => [
        {
          id: "00000000-0000-4000-8000-000000000001",
          kind: "weapon",
          name: "架空の輸送試験武器",
          element: "wind",
          tags: ["heal"],
        },
      ],
      inventorySummary: async () => ({ total: 1, character: 0, weapon: 1, summon: 0 }),
      listBattles: async () => [],
    } as unknown as CatalogRepository;
    const server = createMcpServer(repository);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const messages: Array<Record<string, unknown>> = [];
    clientTransport.onmessage = (message) => messages.push(message as Record<string, unknown>);
    await clientTransport.start();
    await server.connect(serverTransport);

    let id = 0;
    async function request(method: string, params: Record<string, unknown> = {}) {
      const requestId = ++id;
      await clientTransport.send({ jsonrpc: "2.0", id: requestId, method, params });
      await expect.poll(() => messages.find((message) => message.id === requestId)).toBeDefined();
      return messages.find((message) => message.id === requestId)!;
    }

    try {
      const initialized = await request("initialize", {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "gf-integration-test", version: "1.0.0" },
      });
      expect(initialized.result).toMatchObject({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        serverInfo: { name: "gf-database" },
      });
      await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });

      const listed = await request("tools/list");
      const tools = (listed.result as { tools: Array<{ name: string; inputSchema: unknown }> })
        .tools;
      const names = tools.map((tool) => tool.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "search_entities",
          "get_entity_details",
          "get_inventory_summary",
          "find_owned_candidates",
          "recommend_owned_formation",
          "list_battle_conditions",
          "get_battle_condition",
        ]),
      );
      expect(tools.find((tool) => tool.name === "search_entities")?.inputSchema).toMatchObject({
        type: "object",
        properties: { kind: { enum: ["character", "weapon", "summon"] } },
      });
      expect(tools.find((tool) => tool.name === "get_battle_condition")?.inputSchema).toMatchObject(
        {
          type: "object",
          required: ["battleId"],
          properties: { battleId: { type: "string", format: "uuid" } },
        },
      );

      const searched = await request("tools/call", {
        name: "search_entities",
        arguments: { kind: "weapon" },
      });
      expect(searched.result).toMatchObject({
        structuredContent: {
          items: [{ name: "架空の輸送試験武器", kind: "weapon" }],
        },
      });
      const summary = await request("tools/call", {
        name: "get_inventory_summary",
        arguments: {},
      });
      expect(summary.result).toMatchObject({
        structuredContent: { summary: { total: 1, weapon: 1 } },
      });
      const invalid = await request("tools/call", {
        name: "search_entities",
        arguments: { kind: "invalid-kind" },
      });
      expect(invalid.error ?? (invalid.result as { isError?: boolean })?.isError).toBeTruthy();
    } finally {
      await server.close();
      await clientTransport.close();
    }
  });
});
