-- FODEC support (docs/fiscal-build-plan.md §1).
--
-- `Item.fodecSubject` records whether the Item attracts FODEC (fonds de
-- développement de la compétitivité): 1% of the HT net, priced line-level
-- before VAT (docs/tunisia-fiscal-research.md §2). Absent before this
-- migration, which reads as not subject — the same default the input contract
-- carries — so every existing Item keeps its pricing.
--
-- `DocumentLine.fodecAmount` stores the priced FODEC figure alongside every
-- other stored figure, because the header figures on an Issued document are
-- history: re-deriving them after an Item's flag changes would silently rewrite
-- what was filed. A Credit Note carries the stored figure pro-rata, never
-- re-derived from the Item. There is deliberately no `Document.fodecAmount`
-- column: the served total is the sum of the stored line figures, so the total
-- and the lines cannot disagree.
--
-- Both columns are `NOT NULL ... DEFAULT`, so existing rows backfill to
-- not-subject / zero without a rewrite and without a data migration: the
-- default *is* the backfill.

ALTER TABLE "item" ADD COLUMN "fodecSubject" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "document_line" ADD COLUMN "fodecAmount" DECIMAL(18,3) NOT NULL DEFAULT 0;
