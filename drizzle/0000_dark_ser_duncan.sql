CREATE TYPE "public"."element" AS ENUM('fire', 'water', 'earth', 'wind', 'light', 'dark', 'plain');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('character', 'weapon', 'summon');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('gameplay', 'official', 'guide', 'user');--> statement-breakpoint
CREATE TABLE "battle_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"element" "element",
	"required_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_contents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "catalog_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "entity_kind" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"element" "element",
	"rarity" text,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"uncap_level" integer DEFAULT 0 NOT NULL,
	"awakening_level" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_quantity_positive" CHECK ("inventory_entries"."quantity" > 0),
	CONSTRAINT "inventory_uncap_nonnegative" CHECK ("inventory_entries"."uncap_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text,
	"note" text,
	"observed_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_entity_id_catalog_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."catalog_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_references" ADD CONSTRAINT "source_references_entity_id_catalog_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."catalog_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_entities_kind_name_unique" ON "catalog_entities" USING btree ("kind","normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_entities_name_index" ON "catalog_entities" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_entities_kind_element_index" ON "catalog_entities" USING btree ("kind","element");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_entries_entity_unique" ON "inventory_entries" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "source_references_entity_index" ON "source_references" USING btree ("entity_id");