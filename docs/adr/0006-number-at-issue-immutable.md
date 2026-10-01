# Numbers are assigned at issue, and issued documents are immutable

A Document receives its Document number when it is issued, never before; Drafts are unnumbered and freely deletable; an Issued document is never edited and never deleted, and a correction is a Credit Note with its own Number series. Gapless sequential numbering is a legal requirement in Tunisia and elsewhere, so a numbered invoice that is later deleted is a legal gap, not a lost row. Allocation is a single atomic `UPDATE … RETURNING` per (type, year) series, which is also what makes numbering safe on a busy instance.

## Consequences

- Every form and every permission must distinguish Draft from Issued; this is the single most expensive rule in the product and it is enforced at the domain layer, not in controllers.
- Deletes of issued documents are absent from the API surface entirely, not merely hidden in the interface.
