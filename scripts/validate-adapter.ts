import { resolveCompanyAdapter, validateCanonicalReportingPackage } from "@/adapters";

const adapterId = process.argv[2] ?? "reference-demo";

try {
  const adapter = resolveCompanyAdapter(adapterId);
  const pkg = adapter.load();
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
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
