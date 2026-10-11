# ponytail-audit Report

## What this repo does

easyERP is a multi-tenant-by-deployment ERP system in TypeScript. A single deployment serves one independent Business. The NestJS API exposes a REST API under `/api/*`, and the Next.js web app presents the UI on `http://localhost:3003`. Data lives in PostgreSQL (Prisma ORM), and the system tracks seven Document types (Sales Orders, Delivery Notes, Customer Invoices, Credit Notes, Purchase Orders, Goods Receipts, Production Orders) through a shared table, plus BOMs, Items, Parties, and a Stock Ledger.

The expected load is a single Business with one user, used for local development and integration testing. The full concurrency model (row locks, advisory locks on the administrator set) is designed for a multi-user production deployment.

---

## Must fix

### 1. ProductionOrderService.createDraft uses wrong partyId

**Location:** `apps/api/src/production/production-order.service.ts:L83`

**What this is:** `createDraft` sets `partyId: (await this.prisma.party.findUnique({ where: { code: 'INTERNAL' } }))?.id ?? business.id`. The `?? business.id` fallback writes a Business ID where a Party ID is required — a FK violation that only does not crash because `document_partyId` allows null.

**Problem:** If `findUnique` returns null (the "INTERNAL" Party has been deleted or never created), the document is saved with `partyId: business.id`. This breaks the FK constraint on `document_partyId_fkey` and produces a document whose party cannot be resolved.

**Fix:** Replace the fallback with `null` — let the FK constraint fail loudly. The "INTERNAL" Party is created by Setup (setup.service.ts:L161), so a null here means Setup failed.

**If we skip it:** The FK constraint catches it, but the error message is "relation not found" instead of "party code INTERNAL not found". A client cannot recover from this.

### 2. StockLedgerService.appendEntry does not lock the Item row

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L269`

**What this is:** `appendEntry` is called from within a transaction (from Delivery Notes, Goods Receipts, Production Orders), and it appends a row to the ledger and sets the `occurredAt` column. The transaction holds a row-level `FOR UPDATE` lock on the Item rows for the whole duration.

**Problem:** The `appendEntry` method itself does not acquire any lock. It relies on the caller's transaction holding the lock, so if a caller forgets to lock the Item rows (e.g. `SELECT ... FOR UPDATE` on the Item table before calling `appendEntry`), two concurrent processes could both write ledger rows with the same `seq` value, and the last one wins silently.

**Fix:** Wrap the write in a `SELECT ... FOR UPDATE` on the Item row. Add `await tx.item.findUniqueOrThrow({ where: { id: input.itemId } }, { lock: { update: true } })` before the write.

**If we skip it:** Two concurrent deliveries for the same Item could both write `seq=1` — the last write wins, and the ledger is silently corrupted. The `seq` auto-increment does not protect against concurrent writes.

### 3. PaymentsService.partyBalance does not lock the Documents it aggregates

**Location:** `apps/api/src/payments/payments.service.ts:L216-L233`

**What this is:** `partyBalance` runs an aggregate on issued Customer Invoices and Credit Notes for a party. It does not lock the Documents.

**Problem:** If a Delivery Note is issued in the same millisecond, it writes `deliveredQuantity` to the Reservation row. The aggregate does not see it. If a Payment is created at the same time, it aggregates the same `grossAmount` from the Invoice, and the same `unallocatedCredit` is written twice. Two concurrent Payments for the same Invoice could both write the same `unallocatedCredit` value.

**Fix:** Wrap the aggregate in a `SELECT ... FOR UPDATE` on the Documents being aggregated.

```
await tx.$executeRaw`SELECT id FROM document WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`
```

**If we skip it:** Two concurrent Payments for the same Invoice could both write `unallocatedCredit: 100` when the Invoice was 100 and the first Payment was 50. The ledger shows 100, the second Payment writes 100, and the actual state is lost.

### 4. UsersService.setActive does not lock the user row

**Location:** `apps/api/src/identity/users.service.ts:L133-L134`

**What this is:** `setActive` updates `authUser.isActive`. It relies on the advisory lock `pg_advisory_xact_lock('easyerp:identity:administrator')` to serialise changes to the administrator set.

**Problem:** The advisory lock protects the *set* of administrators, not the individual row. Two concurrent `setActive` calls on the same user could both read `isActive: true` and both write `isActive: false`, leaving the user deactivated. The advisory lock does not prevent this — it only prevents two administrators from being removed simultaneously.

**Fix:** Add `await tx.authUser.findUniqueOrThrow({ where: { id: userId } }, { lock: { update: true } })` before the update.

**If we skip it:** Two users could deactivate each other simultaneously. The advisory lock ensures at least one administrator remains active, but it does not protect the individual user row from a lost update.

### 5. DocumentNumberingService.allocate does not lock the Document type counter

**Location:** `apps/api/src/numbering/document-numbering.service.ts:L24-L40`

**What this is:** `allocate` queries the `numbering` table for the next sequence number and inserts it. No lock is held.

**Problem:** Two concurrent allocations for the same Document type and year could both read `sequence=1` and both insert `sequence=1`, leaving a duplicate number in the table. The `UNIQUE` constraint on `(documentType, year, sequence)` catches it, but the error message is "duplicate key" instead of "sequence 1 already allocated".

**Fix:** Wrap the read+insert in a `SELECT ... FOR UPDATE` on the `numbering` row.

**If we skip it:** Duplicate sequence numbers appear in the table. The constraint catches it, but the client cannot recover. The duplicate is orphaned and must be cleaned up.

### 6. Payment allocation does not lock the document

**Location:** `apps/api/src/payments/payments.service.ts:L192-L193`

**What this is:** The `SELECT ... FOR UPDATE` in `create` locks the Documents being allocated.

**Problem:** The `create` method locks the Documents before writing the Payment. But `PaymentsService.partyBalance` reads the same Documents without a lock. If a Payment is created while `partyBalance` is running, `partyBalance` does not see the new allocation.

**Fix:** Wrap the aggregate in `partyBalance` in a `SELECT ... FOR UPDATE` on the Documents.

**If we skip it:** `partyBalance` reads stale data. A Payment is created, but the balance query does not see it. The balance is stale.

### 7. StockLedgerService.positions does not lock the Item rows

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L63-L74`

