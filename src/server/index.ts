import { serve } from "@hono/node-server";
import { getApiPort } from "../config.js";
import { createDatabase } from "../database/client.js";
import { CatalogRepository } from "../database/repository.js";
import { createApp } from "./app.js";

const connection = createDatabase();
const app = createApp(new CatalogRepository(connection.db));
const port = getApiPort();

const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
  console.info(`GF Database API listening on http://127.0.0.1:${info.port}`);
});

async function shutdown() {
  server.close();
  await connection.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
