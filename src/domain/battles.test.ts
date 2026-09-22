import { describe, expect, it } from "vite-plus/test";
import { battleInputSchema, resolveCandidateCriteria } from "./battles.js";

const battle = {
  name: "架空の試験バトル",
  enemyElement: "fire",
  recommendedElement: "water",
  purpose: "full-auto",
  requiredTags: ["回復"],
  preferredTags: ["dispel"],
  notes: "長文転載なし",
};

describe("battle conditions", () => {
  it("normalizes managed tags and supplies typed candidate criteria", () => {
    const parsed = battleInputSchema.parse(battle);
    expect(parsed.requiredTags).toEqual(["heal"]);
    expect(resolveCandidateCriteria(parsed)).toEqual({
      element: "water",
      requiredTags: ["heal"],
      preferredTags: ["dispel"],
    });
  });

  it("rejects unknown tags and invalid elements", () => {
    expect(battleInputSchema.safeParse({ ...battle, requiredTags: ["unknown-tag"] }).success).toBe(
      false,
    );
    expect(battleInputSchema.safeParse({ ...battle, enemyElement: "ice" }).success).toBe(false);
    expect(battleInputSchema.safeParse({ ...battle, recommendedElement: "ice" }).success).toBe(
      false,
    );
  });
});
