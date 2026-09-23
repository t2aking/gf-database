import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export async function run(
  command: string,
  args: string[],
  input?: string | Buffer,
): Promise<string> {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.end(input);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0)
    throw new Error(
      Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}`,
    );
  return Buffer.concat(stdout).toString("utf8");
}

export async function findContainer(): Promise<string> {
  const chosen = process.env.GF_DB_CONTAINER?.trim();
  const container = chosen || (await run("docker", ["compose", "ps", "-q", "postgres"])).trim();
  if (!container)
    throw new Error(
      "No PostgreSQL container for this Compose project. Start it or set GF_DB_CONTAINER explicitly.",
    );
  const running = (
    await run("docker", ["inspect", "--format", "{{.State.Running}}", container])
  ).trim();
  if (running !== "true") throw new Error("Selected PostgreSQL container is not running.");
  return container;
}

export async function postgres(
  container: string,
  command: string,
  args: string[] = [],
  input?: string | Buffer,
): Promise<string> {
  return run(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-eu",
      "-c",
      `export PGPASSWORD="$POSTGRES_PASSWORD"; exec ${command}`,
      "sh",
      ...args,
    ],
    input,
  );
}

export async function postgresWithFile(
  container: string,
  command: string,
  file: string,
  args: string[] = [],
): Promise<string> {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-eu",
      "-c",
      `export PGPASSWORD="$POSTGRES_PASSWORD"; exec ${command}`,
      "sh",
      ...args,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const copying = pipeline(createReadStream(file), child.stdin);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  await copying;
  if (code !== 0)
    throw new Error(
      Buffer.concat(stderr).toString("utf8").trim() || `pg_restore exited with ${code}`,
    );
  return Buffer.concat(stdout).toString("utf8");
}

export async function dumpToFile(
  container: string,
  database: string,
  output: string,
): Promise<void> {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "sh",
      "-eu",
      "-c",
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"',
      "sh",
      database,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const outputStream = createWriteStream(output, { flags: "wx", mode: 0o600 });
  const copying = pipeline(child.stdout, outputStream);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  await copying;
  if (code !== 0)
    throw new Error(Buffer.concat(stderr).toString("utf8").trim() || `pg_dump exited with ${code}`);
}
