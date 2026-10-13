-- E_INVOICING is a cross-cutting fiscal capability, off by default. New
-- deployments write the row explicitly at Setup; this backfills deployments
-- created before the Module existed, where an absent row would otherwise read
-- as enabled.
INSERT INTO "module_state" ("module", "isEnabled", "updatedAt")
SELECT 'E_INVOICING', false, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "module_state" WHERE "module" = 'E_INVOICING');
