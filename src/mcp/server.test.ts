import { describe, expect, it } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createMcpServer } from "./server.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("MCP detail tool", () => {
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
