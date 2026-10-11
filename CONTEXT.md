# easyERP

easyERP is a multi-language ERP sold to independent businesses. Each business runs its own instance from the same codebase, configured with its own brand, terminology, tax regime and document numbering. The language below is the shared vocabulary of the product: it does not change with the client's industry, and a client's own words are _labels_ on top of it, never new concepts.

## Language

### The business

**Business**:
The company that uses easyERP to run its own operations. Its data lives in its own deployment.
_Avoid_: Client, Customer, Tenant, Organization, Company, Société

**User**:
A person who signs in to a Business's instance. What they may do comes from the Roles they hold.
_Avoid_: Employee, Account, Utilisateur

### Identity and access

**Role**:
A named bundle of Permissions assigned to one or more Users.
_Avoid_: Métier, Fonction, Job title, Position

**Permission**:
An atomic right over a resource, written `resource:action` (for example `sales-order:approve`). Permissions are the only thing that authorizes an action; the interface never decides anything.
_Avoid_: Droit, Screen access, Autorisation d'interface

**Administrator**:
The Role guaranteed to exist and to be impossible to remove or strip. A Business can never be left without one.
_Avoid_: PDG, Owner, Superuser, ROOT

### Parties

**Party**:
A counterparty a Business transacts with, holding one or both commercial roles. A Party may be a Customer, a Supplier, or both at once.
_Avoid_: Tiers, Tiers tiers, Third party, Contact, Partner

**Customer**:
A Party that the Business sells to.
_Avoid_: Client, Acheteur, Buyer, Client final

**Supplier**:
A Party that the Business buys from.
_Avoid_: Fournisseur, Vendeur, Vendor

**Customer terms**:
The commercial conditions held for a Customer — payment terms, credit limit, delivery address. Referenced by Sales Orders and Customer Invoices, never applied on their own.
_Avoid_: Conditions client, Client terms, Payment policy

### Catalog

**Item**:
Something a Business stocks, buys, sells, or produces. Its role in the catalog is its Item type.
_Avoid_: Article, Produit, Product, Marchandise, SKU

**Item type**:
The role an Item plays: `RAW_MATERIAL`, `SEMI_FINISHED`, `FINISHED_GOOD`, `SERVICE`, or `CONSUMABLE`. A stable code; its displayed label comes from the Business's own terminology.
_Avoid_: MP, PSF, PF, Catégorie, Category

**Unit of measure**:
The unit in which a quantity of an Item is expressed.
_Avoid_: Unité (on its own), UOM

**Bill of Materials (BOM)**:
The component Items and their quantities needed to produce one unit of a finished Item, in one version.
_Avoid_: Recette, Recipe, Composition, Nomenclature

**BOM version**:
An immutable, dated revision of a Bill of Materials. A Production Order consumes a version, never "the current one".
_Avoid_: Révision (informal), BOM draft

### Documents

**Document**:
Any numbered record a Business produces — a Sales Order, a Delivery Note, a Customer Invoice, and so on. Every Document type shares the same numbering, immutability and rendering machinery.
_Avoid_: Pièce, Formulaire, Record

**Draft**:
A Document that has not been issued: no number, fully editable, deletable.
_Avoid_: Brouillon, Temporary

**Issued**:
A Document that has been given its number: immutable, never edited, never deleted, archived as a PDF. Corrections happen through a new document.
_Avoid_: Validé, Finalisé, Closed

**Sales Order**:
A confirmed commitment to sell, and the origin of Delivery Notes and Customer Invoices.
_Avoid_: Commande client, Bon de commande, BC

**Purchase Order**:
A confirmed commitment to buy, and the origin of Goods Receipts.
_Avoid_: Commande fournisseur, Approvisionnement, BC

**Order line**:
A line of a Document, carrying Item, quantity, unit of measure, unit price and tax rate — all resolved on the server.
_Avoid_: Ligne de commande, Article line

**Delivery Note**:
The record of goods leaving against a Sales Order. Converting a Reservation into Stock Ledger Entries.
_Avoid_: Bon de livraison, BL, Bordereau

**Goods Receipt**:
The record of goods arriving against a Purchase Order.
_Avoid_: Bon de réception, BR

**Discrepancy**:
The difference between the quantity expected and the quantity actually recorded on a Goods Receipt or a Delivery Note. Kept as its own record so the document and the stock never disagree.
_Avoid_: Litige, Alerte, Écart (implicite)

**Production Order**:
An order to manufacture an Item, consuming one BOM version and producing that Item.
_Avoid_: OF, Ordre de fabrication (acronym alone)

### Numbering

**Document number**:
The readable, unique identifier given to an Issued Document. Never reused, never reassigned.
_Avoid_: Référence (ambiguous with product reference), Ref

**Number series**:
An atomic counter for one Document type and one year, guaranteeing an unbroken sequence. Gaps are structurally impossible.
_Avoid_: Séquence, Compteur, Counter

### Inventory

**Stock Ledger Entry**:
An append-only record of every stock change, with its source, quantity, and the balance before and after. The only way stock ever changes.
_Avoid_: Mouvement de stock, StockMovement, Stock change

**On-hand**:
The quantity physically present, derived from the Stock Ledger. Never stored as a column.
_Avoid_: stockActuel, Stock, Quantité en stock (as a stored value)

**Reserved**:
Quantity already promised to a confirmed Sales Order and not yet delivered.
_Avoid_: Stock réservé (as a column), Hold

