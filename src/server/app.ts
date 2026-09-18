import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import type { CatalogRepository } from "../database/repository.js";
import {
  catalogInputSchema,
  catalogUpdateSchema,
  capabilityTagsSchema,
  elements,
  entityKinds,
  inventoryInputSchema,
} from "../domain/catalog.js";

const idSchema = z.uuid();
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

function validationHook(
  result: { success: boolean; error?: z.core.$ZodError },
  context: import("hono").Context,
) {
  if (!result.success && result.error) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "form";
      (fieldErrors[field] ??= []).push(issue.message);
    }
    return context.json({ error: "入力内容を確認してください。", fieldErrors }, 400);
  }
}

export function createApp(repository: CatalogRepository) {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use("/api/*", async (context, next) => {
    const origin = context.req.header("origin");
    if (origin && !allowedOrigins.has(origin)) {
      return context.json({ error: "Origin is not allowed." }, 403);
    }
    await next();
  });

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/catalog", async (context) => {
    const kind = z.enum(entityKinds).safeParse(context.req.query("kind"));
    const element = z.enum(elements).safeParse(context.req.query("element"));
    const ownedValue = context.req.query("owned");
    const owned = ownedValue === "true" ? true : ownedValue === "false" ? false : undefined;
    const rows = await repository.search({
      query: context.req.query("query"),
      kind: kind.success ? kind.data : undefined,
      element: element.success ? element.data : undefined,
      owned,
    });
    return context.json({ items: rows });
  });

  app.post(
    "/api/catalog",
    zValidator("json", catalogInputSchema, validationHook),
    async (context) => {
      const entity = await repository.create(context.req.valid("json"));
      return context.json({ item: entity }, 201);
    },
  );

  app.get("/api/catalog/:entityId", async (context) => {
    const id = idSchema.safeParse(context.req.param("entityId"));
    if (!id.success) return context.json({ error: "Invalid entity id." }, 400);
    const item = await repository.get(id.data);
    if (!item) return context.json({ error: "Catalog item not found." }, 404);
    return context.json({ item });
  });

  app.put(
    "/api/catalog/:entityId",
    zValidator("json", catalogUpdateSchema, validationHook),
    async (context) => {
      const id = idSchema.safeParse(context.req.param("entityId"));
      if (!id.success) return context.json({ error: "Invalid entity id." }, 400);
      const item = await repository.update(id.data, context.req.valid("json"));
      if (!item) return context.json({ error: "Catalog item not found." }, 404);
      return context.json({ item });
    },
  );

  app.delete(
    "/api/catalog/:entityId",
    zValidator("json", z.strictObject({ confirm: z.literal(true) }), validationHook),
    async (context) => {
      const id = idSchema.safeParse(context.req.param("entityId"));
      if (!id.success) return context.json({ error: "Invalid entity id." }, 400);
      const item = await repository.delete(id.data);
      if (!item) return context.json({ error: "Catalog item not found." }, 404);
      return context.json({ item });
    },
  );

  app.put(
    "/api/inventory/:entityId",
    zValidator("json", inventoryInputSchema, validationHook),
    async (context) => {
      const entityId = idSchema.safeParse(context.req.param("entityId"));
      if (!entityId.success) return context.json({ error: "Invalid entity id." }, 400);
      if (!(await repository.get(entityId.data)))
        return context.json({ error: "Catalog item not found." }, 404);
      const entry = await repository.setInventory(entityId.data, context.req.valid("json"));
      return context.json({ item: entry });
    },
  );

  app.get("/api/inventory/summary", async (context) => {
    return context.json({ summary: await repository.inventorySummary() });
  });

  app.post(
    "/api/candidates",
    zValidator(
      "json",
      z.object({
        kind: z.enum(entityKinds).optional(),
        element: z.enum(elements).optional(),
        requiredTags: capabilityTagsSchema,
      }),
    ),
    async (context) => {
      const candidates = await repository.candidates(context.req.valid("json"));
      return context.json({ candidates: candidates.slice(0, 50) });
    },
  );

  app.onError((error, context) => {
    const cause = error.cause as { code?: string } | undefined;
    const code = (error as Error & { code?: string }).code ?? cause?.code;
    if (code === "23505")
      return context.json(
        {
          error: "同じ種類・名称の項目が既に存在します。",
          fieldErrors: { name: ["同じ種類・名称の項目が既に存在します。"] },
        },
        409,
      );
    if (code === "23503") return context.json({ error: "Catalog item not found." }, 404);
    console.error(error);
    return context.json({ error: "Unexpected server error." }, 500);
  });

  return app;
}
