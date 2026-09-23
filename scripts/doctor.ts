import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { getDatabaseUrl } from "../src/config.js";
import { assessMigrations } from "../src/setup/doctor.js";

function reportVersion(name: string, actual: string, expected: string): boolean {
  const actualParts = actual.replace(/^v/, "").split(".").map(Number);
  const expectedParts = expected.split(".").map(Number);
  const difference = expectedParts.findIndex((part, index) => actualParts[index] !== part);
  const ok =
    actualParts.every(Number.isFinite) &&
    (difference === -1 || actualParts[difference] > expectedParts[difference]);
  console.log(`${ok ? "OK  " : "FAIL"} ${name} ${actual} (required >= ${expected})`);
  return ok;
}

async function main(): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  const packageInfo = (await import("../package.json", { with: { type: "json" } })).default;
  const minimumNode = packageInfo.engines.node.replace(">=", "");
  const minimumPnpm = packageInfo.packageManager.replace("pnpm@", "");
  let ok = reportVersion("Node.js", process.version, minimumNode);
  ok =
    reportVersion(
      "pnpm",
      execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(),
      minimumPnpm,
    ) && ok;

  let url: string;
  try {
    url = getDatabaseUrl();
  } catch {
    console.error("FAIL DATABASE_URL is missing; check .env");
    process.exitCode = 1;
    return;
  }
  const client = postgres(url, { max: 1, connect_timeout: 3 });
  try {
    await client`SELECT 1`;
    console.log("OK   PostgreSQL connection and authentication");
    const expected = readMigrationFiles({ migrationsFolder: "drizzle" });
    const exists = await client<
      { exists: string | null }[]
    >`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS exists`;
    const applied = exists[0].exists
      ? await client<
          { created_at: string; hash: string }[]
        >`SELECT created_at, hash FROM drizzle.__drizzle_migrations ORDER BY created_at`
      : [];
    const status = assessMigrations(expected, applied);
    if (status.ok) console.log(`OK   migrations: ${status.applied}/${expected.length} applied`);
    else if (status.mismatch)
      console.error("FAIL migrations differ from this checkout; check DB and migration history");
    else
      console.error(
        `FAIL migrations: ${status.applied}/${expected.length} applied; run vp run db:migrate`,
      );
    ok = status.ok && ok;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT")
      console.error("FAIL PostgreSQL is unreachable; run docker compose up -d and check port 5432");
    else if (code === "28P01" || code === "28000")
      console.error("FAIL PostgreSQL authentication; compare .env with docker-compose.yml");
    else
      console.error(
        `FAIL PostgreSQL diagnosis: ${error instanceof Error ? error.message : String(error)}`,
      );
    ok = false;
  } finally {
    await client.end();
  }
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`FAIL doctor: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
