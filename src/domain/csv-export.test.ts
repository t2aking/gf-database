import { describe, expect, it } from "vite-plus/test";
import { exportCatalogCsv } from "./csv-export.js";
import { maxImportBytes, parseImportCsv } from "./csv-import.js";

const character = {
  kind: "character" as const,
  name: '架空,"支援"\n役',
  element: "wind" as const,
  rarity: "SSR",
  tags: ["heal", "dispel"],
  details: {
    roles: ["support" as const],
    weaponProficiencies: ["staff" as const],
    races: ["human" as const],
  },
  owned: true,
  quantity: 2,
  uncapLevel: 4,
  awakeningLevel: 3,
  notes: '日本語,"メモ"\n次行',
};

describe("catalog CSV export", () => {
  it("round trips all three kinds and quoted values through the import parser", () => {
    const files = exportCatalogCsv([
      character,
      {
        kind: "weapon",
        name: "架空の剣",
        element: "fire",
        rarity: null,
        tags: ["attack"],
        details: { weaponType: "sword", skillEffects: ["attack"], maxUncapLevel: 5 },
        owned: true,
        quantity: 1,
        uncapLevel: 2,
        awakeningLevel: null,
        notes: null,
      },
      {
        kind: "summon",
        name: "架空の石",
        element: null,
        rarity: null,
        tags: [],
        details: { auraEffects: ["element-attack"], callEffects: ["buff"], maxUncapLevel: 5 },
        owned: false,
        quantity: null,
        uncapLevel: null,
        awakeningLevel: null,
        notes: null,
      },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(
      /^\ufeffkind,name,element,rarity,tags,owned,quantity,uncapLevel,awakeningLevel,notes,details\r\n/,
    );
    const parsed = parseImportCsv(files[0]!);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      catalog: { name: character.name, details: character.details },
      inventory: {
        owned: true,
        quantity: 2,
        uncapLevel: 4,
        awakeningLevel: 3,
        notes: character.notes,
      },
    });
    expect(parsed.rows[1]).toMatchObject({
      catalog: { kind: "weapon", details: { weaponType: "sword" } },
      inventory: { owned: true },
    });
    expect(parsed.rows[2]).toMatchObject({
      catalog: { kind: "summon" },
      inventory: { owned: false },
    });
  });

  it("splits at the import row and byte limits without losing records", () => {
    const many = Array.from({ length: 1001 }, (_, index) => ({
      ...character,
      name: `架空${index}`,
    }));
    const files = exportCatalogCsv(many);
    expect(files).toHaveLength(2);
    expect(files.map((file) => parseImportCsv(file).total)).toEqual([1000, 1]);
    expect(files.every((file) => new TextEncoder().encode(file).length <= maxImportBytes)).toBe(
      true,
    );

    const large = Array.from({ length: 900 }, (_, index) => ({
      ...character,
      name: `長い${index}`,
      notes: "あ".repeat(900),
    }));
    const byteFiles = exportCatalogCsv(large);
    expect(byteFiles.length).toBeGreaterThan(1);
    expect(byteFiles.flatMap((file) => parseImportCsv(file).rows)).toHaveLength(900);
    expect(byteFiles.every((file) => new TextEncoder().encode(file).length <= maxImportBytes)).toBe(
      true,
    );
  });
});
