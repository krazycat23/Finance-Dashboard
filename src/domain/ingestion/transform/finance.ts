import type { Account, FinanceRecord } from "@/domain/models";
import { resolveAccountRule } from "../mapping";
import type { IngestionIssue, MappingRule, StagedDataset } from "../types";
import type { ImportTransformationContext } from "./context";
import { resolveScenario } from "./scenarios";
import { amount, fieldValue, prepareDatasetRows, text } from "./shared";
import type { DimensionTokens } from "./dimensions";
import { remember } from "./dimensions";
import type { CalendarResult } from "./periods";
import { resolveMonthlyPeriodToken } from "./periods";
import { ReconciliationAccumulator, type FinanceDatasetEvidence, type StageEvidence } from "./reconciliation";

export interface FinanceTransformResult { accounts: Map<string, Account>; records: FinanceRecord[]; magnitude: Map<string, number>; raw: number; sign: number; mapped: number; unmapped: number; unresolved: number; issues: IngestionIssue[]; reconciliation: FinanceDatasetEvidence[]; }
const empty = (): StageEvidence => ({ rows: 0, total: 0, magnitude: 0 });
const add = (stage: StageEvidence, value: number) => { stage.rows += 1; stage.total += value; stage.magnitude += Math.abs(value); };
const rawAmounts = (row: Record<string, unknown>, dataset: StagedDataset, mappings: ReturnType<ImportTransformationContext["workspace"]["mappings"]["filter"]>) => dataset.wideUnpivot ? dataset.wideUnpivot.valueColumns.map(column => amount(row[column])).filter(Number.isFinite) : [amount(fieldValue(row, mappings, "amount") ?? row.amount)].filter(Number.isFinite);

