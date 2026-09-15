import {
  CANONICAL_REPORTING_SCHEMA_VERSION,
  type AdapterInput, type AdapterManifest, type CanonicalReportingPackageV1, type CompanyAdapter,
} from "../contract";
import { assertCanonicalReportingPackage } from "../validator";
import { buildFreedomPackage } from "./canonical";
import { openWorkbooks } from "./workbook";

export const freedomManifest: AdapterManifest = {
  id: "freedom-furniture",
  name: "Freedom Furniture",
  version: "1.0.0",
  schemaVersion: CANONICAL_REPORTING_SCHEMA_VERSION,
  description: "Freedom Furniture workbook adapter: three wide trial balances, an authoritative GL mapping, the FY27 financial calendar and two weekly sales reports.",
  sourceKinds: ["excel-trial-balance", "excel-budget", "excel-financial-calendar", "excel-gl-mapping", "excel-weekly-sales"],
  capabilities: { finance: true, sales: true, cashFlow: false, operational: false },
};

export const freedomAdapterManifest = {
  ...freedomManifest,
  company: "Freedom Furniture Australia",
  expectedInputFiles: [
    "FY26 Final TB.xlsx",
    "AUG TB.xlsx",
    "FY27 Budget TB.xlsx",
    "FY27_Fin_Calendar.xlsx",
    "FF_GL_PL_Mapping.xlsx",
    "Weekly Sales FY26.xlsx",
    "Weekly sales since 07.xlsx",
  ] as string[],
  sourceAssumptions: [
    "Identifiers are strings; leading zeroes are retained.",
    "Financial calendar tokens are fiscal values.",
    "GL hierarchy is sourced from FF_GL_PL_Mapping.xlsx.",
  ],
} as const;

/**
 * FREEDOM FURNITURE ADAPTER
 * ---------------------------------------------------------------------------
 * Source bytes in, CanonicalReportingPackageV1 out. The adapter never reads a
 * filesystem: the workbooks arrive through AdapterInput.files, which is what
 * lets the identical code path serve the Node validation harness and a browser
 * upload. Calling it without sources is an error rather than an empty package,
 * because an empty package would validate.
 */
export class FreedomCompanyAdapter implements CompanyAdapter {
  readonly id = freedomManifest.id;
  readonly manifest = freedomManifest;
  private cached?: CanonicalReportingPackageV1;

  /**
   * Fetch the bundled workbooks. The canonical contract keeps `load`
   * synchronous, so everything asynchronous happens here and the bytes are
   * handed over exactly as the validation harness hands over files read from
   * disk — one code path, two callers.
   */
  async prepare(): Promise<AdapterInput> {
    // Imported here rather than at module scope: the asset glob is a Vite
    // feature, and the Node validation harness — which supplies the same
    // workbooks by reading the same directory from disk — must never evaluate it.
    const { SOURCE_URLS } = await import("./sourceAssets");
    const files = await Promise.all(
      Object.entries(SOURCE_URLS).map(async ([path, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Freedom source ${path} could not be fetched: ${response.status} ${response.statusText}`);
        return {
          name: path.split("/").pop() ?? path,
          mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      }),
    );
    return { files };
  }

  load(input?: AdapterInput): CanonicalReportingPackageV1 {
    if (this.cached) return this.cached;

    const files = (input?.files ?? []).filter((file) => file.bytes && file.bytes.length > 0);
    if (files.length === 0) {
      throw new Error(
        `The Freedom adapter needs its source workbooks. Supply them as AdapterInput.files: ${freedomAdapterManifest.expectedInputFiles.join(", ")}.`,
      );
    }

    const workbooks = openWorkbooks(files);
    const missing = freedomAdapterManifest.expectedInputFiles.filter((name) => !workbooks.has(name));
    if (missing.length > 0) throw new Error(`Freedom source workbook(s) missing: ${missing.join(", ")}.`);

    const pkg = buildFreedomPackage(workbooks, freedomManifest, files.map((file) => file.name));
    assertCanonicalReportingPackage(pkg);
    this.cached = pkg;
    return pkg;
  }
}
