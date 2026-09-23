import { describe, expect, it } from "vite-plus/test";
import { assessMigrations } from "./doctor.js";

const expected = [
  { folderMillis: 100, hash: "first" },
  { folderMillis: 200, hash: "second" },
];

describe("assessMigrations", () => {
  it("reports an empty database and missing migrations", () => {
    expect(assessMigrations(expected, [])).toMatchObject({ ok: false, applied: 0, pending: 2 });
  });

  it("reports the current state", () => {
    expect(
      assessMigrations(expected, [
        { created_at: 100, hash: "first" },
        { created_at: 200, hash: "second" },
      ]),
    ).toMatchObject({ ok: true, applied: 2, pending: 0 });
  });

  it("rejects a changed migration file", () => {
    expect(assessMigrations(expected, [{ created_at: 100, hash: "other" }]).ok).toBe(false);
  });

  it("rejects migrations unknown to this checkout", () => {
    expect(
      assessMigrations(expected, [
        { created_at: 100, hash: "first" },
        { created_at: 300, hash: "future" },
      ]).ok,
    ).toBe(false);
  });
});