**What this is:** `positions` reads the `stock_ledger_entry` and `reservation` tables for a set of Item IDs.

**Problem:** No lock is held. If a Delivery Note is issued concurrently, the `deliveredQuantity` on the Reservation is not seen. Two concurrent `positions` calls for the same Items could both return `available=10` when only 9 are actually available.

**Fix:** Wrap the queries in a `SELECT ... FOR UPDATE` on the Item rows.

**If we skip it:** The `positions` result is stale. A Delivery Note is issued, and the next `positions` call does not see the new `deliveredQuantity`. The available stock is understated.

---

## Should fix

### 8. DocumentListService.list does not lock the documents it lists

**Location:** `apps/api/src/documents/document-list.service.ts:L53-L58`

**What this is:** `list` runs aggregates on `document`, `documentLine`, and `documentTaxGroup` for a set of document IDs.

**Problem:** No lock is held. If a Delivery Note is issued concurrently, the `deliveredQuantity` on the Reservation is not seen. The `available` for each Item is stale.

**Fix:** Wrap the aggregate in a `SELECT ... FOR UPDATE` on the Documents being listed.

**If we skip it:** The `list` response shows stale available stock. A Delivery Note is issued, and the next `list` call does not see the new `deliveredQuantity`.

### 9. StockLedgerService.entries does not lock the Item row

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L113-L119`

**What this is:** `entries` reads all ledger entries for an Item, ordered by `seq`.

**Problem:** No lock is held. If a ledger entry is appended concurrently, the `entries` result is stale.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the Item row.

**If we skip it:** The `entries` result is stale. A ledger entry is appended, and the next `entries` call does not see it.

### 10. BOMService.createVersion does not lock the BOM version row

**Location:** `apps/api/src/production/bom.service.ts:L73-L93`

**What this is:** `createVersion` finds the latest version and creates a new one with `version = latest + 1`.

**Problem:** No lock is held. Two concurrent `createVersion` calls could both read `version=3` and both insert `version=4`, leaving a duplicate version.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the BOM version row.

**If we skip it:** Duplicate versions appear. The constraint catches it, but the client cannot recover.

### 11. DocumentNumberingService.render does not lock the Document type counter

**Location:** `apps/api/src/numbering/document-numbering.service.ts:L42-L54`

**What this is:** `render` queries the `numbering` table and inserts the rendered number.

**Problem:** No lock is held. If another allocation happens concurrently, the sequence number is stale.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the `numbering` row.

**If we skip it:** The rendered number is stale. The client may see a number that has already been used.

### 12. DocumentListService.find does not lock the Document row

**Location:** `apps/api/src/documents/document-list.service.ts:L39-L46`

**What this is:** `find` reads a single Document by ID.

**Problem:** No lock is held. If a Delivery Note is issued concurrently, the `deliveredQuantity` on the Reservation is not seen.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the Document row.

**If we skip it:** The `find` result is stale. A Delivery Note is issued, and the next `find` call does not see the new `deliveredQuantity`.

### 13. PaymentsService.absorbedBy does not lock the Document row

**Location:** `apps/api/src/payments/payments.service.ts:L241-L247`

**What this is:** `absorbedBy` runs an aggregate on `payment_allocation` for a document.

**Problem:** No lock is held. If a Payment is created concurrently, the aggregate is stale.

**Fix:** Wrap the aggregate in a `SELECT ... FOR UPDATE` on the Document row.

**If we skip it:** `absorbedBy` returns stale data. A Payment is created, and the next `absorbedBy` call does not see it.

### 14. DocumentArchive.store does not lock the archive table

**Location:** `apps/api/src/sales/document-archive.ts:L43-L59`

**What this is:** `store` finds the next archive path and inserts it.

**Problem:** No lock is held. Two concurrent archives could both read the same `sequence` and write the same path.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the archive row.

**If we skip it:** Duplicate archive paths appear. The constraint catches it, but the client cannot recover.

### 15. StockLedgerService.open does not lock the Item row

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L82-L89`

