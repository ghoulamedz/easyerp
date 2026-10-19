# A draft prints, and an issued document is read-only

A Document has three statuses and each one answers a different question with a
different affordance, so the rule is stated once here rather than re-derived on every
screen.

**A draft prints.** The figures on a draft are not provisional arithmetic — `createDraft`
prices every line against the Item and its tax rate and writes `netAmount`,
`taxAmount`, `grossAmount` and one `document_tax` row per rate into the same insert. The
paper is therefore a view of a real row, and "show me what this will look like" is asked
_before_ issuing, which is exactly when refusing to render answers too late. The one
thing a draft must never do is read as a filed document, so it prints a status word
across the sheet — BROUILLON, DRAFT, مسودة — in its own locale, and its number cell is
empty because there is no number yet. A cancelled document prints the same way with its
own word, which is what makes a reprint of a cancelled invoice honest rather than
misleading.

**A draft is edited on the screen that created it.** Create and edit are one form with
two exits, Save and Issue: the fields, the validation and the pricing are identical, and
splitting them into two components is how a create screen and an edit screen drift into
accepting different documents. Save writes a draft and stays; Issue writes it and moves
to the paper.

**An issued document is read-only, everywhere.** There is no edit link, no editable
field, and no update endpoint that accepts it — the API refuses the transition even if a
client sends one, because the interface is not the authorization (ADR 0006). A wrong
issued document is corrected by a Credit Note, never by an update. The same rule reads
an issued document's screen as a reader: the detail view and the print copy show the
stored row, and neither recomputes a figure.

## Consequences

- `GET <paper>/:id/print` answers for **every** status. It answers `NOT_FOUND` only when
  there is no such document of that type, which is the answer the document endpoint
  itself gives — one meaning for one status code.
- The watermark is a property of the template, not of the caller: the paper's status
  travels on the view and the template decides what a non-issued page says. A caller
  cannot print a draft that looks issued, because there is no flag to get wrong.
- A list row offers Print unconditionally. View appears when the page names a detail
  screen, so a paper with no detail route is still printable rather than invisible.
- The status words live beside the other localized document vocabulary
  (`finance/terminology.ts`), because they are printed on the paper and therefore belong
  with the labels, not in the web app's translations.
- Tests assert both directions: a draft's paper carries its word and no number, an issued
  paper carries neither, in French, English and Arabic.
