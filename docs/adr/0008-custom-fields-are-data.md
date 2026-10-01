# Custom fields are data, never per-Business DDL

Client-defined fields are rows in a `field_definition` table plus a `jsonb` column on the entities that accept them, not tables created per Business. One schema serves every deployment, so migrations stay single-sided and every Business shares a schema version. Definitions are validated by Zod schemas generated at runtime, so the API, the forms and the exports all enforce the same rules. Field types are limited to text, number, date, boolean, enum and references to an Item or a Party; there are no formulas, nested objects or repeatable fields, because a formula field is where "just a field" quietly becomes a spreadsheet engine and stops being testable.

## Consequences

- Filtering and sorting on custom fields is done with `jsonb` containment plus a GIN index, and an expression index for fields the Business actually filters on.
- Fields are disabled, never deleted; stored data outlives the definition.
- Extensibility stops at Custom Records. A request for custom entities that feed stock or invoicing is a core feature with its own ADR, never a configuration.
