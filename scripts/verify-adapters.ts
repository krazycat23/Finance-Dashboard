import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ReferenceCompanyAdapter,
  resolveCompanyAdapter,
  validateCanonicalReportingPackage,
  type CanonicalReportingPackageV1,
} from "@/adapters";

const reference = new ReferenceCompanyAdapter().load();
let passed = 0;
const failures: string[] = [];

function expect(name: string, condition: boolean, detail = "expectation failed"): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}: ${detail}`);
}

function copy(): CanonicalReportingPackageV1 {
  return structuredClone(reference);
}

function hasCode(pkg: CanonicalReportingPackageV1, code: string): boolean {
  return validateCanonicalReportingPackage(pkg).errors.some((issue) => issue.code === code);
}

expect("valid package", validateCanonicalReportingPackage(reference).valid);

const orphanPeriod = copy();
orphanPeriod.financeRecords[0].periodId = "missing-period";
expect("orphan period", hasCode(orphanPeriod, "orphan_period"));

const orphanEntity = copy();
orphanEntity.financeRecords[0].entityId = "missing-entity";
expect("orphan entity", hasCode(orphanEntity, "orphan_entity"));

const orphanAccount = copy();
orphanAccount.financeRecords[0].accountId = "missing-account";
expect("orphan account", hasCode(orphanAccount, "orphan_account"));

const leadingZero = copy();
leadingZero.dimensions.entities.push({
  ...leadingZero.dimensions.entities[0],
  id: "001",
  name: "Leading-zero identifier",
  parentId: leadingZero.defaultEntityId,
  level: 1,
});
expect(
  "leading-zero IDs are preserved",
  validateCanonicalReportingPackage(leadingZero).valid && leadingZero.dimensions.entities.at(-1)?.id === "001",
);

const invalidRole = copy();
(invalidRole.dimensions.accounts[0] as unknown as { calculationRole: string }).calculationRole = "inventedRole";
expect("invalid canonical role", hasCode(invalidRole, "invalid_canonical_role"));

const failedReconciliation = copy();
failedReconciliation.reconciliations[0].canonicalTotal += 5;
failedReconciliation.reconciliations[0].difference =
  failedReconciliation.reconciliations[0].canonicalTotal - failedReconciliation.reconciliations[0].sourceTotal;
expect("reconciliation failure", hasCode(failedReconciliation, "reconciliation_failure"));

const resolved = resolveCompanyAdapter("reference-demo");
const resolvedPackage = resolved.load();
expect("demo adapter schema", resolvedPackage.schemaVersion === "1.0");
expect("demo adapter manifest", resolvedPackage.adapterManifest.id === "reference-demo");
expect("demo adapter output", validateCanonicalReportingPackage(resolvedPackage).valid);
expect("registry resolution", resolved.manifest.id === "reference-demo");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.[tj]sx?$/.test(entry) ? [path] : [];
  });
}

const root = resolve(process.cwd());
const boundaryFiles = [
  join(root, "src/app/providers/ReportingDataProvider.tsx"),
  join(root, "src/app/App.tsx"),
  ...sourceFiles(join(root, "src/pages")),
  ...sourceFiles(join(root, "src/domain/selectors")),
];
const directAdapterImports = boundaryFiles.filter((file) => {
  const source = readFileSync(file, "utf8");
  return /@\/adapters\/(reference|[^"']*company)|@\/data\/mock/.test(source);
});
expect(
  "adapter/reporting isolation",
  directAdapterImports.length === 0,
  `direct company adapter import(s): ${directAdapterImports.join(", ")}`,
);

if (failures.length > 0) {
  throw new Error(`Adapter contract verification failed:\n${failures.join("\n")}`);
}

console.log(`Adapter contract verification: ${passed} checks passed`);
