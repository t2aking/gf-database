import { z } from "zod";

export const entityKinds = ["character", "weapon", "summon"] as const;
export const elements = ["fire", "water", "earth", "wind", "light", "dark", "plain"] as const;

export const catalogInputSchema = z.object({
  kind: z.enum(entityKinds),
  name: z.string().trim().min(1).max(120),
  element: z.enum(elements).nullable().optional(),
  rarity: z.string().trim().max(20).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  source: z
    .object({
      kind: z.enum(["gameplay", "official", "guide", "user"]),
      url: z.url().nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
      observedAt: z.iso.datetime(),
    })
    .optional(),
});

export const inventoryInputSchema = z.object({
  owned: z.boolean(),
  quantity: z.number().int().min(1).max(999).default(1),
  uncapLevel: z.number().int().min(0).max(10).default(0),
  awakeningLevel: z.number().int().min(0).max(20).nullable().optional(),
  notes: z.string().trim().max(1_000).nullable().optional(),
});

export type EntityKind = (typeof entityKinds)[number];
export type Element = (typeof elements)[number];
export type CatalogInput = z.infer<typeof catalogInputSchema>;
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
  options: { element?: Element; requiredTags?: string[] },
): RankedCandidate[] {
  const requiredTags = [...new Set(options.requiredTags ?? [])];

  return candidates
    .map((candidate) => {
      const matchedTags = requiredTags.filter((tag) => candidate.tags.includes(tag));
      const missingTags = requiredTags.filter((tag) => !candidate.tags.includes(tag));
      const elementScore = !options.element || candidate.element === options.element ? 5 : -3;
      const score =
        elementScore + matchedTags.length * 10 - missingTags.length * 4 + candidate.uncapLevel;
      return { ...candidate, score, matchedTags, missingTags };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ja"));
}
