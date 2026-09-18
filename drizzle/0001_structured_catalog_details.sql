ALTER TABLE "catalog_entities" ADD COLUMN "details" jsonb;--> statement-breakpoint
UPDATE "catalog_entities"
SET "details" = CASE "kind"
	WHEN 'character' THEN '{"roles":["unknown"],"weaponProficiencies":["unknown"],"races":["unknown"]}'::jsonb
	WHEN 'weapon' THEN '{"weaponType":"unknown","skillEffects":["unknown"],"maxUncapLevel":0}'::jsonb
	WHEN 'summon' THEN '{"auraEffects":["unknown"],"callEffects":["unknown"],"maxUncapLevel":0}'::jsonb
END;--> statement-breakpoint
ALTER TABLE "catalog_entities" ALTER COLUMN "details" SET NOT NULL;
