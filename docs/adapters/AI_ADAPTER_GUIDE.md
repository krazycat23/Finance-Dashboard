# AI Adapter Guide

Use this guide when generating or reviewing a company adapter. AI assistance may write ordinary adapter code, but the application does not call an AI API at runtime.

## Rules

1. Put every company-specific parser, mapping table and transformation below src/adapters/<adapter-id>.
2. Implement CompanyAdapter and publish an immutable AdapterManifest targeting schemaVersion 1.0.
3. Preserve source identifiers as strings. Never coerce entity, account, period or hierarchy codes to numbers; 0040 and 40 are different identifiers.
4. Transform source data into CanonicalReportingPackageV1. Do not teach the generic ingestion engine company-specific aliases or rules.
5. Include source file lineage, explicit assumptions and at least one reconciliation.
6. Run assertCanonicalReportingPackage before returning the package.
7. Register a factory in src/adapters/registry.ts. Reporting pages and selectors must never import the adapter.

## Manifest checklist

Provide a stable id, human-readable name, semantic adapter version, schema version, description, accepted source kinds and truthful finance/sales/cash-flow/operational capabilities.

## Validation workflow

Run npm run validate:adapter -- <adapter-id>. Then run npm run typecheck, npm run verify, npm run verify:runtime and npm run build.

Validation must reject orphan periods, entities, accounts, optional dimensions and scenarios; unknown statement/calculation roles; duplicate or non-string IDs; non-finite measures; and reconciliations whose computed difference is inconsistent or outside tolerance.

## Isolation

The data-provider boundary is the only application-layer resolution point. Adapters may import the canonical domain and generic ingestion utilities. The canonical domain, selectors, pages and reporting components may not import src/adapters/<company> or src/data/mock.

The reference implementation is src/adapters/reference/index.ts.
