import { MockDataAdapter } from "@/data/mock";
import { CANONICAL_REPORTING_SCHEMA_VERSION, type AdapterInput, type AdapterManifest, type CanonicalReportingPackageV1, type CompanyAdapter } from "../contract";
import { assertCanonicalReportingPackage } from "../validator";

export class ReferenceCompanyAdapter implements CompanyAdapter {
  readonly id = "reference-demo";
  readonly manifest: AdapterManifest = {
    id: this.id,
    name: "Northpoint Demo",
    version: "1.0.0",
    schemaVersion: CANONICAL_REPORTING_SCHEMA_VERSION,
    description: "Reference implementation that packages the deterministic Northpoint demo dataset.",
    sourceKinds: ["generated-demo"],
    capabilities: { finance: true, sales: true, cashFlow: true, operational: true },
  };
  private canonicalPackage?: CanonicalReportingPackageV1;

  load(_input?: AdapterInput): CanonicalReportingPackageV1 {
    if (!this.canonicalPackage) {
      const dataset = new MockDataAdapter().load();
      const sourceTotal = dataset.financeRecords.length + dataset.salesRecords.length + dataset.cashFlowRecords.length + dataset.operationalRecords.length;
      this.canonicalPackage = {
        ...dataset,
        schemaVersion: CANONICAL_REPORTING_SCHEMA_VERSION,
        adapterManifest: this.manifest,
        generatedAt: "2026-03-31T00:00:00.000Z",
        sourceFiles: ["generated-demo"],
        assumptions: ["Deterministic reference data; no external source files are read."],
        reconciliations: [{ id: "reference-record-count", label: "Reference source rows to canonical rows", sourceTotal, canonicalTotal: sourceTotal, difference: 0, tolerance: 0 }],
      };
      assertCanonicalReportingPackage(this.canonicalPackage);
    }
    return this.canonicalPackage;
  }
}
