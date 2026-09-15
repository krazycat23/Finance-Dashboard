# Canonical Reporting Contract

The reporting boundary accepts one versioned package: CanonicalReportingPackageV1 from src/adapters/contract.ts. Reporting pages and selectors consume only ReportingDataset; they never import company adapters.

## Version

schemaVersion 1.0 is mandatory on both the package and its adapter manifest. A version mismatch is rejected before activation.

## Package structure

- Existing reporting dataset fields: periods, weeks, dimensions, finance, sales, weekly sales, operational and cash-flow facts, scenarios, defaults, profile, capabilities and data quality.
- adapterManifest: stable adapter id/name/version, target schema, supported source kinds and produced capabilities.
- generatedAt, sourceFiles, and assumptions: package-level lineage.
- reconciliations: source total, canonical total, declared difference and tolerance.

Identifiers are opaque non-empty strings. Leading zeroes are significant. Facts must reference existing periods, entities, accounts, optional dimensions and scenarios.

## Validation

validateCanonicalReportingPackage returns structured errors and counts. assertCanonicalReportingPackage throws for activation or adapter development. Validation covers schema and manifest compatibility, ID uniqueness, referential integrity, finite measures, canonical account roles and reconciliation tolerances.

## Boundary

ReportingDataProvider resolves registered adapter ids through resolveCompanyAdapter. The generic ingestion runtime remains unchanged and imported workspaces still produce the existing ReportingDataset shape.
