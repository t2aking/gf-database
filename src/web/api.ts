import type {
  CatalogDetails,
  CatalogInput,
  CatalogUpdate,
  InventoryInput,
} from "../domain/catalog.js";

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
  awakeningLevel: number | null;
};

export type CatalogDetail = Pick<
  CatalogItem,
  "id" | "kind" | "name" | "element" | "rarity" | "tags" | "details"
> & {
  inventory: {
    quantity: number;
    uncapLevel: number;
    awakeningLevel: number | null;
    notes: string | null;
  } | null;
  sources: Array<{
    id: string;
    kind: string;
    url: string | null;
    note: string | null;
    observedAt: string;
  }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    } | null;
    throw new ApiError(body?.error ?? `Request failed (${response.status})`, body?.fieldErrors);
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
  getCatalog(entityId: string) {
    return request<{ item: CatalogDetail }>(`/api/catalog/${entityId}`);
  },
  updateCatalog(entityId: string, input: CatalogUpdate) {
    return request(`/api/catalog/${entityId}`, { method: "PUT", body: JSON.stringify(input) });
  },
  deleteCatalog(entityId: string) {
    return request(`/api/catalog/${entityId}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });
  },
  setInventory(entityId: string, input: InventoryInput) {
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
