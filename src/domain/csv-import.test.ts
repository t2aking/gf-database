import { describe, expect, it } from "vite-plus/test";
import { parseImportCsv, importTemplate } from "./csv-import.js";
const header =
  "kind,name,element,rarity,tags,owned,quantity,uncapLevel,awakeningLevel,notes,details";
const details = '"{""weaponType"":""sword"",""skillEffects"":[""attack""],""maxUncapLevel"":5}"';
describe("CSV import parsing", () => {
  it("handles BOM, CRLF, quoted commas, escaped quotes and embedded newlines", () => {
    const result = parseImportCsv(
      `\ufeff${header}\r\nweapon,"架空,武器",wind,SSR,heal|dispel,true,2,4,,"架空の""メモ""\n次行",${details}\r\n`,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      line: 2,
      catalog: { name: "架空,武器", tags: ["heal", "dispel"] },
      inventory: { owned: true, quantity: 2, notes: '架空の"メモ"\n次行' },
    });
  });
  it("reports invalid fields and physical row numbers", () => {
    const result = parseImportCsv(`${header}\nweapon,架空,,,,yes,-1,0,,メモ,${details}`);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 2, field: "owned" }),
        expect.objectContaining({ line: 2, field: "quantity" }),
      ]),
    );
  });
  it("rejects duplicate normalized keys and malformed CSV", () => {
    expect(
      parseImportCsv(`${header}\nweapon,Ａ,,,,false,,,,,\nweapon,A,,,,false,,,,,`).errors,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ line: 3, field: "name" })]));
    expect(parseImportCsv(`${header}\nweapon,"unterminated`).errors[0]?.field).toBe("csv");
  });
  it("rejects invalid JSON and duplicate or unknown headers", () => {
    expect(parseImportCsv(`${header}\nweapon,架空,,,,false,,,,,invalid`).errors[0]?.field).toBe(
      "details",
    );
    expect(parseImportCsv(`${header},name\n`).errors.length).toBeGreaterThan(0);
    expect(parseImportCsv(`${header},source\n`).errors.length).toBeGreaterThan(0);
  });
  it("validates the fictional template and rejects non-decimal numbers and empty records", () => {
    expect(parseImportCsv(importTemplate())).toMatchObject({ total: 3, errors: [] });
    expect(parseImportCsv(importTemplate().replace('"2","4"', '"0x2","4"')).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "quantity" })]),
    );
    expect(parseImportCsv(`${header}\n,,,,,,,,,,`).errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "kind" })]),
    );
  });
});
