import { describe, expect, it, vi } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createApp } from "./app.js";

const id = "00000000-0000-4000-8000-000000000001";
const input = {
  kind: "weapon",
  name: "架空の試験武器",
  element: "wind",
  rarity: "SSR",
  tags: ["回復"],
  details: { weaponType: "sword", skillEffects: ["attack"], maxUncapLevel: 5 },
};
function fixture() {
  // The database is external; route tests exercise validation and HTTP contracts.
  const repository = {
    get: vi
      .fn()
      .mockResolvedValue({ ...input, id, inventory: { quantity: 2 }, sources: [{ id: "source" }] }),
    update: vi.fn().mockImplementation(async (_id, value) => ({ id, ...value })),
    delete: vi.fn().mockResolvedValue({ id }),
    setInventory: vi.fn().mockImplementation(async (_id, value) => value),
  };
  return { repository, app: createApp(repository as unknown as CatalogRepository) };
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("catalog editing API", () => {
  it("returns inventory and sources before deletion", async () => {
    const { app } = fixture();
    const response = await app.request(`/api/catalog/${id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      item: { id, inventory: { quantity: 2 }, sources: [{ id: "source" }] },
    });
  });
  it("normalizes and saves a complete catalog update", async () => {
    const { app, repository } = fixture();
    const response = await app.request(`/api/catalog/${id}`, json("PUT", input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ item: { name: input.name, tags: ["heal"] } });
    expect(repository.update).toHaveBeenCalledWith(id, expect.objectContaining({ tags: ["heal"] }));
  });
  it("rejects invalid fields without updating", async () => {
    const { app, repository } = fixture();
    const response = await app.request(
      `/api/catalog/${id}`,
      json("PUT", { ...input, name: "", details: { ...input.details, maxUncapLevel: -1 } }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { name: expect.any(Array), "details.maxUncapLevel": expect.any(Array) },
    });
    expect(repository.update).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation to delete", async () => {
    const { app, repository } = fixture();
    expect(
      (await app.request(`/api/catalog/${id}`, json("DELETE", { confirm: false }))).status,
    ).toBe(400);
    expect(repository.delete).not.toHaveBeenCalled();
    expect(
      (await app.request(`/api/catalog/${id}`, json("DELETE", { confirm: true }))).status,
    ).toBe(200);
    expect(repository.delete).toHaveBeenCalledWith(id);
  });
  it("edits all inventory fields and rejects invalid quantity", async () => {
    const { app, repository } = fixture();
    const values = {
      owned: true,
      quantity: 3,
      uncapLevel: 4,
      awakeningLevel: 8,
      notes: "試験メモ",
    };
    const response = await app.request(`/api/inventory/${id}`, json("PUT", values));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: values });
    repository.setInventory.mockClear();
    const invalid = await app.request(
      `/api/inventory/${id}`,
      json("PUT", { ...values, quantity: 0 }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ fieldErrors: { quantity: expect.any(Array) } });
    expect(repository.setInventory).not.toHaveBeenCalled();
  });
  it("returns 404 for missing catalog and inventory targets", async () => {
    const { app, repository } = fixture();
    repository.get.mockResolvedValue(null);
    repository.update.mockResolvedValue(null);
    repository.delete.mockResolvedValue(null);
    for (const [url, init] of [
      [`/api/catalog/${id}`, undefined],
      [`/api/catalog/${id}`, json("PUT", input)],
      [`/api/catalog/${id}`, json("DELETE", { confirm: true })],
      [`/api/inventory/${id}`, json("PUT", { owned: false })],
    ] as const)
      expect((await app.request(url, init)).status).toBe(404);
    expect(repository.setInventory).not.toHaveBeenCalled();
  });
  it("rejects malformed ids", async () => {
    const { app } = fixture();
    expect((await app.request("/api/catalog/invalid")).status).toBe(400);
  });
});
