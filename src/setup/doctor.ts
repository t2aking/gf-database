export type Migration = { folderMillis: number; hash: string };
export type AppliedMigration = { created_at: number | string; hash: string };

export function assessMigrations(expected: Migration[], applied: AppliedMigration[]) {
  const pending = Math.max(0, expected.length - applied.length);
  const mismatch = applied.find(
    (migration, index) =>
      !expected[index] ||
      Number(migration.created_at) !== expected[index].folderMillis ||
      migration.hash !== expected[index].hash,
  );
  return {
    ok: !mismatch && pending === 0,
    applied: applied.length,
    pending,
    mismatch: Boolean(mismatch),
  };
}
