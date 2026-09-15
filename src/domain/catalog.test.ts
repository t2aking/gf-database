import { describe, expect, it } from "vite-plus/test";
import {
  capabilityTagsSchema,
  catalogInputSchema,
  rankOwnedCandidates,
  type Candidate,
} from "./catalog.js";

const candidates: Candidate[] = [
  {
    id: "a",
    kind: "character",
    name: "防御役",
    element: "fire",
    tags: ["damage-cut", "heal"],
    quantity: 1,
    uncapLevel: 4,
  },
  {
    id: "b",
    kind: "character",
    name: "攻撃役",
    element: "water",
    tags: ["attack"],
    quantity: 1,
    uncapLevel: 5,
  },
];

describe("rankOwnedCandidates", () => {
  it("prioritizes matching element and required roles", () => {
    const result = rankOwnedCandidates(candidates, {
      element: "fire",
      requiredTags: ["damage-cut"],
    });

    expect(result[0]?.id).toBe("a");
    expect(result[0]?.matchedTags).toEqual(["damage-cut"]);
  });

  it("does not duplicate repeated requirements", () => {
    const result = rankOwnedCandidates(candidates, {
      requiredTags: ["heal", "heal"],
    });

    expect(result[0]?.matchedTags).toEqual(["heal"]);
  });
});

describe("catalogInputSchema", () => {
  it("accepts and normalizes controlled character data", () => {
    const result = catalogInputSchema.parse({
      kind: "character",
      name: "サンプル支援役",
      element: "wind",
      tags: [" Damage_Cut ", "回復", "heal"],
      details: {
        roles: ["support"],
        weaponProficiencies: ["staff"],
        races: ["human"],
      },
    });

    expect(result.tags).toEqual(["damage-cut", "heal"]);
  });

  it("rejects details belonging to another entity kind", () => {
    const result = catalogInputSchema.safeParse({
      kind: "weapon",
      name: "不正な武器",
      tags: [],
      details: {
        roles: ["attacker"],
        weaponProficiencies: ["sword"],
        races: ["human"],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown capability tags", () => {
    expect(capabilityTagsSchema.safeParse(["not-managed"]).success).toBe(false);
  });
});
