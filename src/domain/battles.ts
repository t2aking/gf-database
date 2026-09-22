import { z } from "zod";
import { capabilityTagsSchema, elements, type Element } from "./catalog.js";

export const battlePurposes = ["full-auto", "short", "long", "other"] as const;

export const battleInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  enemyElement: z.enum(elements).nullable().default(null),
  recommendedElement: z.enum(elements).nullable().default(null),
  purpose: z.enum(battlePurposes),
  requiredTags: capabilityTagsSchema,
  preferredTags: capabilityTagsSchema,
  notes: z.string().trim().max(1000).nullable().default(null),
});

export type BattleInput = z.infer<typeof battleInputSchema>;
export type BattlePurpose = (typeof battlePurposes)[number];
export type CandidateCriteria = {
  element?: Element;
  requiredTags: string[];
  preferredTags: string[];
};

export function resolveCandidateCriteria(
  battle: Pick<BattleInput, "recommendedElement"> & {
    requiredTags: readonly string[];
    preferredTags: readonly string[];
  },
): CandidateCriteria {
  return {
    element: battle.recommendedElement ?? undefined,
    requiredTags: [...battle.requiredTags],
    preferredTags: [...battle.preferredTags],
  };
}
