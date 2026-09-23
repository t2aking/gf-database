import { unlinkSync, writeFileSync } from "node:fs";
import {
  readBackupMetadata,
  repositoryRoot,
  resolveExternalBackupPath,
  sha256File,
  type BackupMetadata,
} from "./db-backup-common.js";
import { dumpToFile, findContainer, postgres } from "./db-docker.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--database" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(args[1]))
    throw new Error(
      "Usage: vp run db:backup --database DATABASE /path/outside/repository/name.dump",
    );
  const database = args[1];
  const output = resolveExternalBackupPath(args[2], repositoryRoot);
  const container = await findContainer();
  const schemaVersion = (
    await postgres(
      container,
      'psql -v ON_ERROR_STOP=1 -Atq -U "$POSTGRES_USER" -d "$1" -c "SELECT COALESCE(MAX(id)::text, \'none\') FROM drizzle.__drizzle_migrations"',
      [database],
    )
  ).trim();
  console.info(`Backing up database ${database} from container ${container} to ${output}`);
  try {
    await dumpToFile(container, database, output);
    const metadata: BackupMetadata = {
      format: "pg_dump custom",
      createdAt: new Date().toISOString(),
      schemaVersion,
      database,
      sha256: await sha256File(output),
    };
    writeFileSync(`${output}.json`, `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await readBackupMetadata(output);
    console.info(
      `Backup complete. Created: ${metadata.createdAt}; schema version: ${metadata.schemaVersion}; format: ${metadata.format}.`,
    );
  } catch (error) {
    try {
      unlinkSync(output);
    } catch {
      /* No output to remove. */
    }
    try {
      unlinkSync(`${output}.json`);
    } catch {
      /* No metadata to remove. */
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
