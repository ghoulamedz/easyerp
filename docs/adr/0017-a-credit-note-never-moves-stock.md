# A Credit Note never moves stock

Issuing a Credit Note appends nothing to the Stock Ledger. Goods coming back from a
Customer are recorded as their own stock act, with `reason: RETURN_IN`, by whoever
handles the goods.

A Tunisian _avoir_ is raised for three different causes — a returned goods, a price
error, and a discount granted after the fact. Only the first involves anything
physically coming back. Wiring the Credit Note to the ledger would mean the second
and the third silently added units to `On-hand`, and the ledger — which ADR 0004
makes the sole authority on stock, and which must be able to answer _why_ for every
entry — would have a class of entries whose reason said "return" when what happened
was that someone charged the wrong price.

This is also the same shape as the decision in ADR 0016: a fiscal correction and a
warehouse movement are records of two different things, asserted by two different
people, and neither one is evidence of the other. `CONTEXT.md` already treats a
Discrepancy the same way — a fact about two parties does not belong to either of
them.

`RETURN_IN` and `RETURN_OUT` already exist in `STOCK_LEDGER_REASONS`, which is
precisely what makes the wrong wiring look reasonable: the reason is sitting there,
one field away, and a future reader will reasonably assume it belongs to the
document type that shares its name. It does not.

## Consequences

- The warehouse records a return as an adjustment-free act with `reason:
RETURN_IN` and a written `reasonText` naming the Credit Note, so the two records
  point at each other without either one driving the other.
- A Credit Note that represents a price error leaves stock exactly where it is, and
  the Customer's `Outstanding` falls without any quantity changing.
- If a later release wants a one-click "record the return too", it creates a second,
  separately-confirmed act. It does not make issuance do both.
