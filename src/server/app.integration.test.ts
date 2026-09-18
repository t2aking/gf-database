import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { CatalogRepository } from "../database/repository.js";
import * as schema from "../database/schema.js";
import { createApp } from "./app.js";

// Explicit opt-in; every run uses its own schema and only removes that schema.
const testUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!testUrl)("catalog API with PostgreSQL", () => {
  const namespace = `gf_test_${randomUUID().replaceAll("-", "")}`;
  const client = postgres(testUrl!, { max: 1, connection: { search_path: namespace } });
  const repository = new CatalogRepository(drizzle(client, { schema }));
  const app = createApp(repository);
  const input = {
    kind: "weapon" as const,
    name: "架空の試験武器",
    element: "wind",
    rarity: "SSR",
    tags: ["attack"],
    details: { weaponType: "sword", skillEffects: ["attack"], maxUncapLevel: 5 },
    source: { kind: "user", note: "架空の出典", observedAt: "2026-09-18T00:00:00Z" },
  };
  async function send(path: string, method: string, body?: unknown) {
    return app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function create(name = input.name) {
    const response = await send("/api/catalog", "POST", { ...input, name });
    expect(response.status).toBe(201);
    return ((await response.json()) as { item: { id: string } }).item.id;
  }
  beforeAll(async () => {
    await client.unsafe(`CREATE SCHEMA "${namespace}"`);
    const journal = JSON.parse(
      await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    for (const entry of journal.entries) {
      const migration = await readFile(
        new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
        "utf8",
      );
      for (const statement of migration
        .replaceAll('"public"', `"${namespace}"`)
        .split("--> statement-breakpoint")) {
        if (statement.trim()) await client.unsafe(statement);
      }
    }
  });
  afterAll(async () => {
    try {
      await client.unsafe(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    } finally {
      await client.end();
    }
  });
  it("updates normalized search fields while retaining inventory, metadata and sources", async () => {
    const id = await create();
    await client.unsafe("UPDATE catalog_entities SET metadata = '{\"test\":true}' WHERE id = $1", [
      id,
    ]);
    expect(
      (
        await send(`/api/inventory/${id}`, "PUT", {
          owned: true,
          quantity: 3,
          uncapLevel: 4,
          awakeningLevel: 8,
          notes: "試験メモ",
        })
      ).status,
    ).toBe(200);
    const { source: _source, ...values } = input;
    const response = await send(`/api/catalog/${id}`, "PUT", {
      ...values,
      name: "架空の更新武器",
      element: null,
      rarity: null,
      tags: ["回復"],
    });
    expect(response.status).toBe(200);
    const detail = await repository.get(id);
    expect(detail).toMatchObject({
      name: "架空の更新武器",
      element: null,
      rarity: null,
      tags: ["heal"],
      metadata: { test: true },
      inventory: { quantity: 3, uncapLevel: 4, awakeningLevel: 8, notes: "試験メモ" },
    });
    expect(detail?.sources).toHaveLength(1);
    expect(await repository.search({ query: "架空の更新武器" })).toHaveLength(1);
    expect(await repository.search({ query: "架空の試験武器" })).toHaveLength(0);
    expect(
      (
        await send(`/api/inventory/${id}`, "PUT", {
          owned: true,
          quantity: 2,
          uncapLevel: 1,
          awakeningLevel: null,
          notes: null,
        })
      ).status,
    ).toBe(200);
    expect((await repository.get(id))?.inventory).toMatchObject({
      quantity: 2,
      uncapLevel: 1,
      awakeningLevel: null,
      notes: null,
    });
  });
  it("keeps existing data on invalid update and duplicate normalized name", async () => {
    const id = await create("架空の重複先");
    const otherId = await create("架空の保持対象");
    const { source: _source, ...values } = input;
    expect(
      (await send(`/api/catalog/${otherId}`, "PUT", { ...values, name: " 架空の重複先 " })).status,
    ).toBe(409);
    expect((await repository.get(otherId))?.name).toBe("架空の保持対象");
    expect((await send(`/api/inventory/${id}`, "PUT", { owned: true, quantity: -1 })).status).toBe(
      400,
    );
    expect((await repository.get(id))?.inventory).toBeNull();
  });
  it("separates unowning from deletion and cascades only confirmed catalog deletion", async () => {
    const id = await create("架空の削除対象");
    const unrelatedId = await create("架空の独立対象");
    await send(`/api/inventory/${id}`, "PUT", { owned: true, quantity: 2 });
    const preview = await app.request(`/api/catalog/${id}`);
    expect(await preview.json()).toMatchObject({
      item: { inventory: { quantity: 2 }, sources: [{ note: "架空の出典" }] },
    });
    expect((await send(`/api/catalog/${id}`, "DELETE", { confirm: false })).status).toBe(400);
    expect((await repository.get(id))?.inventory?.quantity).toBe(2);
    await send(`/api/inventory/${id}`, "PUT", { owned: false });
    expect(await repository.get(id)).toMatchObject({
      inventory: null,
      sources: [{ note: "架空の出典" }],
    });
    await send(`/api/inventory/${id}`, "PUT", { owned: true, quantity: 2 });
    expect((await send(`/api/catalog/${id}`, "DELETE", { confirm: true })).status).toBe(200);
    expect(await repository.get(id)).toBeNull();
    expect(
      await client.unsafe("SELECT id FROM inventory_entries WHERE entity_id = $1", [id]),
    ).toHaveLength(0);
    expect(
      await client.unsafe("SELECT id FROM source_references WHERE entity_id = $1", [id]),
    ).toHaveLength(0);
    expect((await repository.get(unrelatedId))?.sources).toHaveLength(1);
    expect((await send(`/api/catalog/${id}`, "DELETE", { confirm: true })).status).toBe(404);
    expect((await send(`/api/inventory/${id}`, "PUT", { owned: true })).status).toBe(404);
  });
  it("manages multiple scoped sources and preserves data on invalid updates", async () => {
    const id = await create("架空の出典CRUD対象");
    const otherId = await create("架空の出典別対象");
    const path = `/api/catalog/${id}/sources`;
    const values = {
      kind: "official",
      url: "https://example.com/facts",
      note: "架空の事実メモ",
      observedAt: "2026-01-01T00:00:00Z",
      verifiedAt: "2026-02-01T00:00:00Z",
    };
    const created = await send(path, "POST", values);
    expect(created.status).toBe(201);
    const sourceId = ((await created.json()) as { item: { id: string } }).item.id;
    expect((await repository.get(id))?.sources).toHaveLength(2);
    expect(await (await app.request(path)).json()).toMatchObject({
      items: [{ kind: "user" }, { kind: "official", verifiedAt: "2026-02-01T00:00:00.000Z" }],
    });
    expect(
      (await send(`${path}/${sourceId}`, "PUT", { ...values, url: "javascript:alert(1)" })).status,
    ).toBe(400);
    expect(
      (await send(`${path}/${sourceId}`, "PUT", { ...values, observedAt: "2026-02-30T00:00:00Z" }))
        .status,
    ).toBe(400);
    expect((await send(`/api/catalog/${otherId}/sources/${sourceId}`, "PUT", values)).status).toBe(
      404,
    );
    expect((await send(`/api/catalog/${otherId}/sources/${sourceId}`, "DELETE")).status).toBe(404);
    expect((await repository.get(id))?.sources.find((source) => source.id === sourceId)?.url).toBe(
      "https://example.com/facts",
    );
    expect(
      (
        await send(`${path}/${sourceId}`, "PUT", {
          ...values,
          kind: "gameplay",
          url: null,
          note: null,
          verifiedAt: null,
        })
      ).status,
    ).toBe(200);
    expect(
      (await repository.get(id))?.sources.find((source) => source.id === sourceId),
    ).toMatchObject({ kind: "gameplay", url: null, note: null, verifiedAt: null });
    expect((await send(`${path}/${sourceId}`, "DELETE")).status).toBe(200);
    expect((await repository.get(id))?.sources).toHaveLength(1);
    expect((await send(`${path}/${sourceId}`, "DELETE")).status).toBe(404);
    const missingId = randomUUID();
    expect((await send(`/api/catalog/${missingId}/sources`, "POST", values)).status).toBe(404);
    expect((await app.request(`/api/catalog/${missingId}/sources`)).status).toBe(404);
    expect((await app.request("/api/catalog/invalid/sources")).status).toBe(400);
  });
  it("filters missing and stale sources before limiting and considers the newest verification", async () => {
    const missing = await create("架空の出典未登録");
    const stale = await create("架空の出典古い");
    const current = await create("架空の出典最新");
    await client.unsafe("DELETE FROM source_references WHERE entity_id = $1", [missing]);
    await client.unsafe(
      "UPDATE source_references SET observed_at = now() - interval '91 days' WHERE entity_id = $1",
      [stale],
    );
    await client.unsafe(
      "UPDATE source_references SET observed_at = now() - interval '200 days', verified_at = now() WHERE entity_id = $1",
      [current],
    );
    await repository.createSource(current, {
      kind: "gameplay",
      observedAt: "2020-01-01T00:00:00Z",
    });
    const ids = (
      await repository.search({ query: "架空の出典", sourceStatus: "missing", limit: 1 })
    ).map((item) => item.id);
    expect(ids).toEqual([missing]);
    expect(
      (await repository.search({ query: "架空の出典古い", sourceStatus: "stale" })).map(
        (item) => item.id,
      ),
    ).toEqual([stale]);
    expect(
      await repository.search({ query: "架空の出典最新", sourceStatus: "stale" }),
    ).toHaveLength(0);
    expect(
      await (
        await app.request(
          "/api/catalog?query=" + encodeURIComponent("架空の出典未登録") + "&sourceStatus=missing",
        )
      ).json(),
    ).toMatchObject({
      items: [{ id: missing, sourceCount: 0, sourceStatus: "missing", lastConfirmedAt: null }],
    });
    expect((await repository.search({ query: "架空の出典最新" }))[0]).toMatchObject({
      sourceCount: 2,
      sourceStatus: "current",
      lastConfirmedAt: expect.any(Date),
    });
    expect((await app.request("/api/catalog?sourceStatus=invalid")).status).toBe(400);
  });
});
