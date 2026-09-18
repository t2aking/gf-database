import { createHmac, randomBytes } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { maxImportBytes, type ImportPreview } from "../domain/csv-import.js";
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

import { sourceInputSchema, sourceStatuses } from "../domain/sources.js";

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
  const importSecret = randomBytes(32);
  const importToken = (csv: string, preview: ImportPreview) =>
    createHmac("sha256", importSecret).update(JSON.stringify({ csv, preview })).digest("hex");
  const csvRequestSchema = z.strictObject({ csv: z.string().max(maxImportBytes) });
  app.use(
    "/api/import/*",
    bodyLimit({
      maxSize: maxImportBytes * 2,
      onError: (context) => context.json({ error: "CSVは1MiB以内にしてください。" }, 413),
    }),
  );

  app.use("*", secureHeaders());
  app.use("/api/*", async (context, next) => {
    const origin = context.req.header("origin");
    if (origin && !allowedOrigins.has(origin)) {
      return context.json({ error: "Origin is not allowed." }, 403);
    }
    await next();
  });

  app.post(
    "/api/import/preview",
    zValidator("json", csvRequestSchema, validationHook),
    async (context) => {
      const { csv } = context.req.valid("json");
      const preview = await repository.previewImport(csv);
      return context.json({
        preview,
        token: preview.errors.length ? null : importToken(csv, preview),
      });
    },
  );
  app.post(
    "/api/import/apply",
    zValidator(
      "json",
      csvRequestSchema.extend({ confirm: z.literal(true), token: z.string().max(128) }),
      validationHook,
    ),
    async (context) => {
      const { csv, token } = context.req.valid("json");
      try {
        const result = await repository.applyImport(
          csv,
          (preview) => token === importToken(csv, preview),
        );
        if (!result.applied)
          return context.json(
            {
              error: result.conflict
                ? "CSVまたは登録予定が変わりました。プレビューを再実行してください。"
                : "CSVに不正な行があります。",
              preview: result.preview,
            },
            result.conflict ? 409 : 400,
          );
        return context.json(result);
      } catch (caught) {
        const error = caught as { code?: string; cause?: { code?: string } };
        if ((error.code ?? error.cause?.code) === "40001")
          return context.json(
            { error: "保存中にデータが変更されました。プレビューを再実行してください。" },
            409,
          );
        // Do not log CSV-derived values in SQL error messages.
        return context.json({ error: "一括保存に失敗しました。全行の変更を取り消しました。" }, 500);
      }
    },
  );

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/catalog", async (context) => {
    const kind = z.enum(entityKinds).safeParse(context.req.query("kind"));
    const element = z.enum(elements).safeParse(context.req.query("element"));
    const sourceStatus = z
      .enum(sourceStatuses)
      .optional()
      .safeParse(context.req.query("sourceStatus"));
    if (!sourceStatus.success) return context.json({ error: "Invalid source status." }, 400);
    const ownedValue = context.req.query("owned");
    const owned = ownedValue === "true" ? true : ownedValue === "false" ? false : undefined;
    const rows = await repository.search({
      query: context.req.query("query"),
      kind: kind.success ? kind.data : undefined,
      element: element.success ? element.data : undefined,
      owned,
      sourceStatus: sourceStatus.data,
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

  app.get("/api/catalog/:entityId/sources", async (context) => {
    const id = idSchema.safeParse(context.req.param("entityId"));
    if (!id.success) return context.json({ error: "Invalid entity id." }, 400);
    const items = await repository.listSources(id.data);
    if (!items) return context.json({ error: "Catalog item not found." }, 404);
    return context.json({ items });
  });

  app.post(
    "/api/catalog/:entityId/sources",
    zValidator("json", sourceInputSchema, validationHook),
    async (context) => {
      const id = idSchema.safeParse(context.req.param("entityId"));
      if (!id.success) return context.json({ error: "Invalid entity id." }, 400);
      if (!(await repository.get(id.data)))
        return context.json({ error: "Catalog item not found." }, 404);
      const item = await repository.createSource(id.data, context.req.valid("json"));
      return context.json({ item }, 201);
    },
  );

  app.put(
    "/api/catalog/:entityId/sources/:sourceId",
    zValidator("json", sourceInputSchema, validationHook),
    async (context) => {
      const id = idSchema.safeParse(context.req.param("entityId"));
      const sourceId = idSchema.safeParse(context.req.param("sourceId"));
      if (!id.success || !sourceId.success) return context.json({ error: "Invalid id." }, 400);
      const item = await repository.updateSource(id.data, sourceId.data, context.req.valid("json"));
      if (!item) return context.json({ error: "Source not found." }, 404);
      return context.json({ item });
    },
  );

  app.delete("/api/catalog/:entityId/sources/:sourceId", async (context) => {
    const id = idSchema.safeParse(context.req.param("entityId"));
    const sourceId = idSchema.safeParse(context.req.param("sourceId"));
    if (!id.success || !sourceId.success) return context.json({ error: "Invalid id." }, 400);
    const item = await repository.deleteSource(id.data, sourceId.data);
    if (!item) return context.json({ error: "Source not found." }, 404);
    return context.json({ item });
  });

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