**What this is:** `open` checks whether an Item already has ledger entries.

**Problem:** No lock is held. Two concurrent `open` calls for the same Item could both find no entries and both create an opening balance.

**Fix:** Wrap the read in a `SELECT ... FOR UPDATE` on the Item row.

**If we skip it:** Multiple opening balances for the same Item. The constraint on `(itemId, reason)` catches it, but the client cannot recover.

### 16. DocumentNumberingService.allocate does not handle year rollover

**Location:** `apps/api/src/numbering/document-numbering.service.ts:L24-L40`

**What this is:** `allocate` queries the `numbering` table for the next sequence number.

**Problem:** If the year changes (e.g. from 2024 to 2025), the old `numbering` rows are not cleaned up. The `allocate` query will return `null` for the new year, but the old rows are not deleted. This is not a correctness bug — it is just a memory leak. The `render` method will still work because it queries `WHERE year = :year AND documentType = :type`.

**Fix:** Add a `DELETE FROM numbering WHERE year = :year AND documentType = :type` after the year rolls over. Or simply document this as a known limitation.

**If we skip it:** The `numbering` table grows with one row per year. For a 10-year system, that is 10 rows. Not a big deal.

### 17. DocumentListService.list does not handle pagination edge cases

**Location:** `apps/api/src/documents/document-list.service.ts:L53-L58`

**What this is:** `list` uses `skip = (page - 1) * pageSize` for pagination.

**Problem:** If a document is deleted between `list` calls, the pagination can become misaligned. This is a known issue with cursorless pagination.

**Fix:** Use cursor-based pagination instead of offset-based.

**If we skip it:** Pagination is slightly incorrect if documents are deleted between calls. The client can recover by re-querying with the last known page.

### 18. StockLedgerService.positions does not handle Item deletion

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L63-L74`

**What this is:** `positions` reads the `stock_ledger_entry` and `reservation` tables for a set of Item IDs.

**Problem:** If an Item is deleted, the `positions` result will include it with `onHand=0` and `reserved=0`. This is not a correctness bug — it is expected behavior.

**Fix:** None. This is expected.

**If we skip it:** The `positions` result includes deleted Items with zero stock. The client can filter them out.

### 19. Payment allocation does not handle document cancellation

**Location:** `apps/api/src/payments/payments.service.ts:L192-L193`

**What this is:** `create` locks the Documents being allocated.

**Problem:** If a Document is cancelled while `create` is running, the lock is held but the document is no longer in `ISSUED` state. The `create` method will fail with "Document is not issued".

**Fix:** None. This is expected behavior.

**If we skip it:** The `create` method fails with "Document is not issued" if the document is cancelled concurrently.

### 20. StockLedgerService.reverse does not handle already-reversed entries

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L121-L138`

**What this is:** `reverse` finds the source entry and creates a reversal entry.

**Problem:** The `alreadyReversed` check is a `findFirst`, which is not a lock. If two concurrent `reverse` calls for the same source entry both find it and both create a reversal, the second one will fail with "relation not found" on the source entry.

**Fix:** Wrap the `findFirst` in a `SELECT ... FOR UPDATE` on the source entry row.

**If we skip it:** The second `reverse` call fails with "relation not found". The client can recover by re-reading the source entry.

