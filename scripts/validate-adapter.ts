import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { listCompanyAdapters, resolveCompanyAdapter, validateCanonicalReportingPackage } from "@/adapters";
import type { AdapterInputFile } from "@/adapters";

const requested = process.argv[2] ?? "reference-demo";

/**
 * Adapters take their sources as bytes so that the same code path serves this
 * harness and a browser upload. Where an adapter ships a `sources/` directory
 * beside its implementation, those files are read here and handed over as
 * AdapterInput. This is deliberately generic: the harness knows about a
 * directory convention, never about a particular company's workbooks.
 */
function sourceFilesFor(adapterId: string): AdapterInputFile[] {
  const directories = readdirSync(resolve("src/adapters"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  // The adapter's registered id and its directory name need not match, so every
  // adapter directory that carries sources is offered and the adapter itself
  // decides which files it recognises.
  const candidates = directories.filter((name) => adapterId.startsWith(name) || name.startsWith(adapterId));
  const chosen = candidates.length > 0 ? candidates : directories;

  return chosen.flatMap((name) => {
    const directory = resolve("src/adapters", name, "sources");
    if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
    return readdirSync(directory)
      .filter((file) => !file.startsWith("."))
      .map((file) => ({ name: file, bytes: new Uint8Array(readFileSync(join(directory, file))) }));
  });
}

/** Accept an unambiguous prefix, so `freedom` resolves `freedom-furniture`. */
function resolveAdapterId(input: string): string {
  const registered = listCompanyAdapters();
  if (registered.includes(input)) return input;
  const matches = registered.filter((id) => id.startsWith(input));
  if (matches.length === 1) return matches[0];
  return input;
}

try {
  const adapterId = resolveAdapterId(requested);
  const adapter = resolveCompanyAdapter(adapterId);
  const files = sourceFilesFor(adapterId);
  const pkg = adapter.load(files.length > 0 ? { files } : undefined);
  const result = validateCanonicalReportingPackage(pkg);

  if (!result.valid) {
    for (const issue of result.errors) {
      console.error(`[${issue.code}] ${issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Adapter ${adapter.manifest.id} is valid: schema ${pkg.schemaVersion}, ${result.checkedRecords} records, ${result.checkedReconciliations} reconciliation(s).`,
    );
    report(pkg);
  }
} catch (error) {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
}

function report(pkg: ReturnType<ReturnType<typeof resolveCompanyAdapter>["load"]>): void {
  const scenarios = pkg.scenarios.map((scenario) => scenario.id).join(", ");
  const mapping = pkg.dataQuality.mappingSummaries[0];
  console.log("");
  console.log(`  finance facts      ${pkg.financeRecords.length}`);
  console.log(`  monthly sales      ${pkg.salesRecords.length}`);
  console.log(`  weekly sales       ${pkg.weeklySalesRecords.length}`);
  console.log(`  periods            ${pkg.periods.length} (${pkg.periods.filter((period) => period.isActual).length} actual) ${pkg.periods[0]?.id ?? "-"} … ${pkg.periods.at(-1)?.id ?? "-"}`);
  console.log(`  weeks              ${pkg.weeks.length}`);
  console.log(`  scenarios          ${scenarios}`);
  console.log(`  entities           ${pkg.dimensions.entities.length}`);
  console.log(`  cost centres       ${pkg.dimensions.costCentres.length}`);
  console.log(`  departments        ${pkg.dimensions.departments.length}`);
  console.log(`  accounts           ${pkg.dimensions.accounts.length}`);
  if (mapping) {
    console.log(`  GL count coverage  ${mapping.mapped}/${mapping.total} (${((mapping.mapped / Math.max(mapping.total, 1)) * 100).toFixed(1)}%)`);
    console.log(`  GL value coverage  ${(mapping.valueCoverage * 100).toFixed(2)}%`);
  }
  console.log(`  capabilities       ${Object.entries(pkg.capabilities ?? {}).filter(([, on]) => on).map(([name]) => name).join(", ") || "none"}`);
  console.log("");
  console.log("  reconciliations");
  for (const entry of pkg.reconciliations) {
    const status = Math.abs(entry.difference) <= entry.tolerance ? "OK  " : "FAIL";
    console.log(`   ${status} ${entry.label}`);
    console.log(`        source ${entry.sourceTotal.toFixed(2)}  canonical ${entry.canonicalTotal.toFixed(2)}  difference ${entry.difference.toFixed(2)}  tolerance ${entry.tolerance.toFixed(2)}`);
  }
  const unsupported = pkg.assumptions.filter((note) => note.startsWith("Unsupported:"));
  if (unsupported.length > 0) {
    console.log("");
    console.log("  unsupported source features");
    for (const note of unsupported) console.log(`   - ${note.replace(/^Unsupported: /, "")}`);
  }
}
