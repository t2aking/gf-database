import { z } from "zod";
import { sourceInputSchema } from "./sources.js";
import { normalizeTags } from "./normalization.js";

export const entityKinds = ["character", "weapon", "summon"] as const;
export const elements = ["fire", "water", "earth", "wind", "light", "dark", "plain"] as const;

export const capabilityTags = [
  "attack",
  "buff",
  "charge-boost",
  "damage-cut",
  "debuff",
  "delay",
  "dispel",
  "heal",
  "normal-attack",
  "revive",
  "substitute",
  "veil",
] as const;

export const characterRoles = [
  "attacker",
  "defender",
  "healer",
  "support",
  "special",
  "unknown",
] as const;
export const characterRaces = [
  "human",
  "draph",
  "erune",
  "harvin",
  "primal",
  "other",
  "unknown",
] as const;
export const weaponTypes = [
  "sword",
  "dagger",
  "spear",
  "axe",
  "staff",
  "gun",
  "melee",
  "bow",
  "harp",
  "katana",
  "unknown",
] as const;
export const weaponSkillEffects = [
  "attack",
  "hp",
  "multiattack",
  "critical",
  "stamina",
  "enmity",
  "supplemental-damage",
  "damage-cap",
  "healing",
  "charge",
  "defense",
  "special",
  "unknown",
] as const;
export const summonAuraEffects = [
  "element-attack",
  "character-attack",
  "weapon-skill",
  "hp",
  "defense",
  "multi-element",
  "drop-rate",
  "special",
  "unknown",
] as const;
export const summonCallEffects = [
  "damage",
  "buff",
  "debuff",
  "heal",
  "dispel",
  "damage-cut",
  "charge",
  "cooldown",
  "special",
  "unknown",
] as const;

const controlledArray = <T extends readonly [string, ...string[]]>(values: T, maximum: number) =>
  z.array(z.enum(values)).min(1).max(maximum);

export const characterDetailsSchema = z.strictObject({
  roles: controlledArray(characterRoles, 3),
  weaponProficiencies: controlledArray(weaponTypes, 2),
  races: controlledArray(characterRaces, 2),
});

export const weaponDetailsSchema = z.strictObject({
  weaponType: z.enum(weaponTypes),
  skillEffects: controlledArray(weaponSkillEffects, 10),
  maxUncapLevel: z.number().int().min(0).max(10),
});

export const summonDetailsSchema = z.strictObject({
  auraEffects: controlledArray(summonAuraEffects, 10),
  callEffects: controlledArray(summonCallEffects, 10),
  maxUncapLevel: z.number().int().min(0).max(10),
});

const commonInputShape = {
  name: z.string().trim().min(1).max(120),
  element: z.enum(elements).nullable().optional(),
  rarity: z.string().trim().max(20).nullable().optional(),
  tags: z.preprocess(
    (value) =>
      Array.isArray(value) && value.every((tag) => typeof tag === "string")
        ? normalizeTags(value)
        : value,
    z.array(z.enum(capabilityTags)).max(30).default([]),
  ),
};

function catalogSchema<T extends z.ZodRawShape>(extra: T) {
  return z.discriminatedUnion("kind", [
    z.strictObject({
      ...commonInputShape,
      ...extra,
      kind: z.literal("character"),
      details: characterDetailsSchema,
    }),
    z.strictObject({
      ...commonInputShape,
      ...extra,
      kind: z.literal("weapon"),
      details: weaponDetailsSchema,
    }),
    z.strictObject({
      ...commonInputShape,
      ...extra,
      kind: z.literal("summon"),
      details: summonDetailsSchema,
    }),
  ]);
}

export const catalogInputSchema = catalogSchema({ source: sourceInputSchema.optional() });
export const catalogUpdateSchema = catalogSchema({});

export const capabilityTagsSchema = z.preprocess(
  (value) =>
    Array.isArray(value) && value.every((tag) => typeof tag === "string")
      ? normalizeTags(value)
      : value,
  z.array(z.enum(capabilityTags)).max(20).default([]),
);

export const inventoryInputSchema = z.strictObject({
  owned: z.boolean(),
  quantity: z.number().int().min(1).max(999).default(1),
  uncapLevel: z.number().int().min(0).max(10).default(0),
  awakeningLevel: z.number().int().min(0).max(20).nullable().optional(),
  notes: z.string().trim().max(1_000).nullable().optional(),
});

export type EntityKind = (typeof entityKinds)[number];
export type Element = (typeof elements)[number];
export type CapabilityTag = (typeof capabilityTags)[number];
export type CharacterDetails = z.infer<typeof characterDetailsSchema>;
export type WeaponDetails = z.infer<typeof weaponDetailsSchema>;
export type SummonDetails = z.infer<typeof summonDetailsSchema>;
export type CatalogDetails = CharacterDetails | WeaponDetails | SummonDetails;
export type CatalogInput = z.infer<typeof catalogInputSchema>;
export type CatalogUpdate = z.infer<typeof catalogUpdateSchema>;
export type InventoryInput = z.infer<typeof inventoryInputSchema>;

export type Candidate = {
  id: string;
  kind: EntityKind;
  name: string;
  element: Element | null;
  tags: string[];
  quantity: number;
  uncapLevel: number;
};

export type RankedCandidate = Candidate & {
  score: number;
  matchedTags: string[];
  missingTags: string[];
};

export function rankOwnedCandidates(
  candidates: Candidate[],
  options: {
    element?: Element;
    requiredTags?: string[];
    preferredTags?: string[];
    strictRequiredTags?: boolean;
  },
): RankedCandidate[] {
  const requiredTags = normalizeTags(options.requiredTags ?? []);
  const preferredTags = normalizeTags(options.preferredTags ?? []);

  return candidates
    .filter(
      (candidate) =>
        !options.strictRequiredTags || requiredTags.every((tag) => candidate.tags.includes(tag)),
    )
    .map((candidate) => {
      const matchedTags = requiredTags.filter((tag) => candidate.tags.includes(tag));
      const missingTags = requiredTags.filter((tag) => !candidate.tags.includes(tag));
      const elementScore = !options.element || candidate.element === options.element ? 5 : -3;
      const score =
        elementScore +
        matchedTags.length * 10 -
        missingTags.length * 4 +
        preferredTags.filter((tag) => candidate.tags.includes(tag)).length * 5 +
        candidate.uncapLevel;
      return { ...candidate, score, matchedTags, missingTags };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ja"));
}