**Available**:
`On-hand` minus `Reserved`. This is the number the interface shows when someone asks "can we sell it?".
_Avoid_: Stock disponible, Available stock (as a column)

**Reservation**:
The record created when a Sales Order is confirmed, released when the order is cancelled. Created and released inside the same transaction that changes the order.
_Avoid_: Bloc, Hold, Lock

**Opening balance**:
The first Stock Ledger Entry of an Item, representing stock that existed before the Business went live. Refused once the Item has any other entry; what happens afterwards is an adjustment with a written reason.
_Avoid_: Stock initial, Inventaire d'ouverture

**Reversal**:
A Stock Ledger Entry that corrects another one by taking the opposite direction of the entry it reverses and pointing at it. The entry being corrected is never edited.
_Avoid_: Correction, Annulation de mouvement, Négation

### Finance

**Tax rate**:
A rate with effective dates, assigned to an Item or defaulting for the Business. Never a literal in code.
_Avoid_: TVA (as a fixed value), Taux codé en dur

**VAT regime**:
The Business's fiscal regime: `STANDARD` (VAT broken out per rate) or `EXEMPT` (a legal mention instead of a breakdown).
_Avoid_: Régime TVA, Tax regime

**Customer Invoice**:
A fiscal document, Issued, numbered in an unbroken series, and immutable. Its rendering and numbering exist for the tax authority's benefit, not the user's.
_Avoid_: Facture (as an entity), Facture client

**Credit Note**:
A correcting or cancelling document for a Customer Invoice, with its own Number series. The only legal way to change an issued invoice.
_Avoid_: Avoir (acronym alone), Annulation, Refund

**Payment**:
A recorded receipt of money, with its Allocations to one or more Documents. easyERP records payments; it does not process them.
_Avoid_: Règlement bancaire, Transaction, Chargeback

**Allocation**:
The assignment of a Payment to a Document — a Customer Invoice or a Credit Note — whole or partial. Assigning to a Credit Note is how a refund is recorded.
_Avoid_: Affectation, Imputation

**Unallocated credit**:
The part of a Payment not yet assigned to any Document. Money already received and not yet counted against anything.
_Avoid_: Solde, Reste

**Outstanding**:
What a Customer owes: what has been invoiced, less what has been credited, less the Payments assigned to those Documents. Always derived, never stored.
_Avoid_: Solde client (as a stored value), Balance

### Extensibility

**Module**:
A named capability of easyERP that a Business can switch off. A disabled Module is absent from navigation and its endpoints refuse every request; it never hides data that was already recorded.
_Capital M always means this._ Lowercase _module_ means a unit of code with one interface — the thing a caller depends on and does not read the inside of. An **Area** groups Modules for navigation and for reading the plan; an Area is not switchable and an Area is never an architectural unit. See `docs/specs/001-first-business-and-core-slice.md`.
_Avoid_: Feature, Plugin, Pack, Option, Add-on

**Custom Field**:
A field a Business defines on an Item, a Party, or a Document header or line, with its type, validation and display order. Disabling one never destroys stored data.
_Avoid_: Champ personnalisé (as a variable name), Attribut, Metadata field

**Custom Record**:
A row in a table a Business defines, composed of Custom Fields. Stored, listed, exported — and with no effect on stock, invoicing, or workflows.
_Avoid_: Module, Entité dynamique, Custom entity

### Coming into being

**Setup**:
The one-time act of creating a Business, its first Administrator and the settings without which nothing can be issued. It happens once and cannot be repeated.
_Avoid_: Installation, Onboarding wizard, Bootstrap, Initialisation

**Setting**:
A configurable fact about the Business — its legal identity, VAT regime, tax rates, number patterns, terminology — held in the database and edited by an Administrator. Never a file mounted into the container, so replacing an image cannot alter it.
_Avoid_: Config file, Environment variable (for anything a Business chooses), Parameter

**Backfill**:
The filling-in of a Setting that a later release of easyERP made required, with a safe default, on a Business that was set up before that release existed. Never asks the Business to choose, never blocks its use.
_Avoid_: Migration (too broad — that also means schema changes), Patch, Fix

**Document archive**:
The Business's own copy of every issued Document's rendered PDF, kept on the host's disk by the Business. Not part of the database and not covered by the database backup.
_Avoid_: Attachment, File store, Blobs

### Audit

**Notification**:
An internal alert addressed to a User, whose read state belongs to that recipient alone.
_Avoid_: Alerte, Message, Push

**Audit trail**:
An immutable record of who did what, to which record, with the state before and after.
_Avoid_: Log, Historique, Journal

## Running a local instance

Operational reference, not vocabulary. `AGENTS.md` holds the full description and the gates.

```bash
pnpm dev
```

Starts PostgreSQL, applies the migrations, and runs the API on `3002` and the web app on `3003`. Docker is the only prerequisite. Nothing else to set up, no environment variables to write.

The API serves everything under `/api`, so the two addresses worth knowing are `http://localhost:3002/api/health` and `http://localhost:3002/api/ready`. The web app proxies `/api/*` to the API, so `http://localhost:3003` is enough to drive the product.

One PostgreSQL container holds **two** databases: `easyerp` for `pnpm dev`, where rows survive, and `easyerp_test` for `pnpm test:integration`, where every table is emptied between tests. They are separate because the suite is the most destructive thing in the repository, and the harness refuses any database whose name does not look disposable.
