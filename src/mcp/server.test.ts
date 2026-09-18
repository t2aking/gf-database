import { describe, expect, it } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createMcpServer } from "./server.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("MCP detail tool", () => {
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
