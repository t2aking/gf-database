import "dotenv/config";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server";

type Response = { id?: number; result?: Record<string, unknown>; error?: unknown };

async function main(): Promise<void> {
  const child = spawn("sh", ["scripts/run-mcp.sh"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  const waiting = new Map<
    number,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  lines.on("line", (line) => {
    try {
      const message = JSON.parse(line) as Response;
      if (typeof message.id === "number") {
        waiting.get(message.id)?.resolve(message);
        waiting.delete(message.id);
      }
    } catch {
      for (const item of waiting.values())
        item.reject(new Error("MCP stdout contained non-JSON data"));
      waiting.clear();
    }
  });
  child.on("error", (error) => {
    for (const item of waiting.values()) item.reject(error);
    waiting.clear();
  });
  child.on("close", () => {
    for (const item of waiting.values())
      item.reject(new Error("MCP server exited before replying"));
    waiting.clear();
  });

  async function request(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const id = ++nextId;
    const response = await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`${method} timed out after 10 seconds`));
      }, 10_000);
      waiting.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
    if (response.error || !response.result) throw new Error(`${method} returned an error`);
    return response.result;
  }

  try {
    const initialized = await request("initialize", {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "gf-mcp-smoke", version: "1.0.0" },
    });
    if ((initialized.serverInfo as { name?: string } | undefined)?.name !== "gf-database")
      throw new Error("Unexpected MCP server identity");
    console.log("OK   MCP initialize");
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );

    const listed = await request("tools/list");
    const tools = listed.tools as Array<{ name: string }> | undefined;
    if (!tools?.some((tool) => tool.name === "get_inventory_summary"))
      throw new Error("get_inventory_summary is missing from tools/list");
    console.log(`OK   tools/list (${tools.length} tools)`);

    const called = await request("tools/call", { name: "get_inventory_summary", arguments: {} });
    if (called.isError || !(called.structuredContent as { summary?: unknown } | undefined)?.summary)
      throw new Error("get_inventory_summary failed");
    console.log("OK   tools/call get_inventory_summary");
  } catch (error) {
    console.error(`FAIL MCP smoke: ${error instanceof Error ? error.message : String(error)}`);
    if (stderr)
      console.error("Run sh scripts/doctor.sh to inspect DB and environment prerequisites.");
    process.exitCode = 1;
  } finally {
    child.kill();
    lines.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
