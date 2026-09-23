import { createReadStream, lstatSync, readFileSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isWithin(path: string, root: string): boolean {
  const part = relative(root, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

function rejectRepositoryPath(path: string, repository: string): void {
  if (isWithin(path, realpathSync(repository))) {
    throw new Error("Backup files must stay outside the repository.");
  }
}

export function resolveExternalBackupPath(input: string, repository: string): string {
  const path = resolve(input);
  if (!path.endsWith(".dump")) throw new Error("Backup output must end in .dump.");
  rejectRepositoryPath(path, repository);
  const parent = realpathSync(dirname(path));
  rejectRepositoryPath(join(parent, basename(path)), repository);
  if (
    lstatSync(path, { throwIfNoEntry: false }) ||
    lstatSync(`${path}.json`, { throwIfNoEntry: false })
  ) {
    throw new Error("Backup output or metadata already exists.");
  }
  return path;
}

export function resolveExternalRestorePath(input: string, repository: string): string {
  rejectRepositoryPath(resolve(input), repository);
  const path = realpathSync(resolve(input));
  rejectRepositoryPath(path, repository);
  if (!lstatSync(path).isFile()) throw new Error("Backup input must be a file.");
  return path;
}

export interface BackupMetadata {
  format: "pg_dump custom";
  createdAt: string;
  schemaVersion: string;
  database: string;
  sha256: string;
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function readBackupMetadata(file: string): Promise<BackupMetadata> {
  const metadata: unknown = JSON.parse(readFileSync(`${file}.json`, "utf8"));
  if (typeof metadata !== "object" || metadata === null)
    throw new Error("Invalid backup metadata.");
  const value = metadata as Partial<BackupMetadata>;
  if (
    value.format !== "pg_dump custom" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.schemaVersion !== "string" ||
    typeof value.database !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256 ?? "")
  ) {
    throw new Error("Invalid backup metadata.");
  }
  if ((await sha256File(file)) !== value.sha256)
    throw new Error("Backup checksum does not match metadata.");
  return value as BackupMetadata;
}

export function isCustomArchive(listing: string): boolean {
  return /^;\s*Format:\s*CUSTOM\s*;?\s*$/im.test(listing);
}
