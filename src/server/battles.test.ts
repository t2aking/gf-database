import { describe, expect, it, vi } from "vite-plus/test";
import type { CatalogRepository } from "../database/repository.js";
import { createApp } from "./app.js";

const id = "00000000-0000-4000-8000-000000000001";
const input = {
  name: "架空の試験バトル",
  enemyElement: "fire",
  recommendedElement: "water",
  purpose: "full-auto",
  requiredTags: ["heal"],
  preferredTags: ["dispel"],
  notes: null,
};
const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

function fixture() {
  const repository = {
    listBattles: vi.fn().mockResolvedValue([{ id, ...input }]),
    getBattle: vi.fn().mockResolvedValue({ id, ...input }),
    createBattle: vi.fn().mockImplementation(async (value) => ({ id, ...value })),
    updateBattle: vi.fn().mockImplementation(async (_id, value) => ({ id, ...value })),
    deleteBattle: vi.fn().mockResolvedValue({ id }),
    candidates: vi.fn().mockResolvedValue([]),
    recommendations: vi
      .fn()
      .mockResolvedValue({ byKind: { character: [], weapon: [], summon: [] }, warnings: [] }),
  };
  return { repository, app: createApp(repository as unknown as CatalogRepository) };
}

describe("battle API", () => {
  it("lists, creates, reads, updates and deletes battle conditions", async () => {
    const { app, repository } = fixture();
    expect((await app.request("/api/battles")).status).toBe(200);
    expect((await app.request("/api/battles", json("POST", input))).status).toBe(201);
    expect((await app.request(`/api/battles/${id}`)).status).toBe(200);
    expect((await app.request(`/api/battles/${id}`, json("PUT", input))).status).toBe(200);
    expect(
      (await app.request(`/api/battles/${id}`, json("DELETE", { confirm: false }))).status,
    ).toBe(400);
    expect(repository.deleteBattle).not.toHaveBeenCalled();
    expect(
      (await app.request(`/api/battles/${id}`, json("DELETE", { confirm: true }))).status,
    ).toBe(200);
  });

  it("rejects unknown tags and invalid elements before saving", async () => {
    const { app, repository } = fixture();
    expect(
      (await app.request("/api/battles", json("POST", { ...input, requiredTags: ["unknown"] })))
        .status,
    ).toBe(400);
    expect(
      (await app.request(`/api/battles/${id}`, json("PUT", { ...input, enemyElement: "ice" })))
        .status,
    ).toBe(400);
    expect(repository.createBattle).not.toHaveBeenCalled();
    expect(repository.updateBattle).not.toHaveBeenCalled();
  });

  it("passes selected battle requirements to candidate ranking", async () => {
    const { app, repository } = fixture();
    const response = await app.request("/api/candidates", json("POST", { battleId: id }));
    expect(response.status).toBe(200);
    expect(repository.candidates).toHaveBeenCalledWith(
      expect.objectContaining({
        element: "water",
        requiredTags: ["heal"],
        preferredTags: ["dispel"],
      }),
    );
  });

  it("uses battle conditions for grouped recommendations", async () => {
    const { app, repository } = fixture();
    const response = await app.request("/api/recommendations", json("POST", { battleId: id }));
    expect(response.status).toBe(200);
    expect(repository.recommendations).toHaveBeenCalledWith(
      expect.objectContaining({
        element: "water",
        requiredTags: ["heal"],
        preferredTags: ["dispel"],
      }),
    );
    expect(await response.json()).toMatchObject({
      recommendation: { byKind: { character: [], weapon: [], summon: [] } },
    });
  });

  it("rejects missing battle references and missing CRUD targets", async () => {
    const { app, repository } = fixture();
    repository.getBattle.mockResolvedValue(null);
    repository.updateBattle.mockResolvedValue(null);
    repository.deleteBattle.mockResolvedValue(null);
    expect((await app.request("/api/candidates", json("POST", { battleId: id }))).status).toBe(404);
    expect(repository.candidates).not.toHaveBeenCalled();
    expect((await app.request(`/api/battles/${id}`)).status).toBe(404);
    expect((await app.request(`/api/battles/${id}`, json("PUT", input))).status).toBe(404);
    expect(
      (await app.request(`/api/battles/${id}`, json("DELETE", { confirm: true }))).status,
    ).toBe(404);
    expect((await app.request("/api/battles/not-an-id")).status).toBe(400);
  });
});
