import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it("ignores CSV and rejects forcibly tracked CSV while allowing documentation", () => {
  const directory = mkdtempSync(join(tmpdir(), "gf-policy-test-"));
  try {
    execFileSync("git", ["init", "-q", directory]);
    copyFileSync(new URL("../../.gitignore", import.meta.url), join(directory, ".gitignore"));
    for (const name of ["example.csv", "other.CsV"]) {
      writeFileSync(join(directory, name), "kind,name\nweapon,架空の検査用武器\n");
      expect(spawnSync("git", ["check-ignore", "-q", name], { cwd: directory }).status).toBe(0);
      execFileSync("git", ["add", "-f", name], { cwd: directory });
    }
    const script = fileURLToPath(new URL("../../scripts/check-public-data.sh", import.meta.url));
    expect(spawnSync("sh", [script, "--all"], { cwd: directory }).status).toBe(1);
    execFileSync("git", ["rm", "--cached", "example.csv", "other.CsV"], { cwd: directory });
    writeFileSync(join(directory, "README.md"), "# Fictional fixture\n");
    execFileSync("git", ["add", "README.md"], { cwd: directory });
    expect(spawnSync("sh", [script, "--all"], { cwd: directory }).status).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
