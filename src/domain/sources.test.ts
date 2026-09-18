import { describe, expect, it } from "vite-plus/test";
import { sourceInputSchema, sourceReviewCutoff } from "./sources.js";
import { catalogInputSchema } from "./catalog.js";

const base = {
  kind: "weapon",
  name: "架空の出典検証武器",
  details: { weaponType: "sword", skillEffects: ["attack"], maxUncapLevel: 5 },
};
const source = { kind: "user", observedAt: "2026-01-01T00:00:00Z" };
describe("source validation shared with catalog creation", () => {
  it.each([
    "javascript:alert(1)",
    "ftp://example.com/file",
    "data:text/plain,example",
    `https://example.com/${"a".repeat(2048)}`,
  ])("rejects unsafe or oversized URL %s", (url) => {
    expect(catalogInputSchema.safeParse({ ...base, source: { ...source, url } }).success).toBe(
      false,
    );
  });
  it("accepts a verification date and optional null fields", () => {
    const parsed = catalogInputSchema.parse({
      ...base,
      source: { ...source, url: null, note: null, verifiedAt: "2026-01-02T00:00:00Z" },
    });
    expect(parsed.source).toMatchObject({ verifiedAt: "2026-01-02T00:00:00Z", url: null });
  });
  it.each(["2026-02-30T00:00:00Z", "not-a-date", ""])(
    "rejects invalid observation and verification dates",
    (date) => {
      expect(sourceInputSchema.safeParse({ ...source, observedAt: date }).success).toBe(false);
      expect(sourceInputSchema.safeParse({ ...source, verifiedAt: date }).success).toBe(false);
    },
  );
  it("enforces note length and permits a URL at the exact limit", () => {
    expect(sourceInputSchema.safeParse({ ...source, note: "a".repeat(501) }).success).toBe(false);
    expect(
      sourceInputSchema.safeParse({ ...source, url: "https://example.com/" + "a".repeat(2028) })
        .success,
    ).toBe(true);
    expect(sourceReviewCutoff(new Date("2026-09-18T00:00:00Z")).toISOString()).toBe(
      "2026-06-20T00:00:00.000Z",
    );
  });
});
