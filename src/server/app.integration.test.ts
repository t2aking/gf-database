import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { CatalogRepository } from "../database/repository.js";
import * as schema from "../database/schema.js";
import { importTemplate, parseImportCsv } from "../domain/csv-import.js";
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
  it("persists battle requirements through create, update and delete", async () => {
    const input = {
      name: "架空の周回バトル",
      enemyElement: "fire",
      recommendedElement: "water",
      purpose: "full-auto",
      requiredTags: ["heal"],
      preferredTags: ["dispel"],
      notes: "架空の条件",
    };
    const created = await send("/api/battles", "POST", input);
    expect(created.status).toBe(201);
    const { item } = (await created.json()) as { item: { id: string } };
    expect(await repository.getBattle(item.id)).toMatchObject(input);
    expect((await repository.listBattles()).map((battle) => battle.id)).toContain(item.id);
    const updated = { ...input, purpose: "long", preferredTags: ["damage-cut"] };
    expect((await send(`/api/battles/${item.id}`, "PUT", updated)).status).toBe(200);
    expect(await repository.getBattle(item.id)).toMatchObject(updated);
    expect((await send(`/api/battles/${item.id}`, "DELETE", { confirm: true })).status).toBe(200);
    expect(await repository.getBattle(item.id)).toBeNull();
  });
  it("finds a required-tag match after the first 200 owned entries", async () => {
    try {
      await client.unsafe(`
      WITH inserted AS (
        INSERT INTO catalog_entities (kind, name, normalized_name, element, rarity, tags, details)
        SELECT 'weapon', 'a-review-' || lpad(n::text, 4, '0'),
          'a-review-' || lpad(n::text, 4, '0'), 'water', 'SSR', ARRAY[]::text[],
          '{"weaponType":"sword","skillEffects":["attack"],"maxUncapLevel":5}'::jsonb
        FROM generate_series(1, 200) AS n
        RETURNING id
      )
      INSERT INTO inventory_entries (entity_id) SELECT id FROM inserted
    `);
      const matchId = await create("z-review-healer");
      await client.unsafe(
        "UPDATE catalog_entities SET tags = ARRAY['heal']::text[] WHERE id = $1",
        [matchId],
      );
      await send(`/api/inventory/${matchId}`, "PUT", { owned: true });

      const candidates = await repository.candidates({
        kind: "weapon",
        requiredTags: ["heal"],
        strictRequiredTags: true,
        limit: 200,
      });
      expect(candidates.map((candidate) => candidate.id)).toContain(matchId);
    } finally {
      await client.unsafe(
        "DELETE FROM catalog_entities WHERE name LIKE 'a-review-%' OR name = 'z-review-healer'",
      );
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
  it("previews and atomically upserts all three kinds only with a reviewed CSV", async () => {
    const csv = importTemplate();
    const before = await repository.search();
    const response = await send("/api/import/preview", "POST", { csv });
    expect(response.status).toBe(200);
    const preview = (await response.json()) as {
      preview: { newCount: number; updateCount: number };
      token: string;
    };
    expect(preview.preview).toMatchObject({ newCount: 3, updateCount: 0, errorCount: 0 });
    expect(await repository.search()).toHaveLength(before.length);
    expect(
      (await send("/api/import/apply", "POST", { csv, token: preview.token, confirm: false }))
        .status,
    ).toBe(400);
    expect(
      (
        await send("/api/import/apply", "POST", {
          csv: csv.replace("架空の支援役", "架空の未確認役"),
          token: preview.token,
          confirm: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (await send("/api/import/apply", "POST", { csv, token: preview.token, confirm: true }))
        .status,
    ).toBe(200);
    const second = (await (
      await send("/api/import/preview", "POST", { csv })
    ).json()) as typeof preview;
    expect(second.preview).toMatchObject({ newCount: 0, updateCount: 3 });
    expect(
      (await send("/api/import/apply", "POST", { csv, token: second.token, confirm: true })).status,
    ).toBe(200);
    expect(await repository.search()).toHaveLength(before.length + 3);
    expect((await repository.search({ query: "架空の試験剣" }))[0]?.quantity).toBe(2);
    const id = (await repository.search({ query: "架空の試験剣" }))[0]!.id;
    await repository.createSource(id, { kind: "user", observedAt: "2026-01-01T00:00:00Z" });
    const update =
      "kind,name,element,rarity,tags,owned,quantity,uncapLevel,awakeningLevel,notes,details\nweapon,架空の試験剣,,,heal,false,,,,,";
    const p = (await (
      await send("/api/import/preview", "POST", { csv: update })
    ).json()) as typeof preview;
    expect(
      (await send("/api/import/apply", "POST", { csv: update, token: p.token, confirm: true }))
        .status,
    ).toBe(200);
    expect(await repository.get(id)).toMatchObject({
      element: null,
      rarity: null,
      tags: ["heal"],
      details: { weaponType: "sword" },
      inventory: null,
      sources: [{ kind: "user" }],
    });
  });
  it("validates all rows before writing and rolls back a failure after the first row", async () => {
    const before = await repository.search();
    const invalid = importTemplate()
      .replace('"架空の支援役"', '"架空の新規支援役"')
      .replace('"2","4"', '"-1","4"');
    const result = (await (await send("/api/import/preview", "POST", { csv: invalid })).json()) as {
      preview: { errors: unknown[] };
    };
    expect(result.preview.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ line: 3, field: "quantity" })]),
    );
    expect(
      (await send("/api/import/apply", "POST", { csv: invalid, token: "invalid", confirm: true }))
        .status,
    ).toBe(400);
    expect(await repository.search()).toHaveLength(before.length);
    await client.unsafe(
      `CREATE FUNCTION reject_import_inventory() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quantity = 2 THEN RAISE EXCEPTION 'test inventory failure'; END IF; RETURN NEW; END $$`,
    );
    await client.unsafe(
      "CREATE TRIGGER reject_import_inventory BEFORE INSERT OR UPDATE ON inventory_entries FOR EACH ROW EXECUTE FUNCTION reject_import_inventory()",
    );
    try {
      const csv = importTemplate().replaceAll("架空の", "架空のロールバック");
      const p = (await (await send("/api/import/preview", "POST", { csv })).json()) as {
        token: string;
      };
      expect(
        (await send("/api/import/apply", "POST", { csv, token: p.token, confirm: true })).status,
      ).toBe(500);
      expect(await repository.search()).toHaveLength(before.length);
      expect(await repository.search({ query: "架空のロールバック" })).toHaveLength(0);
    } finally {
      await client.unsafe("DROP TRIGGER reject_import_inventory ON inventory_entries");
      await client.unsafe("DROP FUNCTION reject_import_inventory()");
    }
  });
  it("rejects a concurrent catalog change without restoring old details", async () => {
    const id = await create("架空の競合試験武器");
    const csv =
      "kind,name,element,rarity,tags,owned,quantity,uncapLevel,awakeningLevel,notes,details\nweapon,架空の競合試験武器,,,heal,false,,,,,";
    const other = postgres(testUrl!, { max: 1, connection: { search_path: namespace } });
    const lock = Number.parseInt(randomUUID().slice(0, 8), 16) >>> 1;
    await client.unsafe(
      `CREATE FUNCTION pause_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = '架空の競合試験武器' THEN PERFORM pg_advisory_xact_lock(12345, ${lock}); END IF; RETURN NEW; END $$`,
    );
    await client.unsafe(
      "CREATE TRIGGER pause_import BEFORE INSERT ON catalog_entities FOR EACH ROW EXECUTE FUNCTION pause_import()",
    );
    await other.unsafe(`SELECT pg_advisory_lock(12345, ${lock})`);
    let prepared!: () => void;
    const ready = new Promise<void>((resolve) => {
      prepared = resolve;
    });
    const applying = repository
      .applyImport(csv, () => {
        prepared();
        return true;
      })
      .then(
        (result) => ({ result, error: null }),
        (error: unknown) => ({ result: null, error }),
      );
    try {
      await ready;
      await other.unsafe(
        `UPDATE catalog_entities SET details = '{"weaponType":"axe","skillEffects":["hp"],"maxUncapLevel":10}' WHERE id = $1`,
        [id],
      );
      await other.unsafe(`SELECT pg_advisory_unlock(12345, ${lock})`);
      expect((await applying).error).toMatchObject({ cause: { code: "40001" } });
      expect(await repository.get(id)).toMatchObject({
        tags: ["attack"],
        details: { weaponType: "axe", maxUncapLevel: 10 },
      });
    } finally {
      await other.unsafe(`SELECT pg_advisory_unlock(12345, ${lock})`);
      await applying;
      await client.unsafe("DROP TRIGGER pause_import ON catalog_entities");
      await client.unsafe("DROP FUNCTION pause_import()");
      await other.end();
    }
  });
  it("exports every catalog row beyond the search cap and preserves sources on reimport", async () => {
    const csv = importTemplate().replaceAll("架空の", "架空の書出試験");
    const preview = (await (await send("/api/import/preview", "POST", { csv })).json()) as {
      token: string;
    };
    expect(
      (await send("/api/import/apply", "POST", { csv, token: preview.token, confirm: true }))
        .status,
    ).toBe(200);
    const target = (await repository.search({ query: "架空の書出試験試験剣" }))[0]!;
    await repository.createSource(target.id, { kind: "user", observedAt: "2026-01-01T00:00:00Z" });
    await client.unsafe(
      "UPDATE catalog_entities SET metadata = '{\"local\":true}'::jsonb WHERE id = $1",
      [target.id],
    );
    await client.unsafe(`
      INSERT INTO catalog_entities (kind, name, normalized_name, details)
      SELECT 'weapon', '架空の書出連番' || lpad(n::text, 4, '0'),
        '架空の書出連番' || lpad(n::text, 4, '0'),
        '{"weaponType":"sword","skillEffects":["attack"],"maxUncapLevel":5}'::jsonb
      FROM generate_series(1, 501) AS n
    `);
    const response = await app.request("/api/catalog/export");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = (await response.json()) as { total: number; files: string[] };
    expect(result.total).toBeGreaterThan(500);
    const rows = result.files.flatMap((file) => {
      const parsed = parseImportCsv(file);
      expect(parsed.errors).toEqual([]);
      return parsed.rows;
    });
    expect(rows).toHaveLength(result.total);
    expect(rows.filter((row) => row.catalog.name.startsWith("架空の書出連番"))).toHaveLength(501);
    expect(rows.filter((row) => row.catalog.name.startsWith("架空の書出試験"))).toHaveLength(3);
    const original = await repository.get(target.id);
    const part = result.files.find((file) => file.includes("架空の書出試験試験剣"))!;
    const reimport = (await (await send("/api/import/preview", "POST", { csv: part })).json()) as {
      preview: { newCount: number; errors: unknown[] };
      token: string;
    };
    expect(reimport.preview.newCount).toBe(0);
    expect(reimport.preview.errors).toEqual([]);
    expect(
      (await send("/api/import/apply", "POST", { csv: part, token: reimport.token, confirm: true }))
        .status,
    ).toBe(200);
    expect(await repository.get(target.id)).toMatchObject({
      details: original!.details,
      metadata: original!.metadata,
      inventory: {
        quantity: original!.inventory!.quantity,
        uncapLevel: original!.inventory!.uncapLevel,
        awakeningLevel: original!.inventory!.awakeningLevel,
        notes: original!.inventory!.notes,
      },
      sources: original!.sources,
    });
  });
});
