import { describe, expect, it } from "vite-plus/test";
import { recommendOwned, type RecommendationItem } from "./recommendations.js";

const owned: RecommendationItem[] = [
  {
    id: "b",
    kind: "character",
    name: "同名",
    element: "water",
    tags: ["heal"],
    quantity: 1,
    uncapLevel: 3,
  },
  {
    id: "a",
    kind: "character",
    name: "同名",
    element: "water",
    tags: ["heal"],
    quantity: 1,
    uncapLevel: 3,
  },
  {
    id: "w",
    kind: "weapon",
    name: "武器",
    element: "water",
    tags: ["attack"],
    quantity: 1,
    uncapLevel: 5,
  },
  { id: "s", kind: "summon", name: "召喚石", element: null, tags: [], quantity: 1, uncapLevel: 0 },
];

describe("recommendOwned", () => {
  it("returns bounded kind lists with explainable scores and stable ties", () => {
    const result = recommendOwned(owned, {
      element: "water",
      requiredTags: ["heal"],
      preferredTags: ["attack"],
      limitPerKind: 1,
    });
    expect(result.byKind.character.map((item) => item.id)).toEqual(["a"]);
    expect(result.byKind.character[0]).toMatchObject({
      eligible: true,
      matchedTags: ["heal"],
      missingTags: [],
      scoreBreakdown: { element: 5, requiredTags: 10, preferredTags: 0, uncap: 3 },
      score: 18,
    });
    expect(result.byKind.weapon[0]).toMatchObject({ eligible: false, missingTags: ["heal"] });
    expect(result.byKind.summon[0]).toMatchObject({ eligible: false, missingTags: ["heal"] });
  });

  it("warns without inventing conditions or inventory", () => {
    expect(recommendOwned([], {}).warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("条件"), expect.stringContaining("所持")]),
    );
    const result = recommendOwned(owned, { requiredTags: ["dispel"] });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("dispel")]));
    expect(result.byKind.character[0]?.eligible).toBe(false);
  });

  it("warns when catalog facts needed for scoring are missing", () => {
    const result = recommendOwned(owned, { element: "water", requiredTags: ["heal"] });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("属性不明"),
        expect.stringContaining("タグ未登録"),
      ]),
    );
  });

  it("warns when a kind has owned items but no item satisfies every required condition", () => {
    const result = recommendOwned(owned, { requiredTags: ["heal"] });
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("武器の適格候補"),
        expect.stringContaining("召喚石の適格候補"),
      ]),
    );
  });

  it("explains an element mismatch separately from missing tags", () => {
    const result = recommendOwned(owned, { element: "fire" });
    expect(result.byKind.character[0]).toMatchObject({
      eligible: false,
      missingTags: [],
      missingConditions: ["属性: fire"],
    });
  });
});
