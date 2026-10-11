# Documents are never deleted; Payments are

A Document is cancelled, never removed. A Payment is removed, and taking it away
takes its Allocations with it in the same transaction.

These are the same rule about different things, and the difference is what each one
is a record _of_. A Document is a record of something that was asserted to a third
party — an invoice a Customer received, a Delivery Note a driver signed — so ADR
0006 already forbids deleting it and the transition table is where that lives. A
Payment is a record of money we noticed arriving. It asserts nothing to anyone
outside the Business, it has no number, it has no archive, it is not a Document, and
a receipt keyed wrongly into the wrong Customer's account has to be removable or the
product is unusable after the first mistake.

`PERMISSION_CATALOG` already encodes the split: `payment` grants
`payment:read`, `payment:create` and `payment:delete`, and deliberately no
`payment:update` — a recorded receipt does not get edited, it gets removed and
re-recorded. `customer-invoice:delete` and `credit-note:delete` exist too, and they
mean **Draft only**, enforced by the same guard that computes `allowedTransitions`,
so the permission string can never become a live bypass of ADR 0006.

The alternative to cascading was examined and rejected. Refusing deletion whenever
a Payment has Allocations would make `payment:delete` nearly useless, because a
Payment is typically allocated within seconds of being entered — the permission
would exist and be refused in practice every time it was reached for. Allowing
deletion while leaving the Allocations behind is worse: invoices would be marked
paid against a receipt that no longer exists, and the derived balance would be a
lie with no way to see why.

## Consequences

- Deleting a Payment is the only destructive write in the product. It is named as
  such here rather than left to be discovered, and it writes an Audit entry with
  the state before and after like every other material action.
- `Outstanding` and `Unallocated credit` (CONTEXT.md) are derived from Allocations,
  so after a cascade they recompute correctly with no compensating code.
- An issued Document's delete route does not exist. `DELETE` on a Document is
  refused for anything that is not `DRAFT`, by the transition guard, regardless of
  what permission the caller holds.
