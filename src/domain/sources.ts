import { z } from "zod";

export const sourceKinds = ["gameplay", "official", "guide", "user"] as const;
export const sourceKindLabels = {
  gameplay: "ゲーム内確認",
  official: "公式情報",
  guide: "攻略情報",
  user: "ユーザー自身の記録",
} as const;
export const sourceStatuses = ["missing", "stale", "current"] as const;
export const sourceStatusLabels = {
  missing: "出典未登録",
  stale: "要再確認",
  current: "確認済み",
} as const;
export const sourceReviewDays = 90;
export function sourceReviewCutoff(now = new Date()) {
  return new Date(now.getTime() - sourceReviewDays * 24 * 60 * 60 * 1000);
}
export const sourceInputSchema = z.strictObject({
  kind: z.enum(sourceKinds),
  url: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .nullable()
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
  observedAt: z.iso.datetime(),
  verifiedAt: z.iso.datetime().nullable().optional(),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type SourceStatus = (typeof sourceStatuses)[number];
