-- The print copy of a Document (ADR 0010 amendment).
--
-- Printing used to require a browser on the host: the API rendered HTML and
-- Chromium turned it into a PDF, so a deployment without a browser could not
-- produce the paper at all. The paper is now rendered once at issue as
-- self-contained HTML and filed beside the PDF, and Print serves those archived
-- bytes — the visitor's own browser is the renderer.
--
-- Two consequences worth stating in the schema, because they are decisions:
--
--   * The HTML is the artifact every host can produce, so "issued but not
--     printable" stops being a state a deployment can reach. The PDF remains a
--     second copy, written only where the host has a rendering browser.
--   * `print_path` is nullable for the same reason `archive_path` is: a document
--     issued before this migration, or one whose render failed, has no filed
--     copy yet. Nullable makes that window representable rather than silent.
--
-- The immutability trigger compares named content columns, so these two new
-- columns stay writable on an Issued document — the same concession the three
-- archive columns already have, and for the same reason: the file name is the
-- document number, so the number must be committed before the file can exist.

ALTER TABLE "document" ADD COLUMN "printPath" VARCHAR(500);
ALTER TABLE "document" ADD COLUMN "printSha256" CHAR(64);
