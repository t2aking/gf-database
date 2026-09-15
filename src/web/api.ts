import type { CatalogDetails, CatalogInput } from "../domain/catalog.js";

export type CatalogItem = {
  id: string;
  kind: "character" | "weapon" | "summon";
  name: string;
  element: "fire" | "water" | "earth" | "wind" | "light" | "dark" | "plain" | null;
  rarity: string | null;
  tags: string[];
  details: CatalogDetails;
  owned: string | null;
  quantity: number | null;
  uncapLevel: number | null;
  notes: string | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  searchCatalog(params: URLSearchParams) {
    return request<{ items: CatalogItem[] }>(`/api/catalog?${params.toString()}`);
  },
  createCatalog(input: CatalogInput) {
    return request<{ item: CatalogItem }>("/api/catalog", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  setInventory(entityId: string, input: { owned: boolean; quantity: number; uncapLevel: number }) {
    return request(`/api/inventory/${entityId}`, { method: "PUT", body: JSON.stringify(input) });
  },
  candidates(input: {
    kind?: CatalogItem["kind"];
    element?: NonNullable<CatalogItem["element"]>;
    requiredTags: string[];
  }) {
    return request<{
      candidates: Array<
        CatalogItem & { score: number; matchedTags: string[]; missingTags: string[] }
      >;
    }>("/api/candidates", { method: "POST", body: JSON.stringify(input) });
  },
};
