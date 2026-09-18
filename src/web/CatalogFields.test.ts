import { describe, expect, it } from "vite-plus/test";
import { catalogUpdateSchema } from "../domain/catalog.js";
import { catalogFormInput } from "./CatalogFields.js";

function weaponForm(maximum: string) {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    name: "架空の入力検証武器",
    element: "",
    rarity: "",
    tags: "回復, heal",
    weaponType: "sword",
    skillEffects: "attack, hp",
    maxUncapLevel: maximum,
  }))
    form.set(name, value);
  return form;
}
describe("catalog form validation", () => {
  it("rejects an empty required number instead of silently saving zero", () => {
    const parsed = catalogUpdateSchema.safeParse(catalogFormInput(weaponForm(""), "weapon"));
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(
        parsed.error.issues.some((issue) => issue.path.join(".") === "details.maxUncapLevel"),
      ).toBe(true);
  });
  it("allows explicit zero and clears optional fields", () => {
    const parsed = catalogUpdateSchema.parse(catalogFormInput(weaponForm("0"), "weapon"));
    expect(parsed).toMatchObject({
      element: null,
      rarity: null,
      tags: ["heal"],
      details: { maxUncapLevel: 0, skillEffects: ["attack", "hp"] },
    });
  });
});
