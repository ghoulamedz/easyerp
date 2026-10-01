# Stock is an append-only ledger

Stock is an append-only Stock Ledger Entry log; On-hand is derived and there is no balance column on the item. Reservations are separate records, never a column. A mutable balance column is what let the legacy system oversell: it read, compared and wrote without a lock, and approved orders reserved nothing. A ledger is also the only representation that supports the v2 ambitions — multiple warehouses, lots, expiry and MRP — without a rewrite, since each of those becomes a dimension on an entry rather than a new column.

## Consequences

- Every stock mutation runs in one interactive transaction, taking a row lock on the item. Two concurrent deliveries must be provably unable to take the same unit.
- `Available` is `On-hand − Reserved`. The interface shows Available; nothing shows a stored "stock" field.
- Stock can never be corrected by editing data. It is corrected by posting a reversing entry with a reason, which is auditable.
