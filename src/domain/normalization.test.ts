import { describe, expect, it } from "vite-plus/test";
import { normalizeName, normalizeTag, normalizeTags } from "./normalization.js";

describe("normalization", () => {
  it("normalizes names without removing meaningful characters", () => {
    expect(normalizeName("  Ｓａｍｐｌｅ 剣士  ")).toBe("sample 剣士");
  });

  it("normalizes tag spelling and aliases", () => {
    expect(normalizeTag(" Damage_Cut ")).toBe("damage-cut");
    expect(normalizeTag("ディスペル")).toBe("dispel");
  });

  it("deduplicates normalized tags while preserving order", () => {
    expect(normalizeTags(["回復", "HEAL", "dispel"])).toEqual(["heal", "dispel"]);
  });
});
