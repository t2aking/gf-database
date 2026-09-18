import type { ImportPreview } from "../domain/csv-import.js";
import type { SourceInput, SourceStatus } from "../domain/sources.js";
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
  sourceCount: number;
  lastConfirmedAt: string | null;
  sourceStatus: SourceStatus;
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
  sources: SourceReference[];
};

export type SourceReference = {
  id: string;
  kind: SourceInput["kind"];
  url: string | null;
  note: string | null;
  observedAt: string;
  verifiedAt: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly importPreview?: ImportPreview,
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
      preview?: ImportPreview;
    } | null;
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      body?.fieldErrors,
      body?.preview,
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  previewImport(csv: string) {
    return request<{ preview: ImportPreview; token: string | null }>("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
  },
  applyImport(csv: string, token: string) {
    return request<{ preview: ImportPreview; applied: boolean }>("/api/import/apply", {
      method: "POST",
      body: JSON.stringify({ csv, token, confirm: true }),
    });
  },
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
  createSource(entityId: string, input: SourceInput) {
    return request<{ item: SourceReference }>(`/api/catalog/${entityId}/sources`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateSource(entityId: string, sourceId: string, input: SourceInput) {
    return request<{ item: SourceReference }>(`/api/catalog/${entityId}/sources/${sourceId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  deleteSource(entityId: string, sourceId: string) {
    return request(`/api/catalog/${entityId}/sources/${sourceId}`, { method: "DELETE" });
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