export function transformFinanceSources(context: ImportTransformationContext, rules: MappingRule[], tokens: DimensionTokens | undefined, calendar: CalendarResult): FinanceTransformResult {
  const accounts = new Map<string, Account>(), records: FinanceRecord[] = [], magnitude = new Map<string, number>(), issues: IngestionIssue[] = [], reconciliation: FinanceDatasetEvidence[] = [];
  let raw = 0, sign = 0, mapped = 0, unmapped = 0, unresolved = 0;
  for (const dataset of context.financeDatasets) {
    const mappings = context.workspace.mappings.filter(mapping => mapping.datasetId === dataset.id), scenario = resolveScenario(context.workspace, dataset.id)!;
    const accumulator = new ReconciliationAccumulator(); const rawStage = empty();
    for (const row of dataset.rows) for (const value of rawAmounts(row, dataset, mappings)) add(rawStage, value);
    rawStage.rows = dataset.rows.length; accumulator.record("raw", rawStage.rows, rawStage.total, rawStage.magnitude);
    const prepared = prepareDatasetRows(dataset), preparedStage = empty(), signStage = empty(), mappedStage = empty(), unmappedStage = empty();
    const unpivotStage = dataset.wideUnpivot ? empty() : undefined;
    const evidence: FinanceDatasetEvidence = { datasetId: dataset.id, sourceFileId: dataset.sourceFileId, sourceSheet: dataset.sourceSheet, scenarioId: scenario.scenarioId, periods: new Set<string>(), raw: rawStage, prepared: preparedStage, unpivot: unpivotStage, sign: { ...signStage, adjustment: 0, expected: 0 }, mapped: mappedStage, unmapped: unmappedStage };
    for (const [index, row] of prepared.entries()) {
      const source = amount(fieldValue(row, mappings, "amount") ?? row[dataset.wideUnpivot?.valueField ?? "amount"]);
      if (!Number.isFinite(source)) continue;
      add(preparedStage, source); if (unpivotStage) add(unpivotStage, source);
      const accountId = text(fieldValue(row, mappings, "accountId"));
      if (!accountId) continue;
      raw += source; magnitude.set(accountId, (magnitude.get(accountId) ?? 0) + Math.abs(source));
      const rawPeriod = fieldValue(row, mappings, "period") ?? fieldValue(row, mappings, "date") ?? row.period;
      const periodToken = text(rawPeriod); const periodId = resolveMonthlyPeriodToken(periodToken) ?? calendar.periodTokenIds.get(periodToken);
      if (!periodId) { issues.push({ id: `${dataset.id}:period:${index + 1}`, severity: "error", datasetId: dataset.id, field: "period", message: `${dataset.id}: unresolved finance period ${periodToken || "(blank)"}`, affectedRows: 1, samples: [row], recommendedAction: "Map a monthly period/date or provide an authoritative fiscal calendar token." }); continue; }
      evidence.periods.add(periodId);
      const rule = resolveAccountRule(accountId, text(fieldValue(row, mappings, "accountName")), rules), canonical = source * (rule?.sourceMultiplier ?? 1);
      add(signStage, canonical); evidence.sign.adjustment += canonical - source; evidence.sign.expected += source * (rule?.sourceMultiplier ?? 1); sign += canonical;
      if (!rule || rule.line === "unconfirmed") {
        add(unmappedStage, canonical); unmapped += canonical; unresolved += Math.abs(source);
        accounts.set(accountId, { id: accountId, name: accountId, externalId: accountId, mappingStatus: "unmapped", statement: "pnl", line: "unconfirmed", sign: 1, accountMappingStatus: "Needs Review" });
        continue;
      }
      add(mappedStage, canonical); mapped += canonical;
      const entityId = text(fieldValue(row, mappings, "entityId")) || "company", costCentreId = text(fieldValue(row, mappings, "costCentreId")) || undefined, departmentId = text(fieldValue(row, mappings, "departmentId")) || undefined;
      if (tokens) { remember(tokens.entities, entityId); if (costCentreId) remember(tokens.costCentres, costCentreId); if (departmentId) remember(tokens.departments, departmentId); }
      accounts.set(accountId, { id: accountId, name: text(fieldValue(row, mappings, "accountName")) || accountId, externalId: accountId, mappingStatus: "mapped", statement: rule.statement, line: rule.line, sign: rule.sign, reportingHierarchy: rule.reportingHierarchy, calculationRole: rule.calculationRole, mappingSource: rule.mappingSource, accountMappingStatus: rule.mappingStatus, sourceMultiplier: rule.sourceMultiplier });
      records.push({ periodId, entityId, costCentreId, departmentId, accountId, scenarioValues: [{ scenarioId: scenario.scenarioId, value: canonical }], ...(scenario.kind === "actual" ? { actual: canonical } : scenario.kind === "budget" ? { budget: canonical } : { forecast: canonical }), lineage: { sourceImportId: dataset.sourceFileId, sourceReference: dataset.id, sourceRow: index + 1, mappingVersion: rule.id } });
    }
    accumulator.record("prepared", preparedStage.rows, preparedStage.total, preparedStage.magnitude); if (unpivotStage) accumulator.record("unpivot", unpivotStage.rows, unpivotStage.total, unpivotStage.magnitude); accumulator.record("sign", signStage.rows, signStage.total, signStage.magnitude); accumulator.record("mapped", mappedStage.rows, mappedStage.total, mappedStage.magnitude); accumulator.record("unmapped", unmappedStage.rows, unmappedStage.total, unmappedStage.magnitude);
    evidence.sign = { ...signStage, adjustment: evidence.sign.adjustment, expected: evidence.sign.expected }; reconciliation.push(evidence);
  }
  // Final canonical evidence is captured independently by reading the facts
  // after construction, not by reusing mapped-stage totals.
  for (const evidence of reconciliation) {
    const canonical = empty();
    for (const record of records) if (record.lineage?.sourceReference === evidence.datasetId) {
      const value = record.scenarioValues?.find(item => item.scenarioId === evidence.scenarioId)?.value;
      if (value !== undefined) add(canonical, value);
    }
    evidence.canonical = canonical;
  }
  return { accounts, records, magnitude, raw, sign, mapped, unmapped, unresolved, issues, reconciliation };
}
