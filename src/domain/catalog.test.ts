import { describe, expect, it } from "vite-plus/test";
import { rankOwnedCandidates, type Candidate } from "./catalog.js";

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
