import { normalizeTags } from "./normalization.js";
import type { Element, EntityKind } from "./catalog.js";

export type RecommendationItem = {
  id: string;
  kind: EntityKind;
  name: string;
  element: Element | null;
  tags: string[];
  quantity: number;
  uncapLevel: number;
};

export type RecommendationCriteria = {
  element?: Element;
  requiredTags?: string[];
  preferredTags?: string[];
  limitPerKind?: number;
};

export type ScoredRecommendation = RecommendationItem & {
  eligible: boolean;
  score: number;
  scoreBreakdown: { element: number; requiredTags: number; preferredTags: number; uncap: number };
  matchedTags: string[];
  missingTags: string[];
  missingConditions: string[];
};

export type RecommendationResult = {
  byKind: Record<EntityKind, ScoredRecommendation[]>;
  warnings: string[];
};

export function recommendOwned(
  owned: readonly RecommendationItem[],
  criteria: RecommendationCriteria,
): RecommendationResult {
  const required = normalizeTags(criteria.requiredTags ?? []);
  const preferred = normalizeTags(criteria.preferredTags ?? []);
  const limit = Math.min(Math.max(criteria.limitPerKind ?? 10, 1), 20);
  const warnings: string[] = [];
  if (!criteria.element && !required.length && !preferred.length)
    warnings.push("推薦条件が未指定です。属性またはタグを指定すると根拠が増えます。");
  if (!owned.length) warnings.push("所持データがありません。");
  if (criteria.element && owned.some((item) => item.element === null))
    warnings.push("属性不明の所持品があります。属性一致は判定できません。");
  if ((required.length || preferred.length) && owned.some((item) => item.tags.length === 0))
    warnings.push("タグ未登録の所持品があります。能力条件は判定できません。");
  for (const tag of required)
    if (!owned.some((item) => item.tags.includes(tag)))
      warnings.push(`必須タグ ${tag} を持つ所持品がありません。`);

  const byKind: RecommendationResult["byKind"] = { character: [], weapon: [], summon: [] };
  for (const item of owned) {
    const matchedTags = required.filter((tag) => item.tags.includes(tag));
    const missingTags = required.filter((tag) => !item.tags.includes(tag));
    const elementMatches = !criteria.element || item.element === criteria.element;
    const missingConditions = [
      ...(!elementMatches ? [`属性: ${criteria.element}`] : []),
      ...missingTags.map((tag) => `タグ: ${tag}`),
    ];
    const scoreBreakdown = {
      element: !criteria.element ? 0 : elementMatches ? 5 : -3,
      requiredTags: matchedTags.length * 10,
      preferredTags: preferred.filter((tag) => item.tags.includes(tag)).length * 5,
      uncap: item.uncapLevel,
    };
    byKind[item.kind].push({
      ...item,
      eligible: elementMatches && missingTags.length === 0,
      score: Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0),
      scoreBreakdown,
      matchedTags: [
        ...matchedTags,
        ...preferred.filter((tag) => item.tags.includes(tag) && !matchedTags.includes(tag)),
      ],
      missingTags,
      missingConditions,
    });
  }
  for (const kind of ["character", "weapon", "summon"] as const) {
    const label = { character: "キャラクター", weapon: "武器", summon: "召喚石" }[kind];
    if (!byKind[kind].length) warnings.push(`所持${label}がありません。`);
    else if (!byKind[kind].some((item) => item.eligible))
      warnings.push(`${label}の適格候補がありません。`);
    byKind[kind].sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    byKind[kind] = byKind[kind].slice(0, limit);
  }
  return { byKind, warnings };
}
