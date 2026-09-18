import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import type { CatalogRepository } from "../database/repository.js";
import {
  catalogInputSchema,
  capabilityTagsSchema,
  elements,
  entityKinds,
  inventoryInputSchema,
} from "../domain/catalog.js";

const idSchema = z.uuid();
const allowedOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

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

  app.post("/api/catalog", zValidator("json", catalogInputSchema), async (context) => {
    const entity = await repository.create(context.req.valid("json"));
    return context.json({ item: entity }, 201);
  });

  app.put("/api/inventory/:entityId", zValidator("json", inventoryInputSchema), async (context) => {
    const entityId = idSchema.safeParse(context.req.param("entityId"));
    if (!entityId.success) return context.json({ error: "Invalid entity id." }, 400);
    const entry = await repository.setInventory(entityId.data, context.req.valid("json"));
    return context.json({ item: entry });
  });

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
    console.error(error);
    return context.json({ error: "Unexpected server error." }, 500);
  });

  return app;
}
