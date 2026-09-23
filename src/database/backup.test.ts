import { afterEach, expect, test } from "vite-plus/test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readBackupMetadata,
  isCustomArchive,
  repositoryRoot,
  resolveExternalBackupPath,
  resolveExternalRestorePath,
} from "../../scripts/db-backup-common.js";

const created: string[] = [];
afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("backup refuses an output inside the repository", () => {
  expect(() => resolveExternalBackupPath("backups/my-data.dump", process.cwd())).toThrow(
    /outside the repository/,
  );
});

test("backup refuses a repository output even when launched from a subdirectory", () => {
  const original = process.cwd();
  try {
    process.chdir(join(repositoryRoot, "src"));
    expect(() => resolveExternalBackupPath("leak.dump", repositoryRoot)).toThrow(
      /outside the repository/,
    );
  } finally {
    process.chdir(original);
  }
});

test("backup refuses a symlinked parent that leads into the repository", () => {
  const directory = mkdtempSync(join(tmpdir(), "gf-backup-test-"));
  created.push(directory);
  symlinkSync(process.cwd(), join(directory, "repo"));
  expect(() =>
    resolveExternalBackupPath(join(directory, "repo", "private.dump"), process.cwd()),
  ).toThrow(/outside the repository/);
});

test("backup accepts an unused output outside the repository", () => {
  const directory = mkdtempSync(join(tmpdir(), "gf-backup-test-"));
  created.push(directory);
  expect(resolveExternalBackupPath(join(directory, "private.dump"), process.cwd())).toBe(
    join(directory, "private.dump"),
  );
});

test("backup refuses overwriting an existing dump", () => {
  const directory = mkdtempSync(join(tmpdir(), "gf-backup-test-"));
  created.push(directory);
  writeFileSync(join(directory, "private.dump"), "existing");
  expect(() => resolveExternalBackupPath(join(directory, "private.dump"), process.cwd())).toThrow(
    /already exists/,
  );
});

test("restore refuses a dump inside the repository", () => {
  expect(() =>
    resolveExternalRestorePath(join(process.cwd(), "private.dump"), process.cwd()),
  ).toThrow(/outside the repository/);
});

test("restore refuses a dump changed after backup", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gf-backup-test-"));
  created.push(directory);
  const dump = join(directory, "private.dump");
  writeFileSync(dump, "changed");
  writeFileSync(
    `${dump}.json`,
    JSON.stringify({
      format: "pg_dump custom",
      createdAt: "2026-09-22T00:00:00.000Z",
      schemaVersion: "3",
      database: "gf_database",
      sha256: "0".repeat(64),
    }),
  );
  await expect(readBackupMetadata(dump)).rejects.toThrow(/checksum/);
});

test("restore accepts pg_restore's custom archive listing", () => {
  expect(
    isCustomArchive(
      "; Archive created at 2026-09-22 10:53:56 UTC\n;     Format: CUSTOM\n; Selected TOC Entries:\n",
    ),
  ).toBe(true);
});
