ALTER TABLE "battle_contents" RENAME COLUMN "element" TO "enemy_element";--> statement-breakpoint
ALTER TABLE "battle_contents" ADD COLUMN "recommended_element" "element";--> statement-breakpoint
ALTER TABLE "battle_contents" ADD COLUMN "purpose" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_contents" ADD COLUMN "preferred_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;