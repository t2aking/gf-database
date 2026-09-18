import { describe, expect, it } from "vite-plus/test";
import { sourceInputSchema } from "../domain/sources.js";
import { dateTimeInput, sourceDates } from "./SourceManager.js";

describe("source date form conversion", () => {
  it("uses displayed dates when saving and round trips the local timezone", () => {
    const form = new FormData();
    form.set("observedAt", dateTimeInput("2026-01-01T03:00:00Z"));
    form.set("verifiedAt", dateTimeInput("2026-02-01T03:00:00Z"));
    expect(sourceDates(form)).toEqual({
      observedAt: "2026-01-01T03:00:00.000Z",
      verifiedAt: "2026-02-01T03:00:00.000Z",
    });
    form.set("verifiedAt", "");
    expect(sourceDates(form).verifiedAt).toBeNull();
  });
  it("keeps empty required dates invalid instead of substituting the current time", () => {
    expect(
      sourceInputSchema.safeParse({ kind: "user", ...sourceDates(new FormData()) }).success,
    ).toBe(false);
  });
});
