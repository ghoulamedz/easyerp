-- The archive columns go: the Document row is the record, and printing is a view
-- of it.
--
-- ADR 0010 used to say an issued document's PDF was the artifact a client keeps,
-- so the file was written once and the row recorded where it lived and what it
-- hashed to. That premise was wrong twice over. The legal object is the printed A4
-- page, and a TEIF e-invoice is signed XML — a file we render was never the
-- record, it was a copy of one. What the Business is answerable for is the row:
-- the number, the figures, the party, the tax breakdown, all stored once at issue
-- and immutable since.
--
-- So there is nothing to file. Printing renders the HTML from the stored row on
-- request; the visitor's browser rasterises it. Three consequences, all of them
-- simplifications rather than losses:
--
--   * No write/record window. The old design had to commit the number before the
--     file could exist, which is why five columns were writable on an Issued
--     document (one of them renamed an "immutable" claim into a promise). Nothing
--     is written after the issue transaction now, so `archivedAt` has no meaning.
--   * No file that can go missing. `ARCHIVE_UNAVAILABLE` described a deployment
--     that had lost a copy; it cannot happen if there is no copy to lose, and a
--     reprint reproduces the figures from the row exactly.
--   * A reprint follows the current template. That is the price and it is the
--     intended one: figures come from the row and never move, wording follows the
--     label table and may.
--
-- `printPath`/`printSha256` were added hours earlier for the HTML copy and are
-- dropped here with the rest, before any deployment took a dependency on them.

ALTER TABLE "document" DROP COLUMN IF EXISTS "archivePath";
ALTER TABLE "document" DROP COLUMN IF EXISTS "archiveSha256";
ALTER TABLE "document" DROP COLUMN IF EXISTS "archivedAt";
ALTER TABLE "document" DROP COLUMN IF EXISTS "printPath";
ALTER TABLE "document" DROP COLUMN IF EXISTS "printSha256";
