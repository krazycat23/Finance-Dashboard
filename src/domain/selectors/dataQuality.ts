import { getReportingDataset } from "@/domain/data";
import type {
  DataIssue, ImportEvent, MappingSummaryInput, ReconciliationResult,
} from "@/domain/data";

export type { DataIssue } from "@/domain/data";

export interface MappingSummary extends MappingSummaryInput { coverage: number; }
export type ReconciliationLine = ReconciliationResult;
export type RefreshEvent = ImportEvent;
export interface DataHealth {
  score: number;
  grade: "Strong" | "Adequate" | "At risk";
  components: { id: string; label: string; score: number; weight: number }[];
  unmappedAccounts: number;
  unmappedProducts: number;
  duplicateRecords: number;
  reconciliationExceptions: number;
  lastRefresh: string;
}

const dataQuality = () => getReportingDataset().dataQuality;

/** Dataset-owned mapping facts, with only display coverage derived here. */
export function selectMappingSummary(): MappingSummary[] {
  return dataQuality().mappingSummaries.map((summary) => ({
    ...summary,
    coverage: summary.total ? summary.mapped / summary.total : 1,
  }));
}

export function selectUnmappedAccounts() {
  return dataQuality().unmappedMembers
    .filter((member) => member.dimension === "accounts")
    .map(({ dimension: _dimension, ...member }) => ({ ...member, value: member.value ?? 0, suggestedLine: member.suggestedLine ?? "—", confidence: member.confidence ?? 0 }));
}

export function selectUnmappedProducts() {
  return dataQuality().unmappedMembers
    .filter((member) => member.dimension === "products")
    .map(({ dimension: _dimension, ...member }) => ({ ...member, suggestedCategory: member.suggestedCategory ?? "—", confidence: member.confidence ?? 0 }));
}

export function selectReconciliation(): ReconciliationLine[] {
  return dataQuality().reconciliations;
}

export function selectDataIssues(): DataIssue[] {
  return dataQuality().issues;
}

export function selectRefreshLog(): RefreshEvent[] {
  return dataQuality().imports;
}

export function selectDataHealth(): DataHealth {
  const quality = dataQuality();
  const mapping = selectMappingSummary();
  const reconciliation = selectReconciliation();
  const refresh = selectRefreshLog();
  const weights = {
    mapping: quality.health.mappingWeight ?? 0.35,
    reconciliation: quality.health.reconciliationWeight ?? 0.3,
    integrity: quality.health.integrityWeight ?? 0.2,
    timeliness: quality.health.timelinessWeight ?? 0.15,
  };
  const account = mapping.find((row) => row.dimension === "GL Accounts");
  const product = mapping.find((row) => row.dimension === "Products");
  const exceptions = reconciliation.filter((row) => row.status === "Exception").length;
  const unavailable = reconciliation.filter((row) => row.status === "Unavailable").length;
  const components = [
    { id: "mapping", label: "Mapping completeness", score: (account?.valueCoverage ?? 1) * 100, weight: weights.mapping },
    { id: "reconciliation", label: "Reconciliation", score: reconciliation.length ? Math.max(0, 1 - (exceptions + unavailable) / reconciliation.length) * 100 : 0, weight: weights.reconciliation },
    { id: "integrity", label: "Record integrity", score: quality.health.integrityScore, weight: weights.integrity },
    { id: "timeliness", label: "Timeliness", score: refresh.length ? refresh.filter((row) => row.status === "Success").length / refresh.length * 100 : 100, weight: weights.timeliness },
  ];
  const score = components.reduce((sum, component) => sum + component.score * component.weight, 0);
  return {
    score, grade: score >= 90 ? "Strong" : score >= 75 ? "Adequate" : "At risk", components,
    unmappedAccounts: account?.unmapped ?? 0, unmappedProducts: product?.unmapped ?? 0,
    duplicateRecords: quality.issues.find((issue) => issue.category === "Duplicates")?.affectedRecords ?? 0,
    reconciliationExceptions: exceptions, lastRefresh: refresh[0]?.completedAt ?? "",
  };
}