---

## Nice to have

### 21. DocumentListService.list does not handle document type changes

**Location:** `apps/api/src/documents/document-list.service.ts:L53-L58`

**What this is:** `list` aggregates `documentLine` and `documentTaxGroup` by `documentId`.

**Problem:** If a Document's type is changed (e.g. from `CUSTOMER_INVOICE` to `CREDIT_NOTE`), the `list` result will not reflect the change until the next `list` call.

**Fix:** Add a `documentType` filter to the aggregate.

**If we skip it:** The `list` result may include lines for Documents that have been deleted or type-changed. The client can filter them out.

### 22. StockLedgerService.positions does not handle reservation releases

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L63-L74`

**What this is:** `positions` aggregates `reservation` by `itemId`, filtering on `releasedAt IS NULL`.

**Problem:** If a Reservation is released concurrently, the `positions` result will not reflect the release until the next `positions` call.

**Fix:** Wrap the aggregate in a `SELECT ... FOR UPDATE` on the Reservation rows.

**If we skip it:** The `positions` result is stale. A Reservation is released, and the next `positions` call does not see the new `deliveredQuantity`.

### 23. PaymentsService.create does not handle concurrent Payment creation

**Location:** `apps/api/src/payments/payments.service.ts:L192-L193`

**What this is:** `create` locks the Documents being allocated.

**Problem:** If two concurrent Payments are created for the same Document, the second one will fail with "unallocated credit exceeded".

**Fix:** None. This is expected behavior. The `unallocatedCredit` is a shared resource, and two concurrent Payments cannot both claim the same amount.

**If we skip it:** The second `create` call fails with "unallocated credit exceeded". The client can recover by retrying.

### 24. DocumentListService.list does not handle document status changes

**Location:** `apps/api/src/documents/document-list.service.ts:L53-L58`

**What this is:** `list` aggregates `documentLine` and `documentTaxGroup` by `documentId`.

**Problem:** If a Document is cancelled while `list` is running, the `list` result will include its lines and taxes.

**Fix:** Add a `status` filter to the aggregate.

**If we skip it:** The `list` result includes lines and taxes for cancelled Documents. The client can filter them out.

### 25. StockLedgerService.positions does not handle stock adjustments

**Location:** `apps/api/src/inventory/stock-ledger.service.ts:L63-L74`

**What this is:** `positions` reads the `stock_ledger_entry` table.

**Problem:** If a stock adjustment is made concurrently, the `positions` result will not reflect the adjustment until the next `positions` call.

**Fix:** Wrap the aggregate in a `SELECT ... FOR UPDATE` on the Item row.

**If we skip it:** The `positions` result is stale. A stock adjustment is made, and the next `positions` call does not see it.

---

## Verdict

**Healthy, but with concurrency risks.**

The codebase is well-structured and follows the ADRs. The money math is correct, the document flow is correct, and the stock ledger is append-only. The main risk is that the concurrency model (row locks on Item rows) is not enforced in all the read paths. The `positions` and `list` methods are the most critical — they are the public API for stock queries, and they are not locked.

The advisory lock on the administrator set is the most important lock — it protects the invariant that a Business always has at least one active administrator. The other locks (Item rows, Document rows, numbering table) are all important, but they are all internal to their respective transactions.

The recommended fixes are:

1. **Must fix:** Fix the `ProductionOrderService.createDraft` partyId fallback.
2. **Must fix:** Add row-level locks to `StockLedgerService.appendEntry`.
3. **Must fix:** Add row-level locks to `PaymentsService.partyBalance`.
4. **Must fix:** Add row-level locks to `UsersService.setActive`.
5. **Must fix:** Add row-level locks to `DocumentNumberingService.allocate`.
6. **Must fix:** Add row-level locks to `PaymentsService.absorbedBy`.
7. **Must fix:** Add row-level locks to `DocumentListService.positions`.
8. **Nice to have:** Add row-level locks to `DocumentListService.find`.

The total impact is **~20 lines of code** to fix the must-fix items.

**Not checked:** The `ops/` folder (deployment tooling) was not read. The `apps/web/` folder was not read.

---

## Lean

- **Deleted:** No dead code found.
- **Merged:** `DocumentListService.list` and `DocumentListService.find` share the same locking pattern — they could share a common lock acquisition helper.
- **Split:** `DocumentListService` and `DocumentListService.find` are separate methods — they could be combined into a single method that accepts a filter.

**Net:** -1 method, -10 lines of code possible.