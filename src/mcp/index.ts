import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createDatabase } from "../database/client.js";
import { CatalogRepository } from "../database/repository.js";
import { createMcpServer } from "./server.js";

const connection = createDatabase();
const repository = new CatalogRepository(connection.db);
const server = createMcpServer(repository);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("GF Database MCP server is running over stdio.");

async function shutdown() {
  await server.close();
  await connection.close();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
