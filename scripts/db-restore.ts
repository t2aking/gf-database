import { createInterface } from "node:readline/promises";
import {
  isCustomArchive,
  readBackupMetadata,
  repositoryRoot,
  resolveExternalRestorePath,
} from "./db-backup-common.js";
import { findContainer, postgres, postgresWithFile } from "./db-docker.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--database" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(args[1])) {
    throw new Error(
      "Usage: vp run db:restore --database EMPTY_DATABASE /path/outside/repository/name.dump",
    );
  }
  const target = args[1];
  const file = resolveExternalRestorePath(args[2], repositoryRoot);
  const metadata = await readBackupMetadata(file);
  const container = await findContainer();
  const source = (await postgres(container, 'printf "%s" "$POSTGRES_DB"')).trim();
  if (target === source)
    throw new Error("Restore target must differ from the source database in this container.");
  const archive = await postgresWithFile(container, "pg_restore --list", file);
  if (!isCustomArchive(archive))
    throw new Error("Backup is not a PostgreSQL custom-format archive.");
  const objects = (
    await postgres(
      container,
      "psql -v ON_ERROR_STOP=1 -Atq -U \"$POSTGRES_USER\" -d \"$1\" -c \"SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')\"",
      [target],
    )
  ).trim();
  if (objects !== "0") throw new Error(`Target database ${target} is not empty; restore refused.`);
  console.info(
    `Backup: ${file}\nCreated: ${metadata.createdAt}\nSource database: ${metadata.database}\nSchema version: ${metadata.schemaVersion}\nFormat: ${metadata.format}`,
  );
  console.info(
    `Restore target: database ${target} in container ${container}. This creates tables and copies all saved data into the empty target.`,
  );
  const expected = `RESTORE ${target}`;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = await prompt.question(`Type ${expected} to continue: `);
  } finally {
    prompt.close();
  }
  if (answer !== expected) throw new Error("Restore cancelled; confirmation did not match.");
  await postgresWithFile(
    container,
    'pg_restore --single-transaction --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$1"',
    file,
    [target],
  );
  console.info(`Restore complete in ${target}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
