import type { CanonicalCalculationRole } from "@/domain/models";
import type { ReportingDataAdapter, ReportingDataset } from "@/domain/data";

export const CANONICAL_REPORTING_SCHEMA_VERSION = "1.0" as const;
export type CanonicalReportingSchemaVersion = typeof CANONICAL_REPORTING_SCHEMA_VERSION;

export interface AdapterManifest {
  id: string;
  name: string;
  version: string;
  schemaVersion: CanonicalReportingSchemaVersion;
  description: string;
  sourceKinds: string[];
  capabilities: { finance: boolean; sales: boolean; cashFlow: boolean; operational: boolean };
}

export interface AdapterInputFile { name: string; mediaType?: string; bytes?: Uint8Array; text?: string }
export interface AdapterInput { files?: AdapterInputFile[]; options?: Readonly<Record<string, unknown>> }
export interface CanonicalReconciliation { id: string; label: string; sourceTotal: number; canonicalTotal: number; difference: number; tolerance: number }

export interface CanonicalReportingPackageV1 extends ReportingDataset {
  schemaVersion: CanonicalReportingSchemaVersion;
  adapterManifest: AdapterManifest;
  generatedAt: string;
  sourceFiles: string[];
  assumptions: string[];
  reconciliations: CanonicalReconciliation[];
}

export interface CompanyAdapter extends ReportingDataAdapter {
  readonly manifest: AdapterManifest;
  load(input?: AdapterInput): CanonicalReportingPackageV1;
  /**
   * Optional: fetch whatever `load` needs before it is called. `load` is
   * synchronous by contract, so an adapter whose sources are external — files
   * on a host, an export to download — resolves them here and the runtime
   * awaits it. Adapters with nothing to fetch simply omit it.
   */
  prepare?(): Promise<AdapterInput>;
}

export type SupportedCanonicalRole = CanonicalCalculationRole;
