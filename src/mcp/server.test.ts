import { describe, expect, it } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createMcpServer } from "./server.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("MCP detail tool", () => {
  it("advertises input schemas and rejects invalid tool arguments", async () => {
    const server = createMcpServer({} as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({ jsonrpc: "2.0", id: 40, method: "tools/list", params: {} });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 40,
            result: expect.objectContaining({
              tools: expect.arrayContaining([
                expect.objectContaining({
                  name: "list_battle_conditions",
                  inputSchema: expect.objectContaining({ type: "object" }),
                }),
                expect.objectContaining({
                  name: "get_inventory_summary",
                  inputSchema: expect.objectContaining({ type: "object" }),
                }),
                expect.objectContaining({
                  name: "get_battle_condition",
                  inputSchema: expect.objectContaining({ type: "object" }),
                }),
              ]),
            }),
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 41,
        method: "tools/call",
        params: { name: "get_battle_condition", arguments: { battleId: "bad-id" } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 41,
            result: expect.objectContaining({
              isError: true,
              content: [
                expect.objectContaining({
                  type: "text",
                  text: expect.stringContaining("Input validation error:"),
                }),
              ],
            }),
          }),
        );
    } finally {
      await server.close();
    }
  });
  it("bounds battle listings and retrieves one battle by id", async () => {
    const battles = Array.from({ length: 35 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Battle ${index}`,
    }));
    const repository = {
      listBattles: async () => battles,
      getBattle: async (battleId: string) =>
        battles.find((battle) => battle.id === battleId) ?? null,
    };
    const server = createMcpServer(repository as unknown as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: { name: "list_battle_conditions", arguments: { limit: 5 } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 20,
            result: expect.objectContaining({
              structuredContent: { items: battles.slice(0, 5), hasMore: true },
            }),
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: { name: "get_battle_condition", arguments: { battleId: battles[0]?.id } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 21,
            result: expect.objectContaining({ structuredContent: { item: battles[0] } }),
          }),
        );
    } finally {
      await server.close();
    }
  });

  it("classifies missing records and unavailable database separately", async () => {
    const repository = {
      getBattle: async () => null,
      inventorySummary: async () => {
        throw Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
      },
    };
    const server = createMcpServer(repository as unknown as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: { name: "get_battle_condition", arguments: { battleId: id } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 30,
            result: expect.objectContaining({
              isError: true,
              structuredContent: {
                error: { code: "not_found", message: "Battle condition not found." },
              },
            }),
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "get_inventory_summary", arguments: {} },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 31,
            result: expect.objectContaining({
              isError: true,
              structuredContent: {
                error: { code: "database_unavailable", message: "Local database is unavailable." },
              },
            }),
          }),
        );
    } finally {
      await server.close();
    }
  });
  it("pages source references in entity details", async () => {
    const sources = Array.from({ length: 35 }, (_, index) => ({
      id: index,
      note: `Source ${index}`,
    }));
    const repository = { get: async () => ({ id, name: "Fixture", sources }) };
    const server = createMcpServer(repository as unknown as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 50,
        method: "tools/call",
        params: {
          name: "get_entity_details",
          arguments: { entityId: id, sourceLimit: 5, sourceOffset: 10 },
        },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 50,
            result: expect.objectContaining({
              structuredContent: {
                item: { id, name: "Fixture", sources: sources.slice(10, 15) },
                sourceCount: 35,
                hasMoreSources: true,
              },
            }),
          }),
        );
    } finally {
      await server.close();
    }
  });
  it("lists battle conditions and uses one for candidate ranking", async () => {
    const battle = {
      id,
      name: "架空のMCPバトル",
      enemyElement: "fire",
      recommendedElement: "water",
      purpose: "short",
      requiredTags: ["heal"],
      preferredTags: ["dispel"],
      notes: null,
    };
    const calls: unknown[] = [];
    const repository = {
      listBattles: async () => [battle],
      getBattle: async () => battle,
      candidates: async (options: unknown) => {
        calls.push(options);
        return [];
      },
      recommendations: async (options: unknown) => {
        calls.push(options);
        return { byKind: { character: [], weapon: [], summon: [] }, warnings: [] };
      },
    };
    const server = createMcpServer(repository as unknown as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "list_battle_conditions", arguments: {} },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 10,
            result: expect.objectContaining({ structuredContent: { items: [battle] } }),
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "find_owned_candidates", arguments: { battleId: id } },
      });
      await expect
        .poll(() => calls)
        .toContainEqual(
          expect.objectContaining({
            element: "water",
            requiredTags: ["heal"],
            preferredTags: ["dispel"],
            strictRequiredTags: true,
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "recommend_owned_formation", arguments: { battleId: id } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 12,
            result: expect.objectContaining({
              structuredContent: expect.objectContaining({
                recommendation: expect.objectContaining({ byKind: expect.any(Object) }),
              }),
            }),
          }),
        );
    } finally {
      await server.close();
    }
  });
  it("returns sources and ISO dates through tools/call and reports missing entities", async () => {
    const repository = {
      get: async (entityId: string) =>
        entityId === id
          ? {
              id,
              name: "架空のMCP検証項目",
              inventory: null,
              sources: [
                {
                  kind: "user",
                  url: null,
                  note: "架空の事実メモ",
                  observedAt: new Date("2026-01-01T00:00:00Z"),
                  verifiedAt: new Date("2026-02-01T00:00:00Z"),
                },
              ],
            }
          : null,
    };
    const server = createMcpServer(repository as unknown as CatalogRepository);
    type Transport = Parameters<typeof server.connect>[0];
    const messages: unknown[] = [];
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message) => {
        messages.push(JSON.parse(JSON.stringify(message)));
      },
    };
    await server.connect(transport);
    try {
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "get_entity_details", arguments: { entityId: id } },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({
            id: 1,
            result: expect.objectContaining({
              structuredContent: {
                item: expect.objectContaining({
                  sources: [
                    {
                      kind: "user",
                      url: null,
                      note: "架空の事実メモ",
                      observedAt: "2026-01-01T00:00:00.000Z",
                      verifiedAt: "2026-02-01T00:00:00.000Z",
                    },
                  ],
                }),
              },
            }),
          }),
        );
      transport.onmessage?.({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_entity_details",
          arguments: { entityId: "00000000-0000-4000-8000-000000000002" },
        },
      });
      await expect
        .poll(() => messages)
        .toContainEqual(
          expect.objectContaining({ id: 2, result: expect.objectContaining({ isError: true }) }),
        );
    } finally {
      await server.close();
    }
  });
});
