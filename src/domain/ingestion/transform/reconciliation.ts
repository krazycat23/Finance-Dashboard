import type { IngestionReconciliation, ReconciliationStatus } from "../types";

/** Default monetary tolerance: one cent in source/canonical currency. */
export const DEFAULT_MONETARY_TOLERANCE = 0.01;
export type FinanceStage = "raw" | "prepared" | "unpivot" | "sign" | "mapped" | "unmapped" | "canonical";
export interface StageEvidence { rows: number; total: number; magnitude: number; }
export interface FinanceDatasetEvidence {
  datasetId: string; sourceFileId: string; sourceSheet?: string; scenarioId: string;
  periods: Set<string>; raw: StageEvidence; prepared: StageEvidence; unpivot?: StageEvidence;
  sign: StageEvidence & { adjustment: number; expected: number };
  mapped: StageEvidence; unmapped: StageEvidence; canonical?: StageEvidence;
}

/** Stages are recorded where their values exist; they are never reconstructed
 * from a later transformed collection. */
export class ReconciliationAccumulator {
  private readonly stages = new Map<FinanceStage, StageEvidence>();
  record(stage: FinanceStage, rows: number, total: number, magnitude: number): void { this.stages.set(stage, { rows, total, magnitude }); }
  add(stage: FinanceStage, value: number): void { const prior = this.stages.get(stage) ?? { rows: 0, total: 0, magnitude: 0 }; this.stages.set(stage, { rows: prior.rows + 1, total: prior.total + value, magnitude: prior.magnitude + Math.abs(value) }); }
  get(stage: FinanceStage): StageEvidence | undefined { return this.stages.get(stage); }
}

function compare(input: Omit<IngestionReconciliation, "difference" | "differencePercent" | "status"> & { expected?: number }): IngestionReconciliation {
  const expected = input.expected ?? input.sourceTotal;
  const difference = expected - input.targetTotal;
  const status: ReconciliationStatus = Math.abs(difference) <= input.tolerance ? "pass" : "fail";
  return { ...input, expectedTotal: expected, difference, differencePercent: expected ? difference / Math.abs(expected) : undefined, status };
}

export function buildFinanceReconciliations(evidence: FinanceDatasetEvidence[]): IngestionReconciliation[] {
  return evidence.flatMap(item => {
    const metadata = { datasetId: item.datasetId, sourceFileId: item.sourceFileId, sourceSheet: item.sourceSheet, scenarioId: item.scenarioId, periodScope: [...item.periods].sort(), tolerance: DEFAULT_MONETARY_TOLERANCE };
    const preparedStage = item.unpivot ?? item.prepared;
    const preparedLabel = item.unpivot ? "Raw selected source → post-unpivot" : "Raw selected source → prepared rows";
    const rows: IngestionReconciliation[] = [
      compare({ id: `${item.datasetId}:raw-prepared`, label: preparedLabel, sourceTotal: item.raw.total, targetTotal: preparedStage.total, sourceMagnitude: item.raw.magnitude, targetMagnitude: preparedStage.magnitude, sourceRowCount: item.raw.rows, targetRowCount: preparedStage.rows, stage: item.unpivot ? "unpivot" : "prepared", ...metadata }),
      compare({ id: `${item.datasetId}:sign`, label: "Sign normalisation (explained adjustment)", sourceTotal: item.prepared.total, targetTotal: item.sign.total, sourceMagnitude: item.prepared.magnitude, targetMagnitude: item.sign.magnitude, sourceRowCount: item.prepared.rows, targetRowCount: item.sign.rows, transformationAdjustment: item.sign.adjustment, expected: item.sign.expected, stage: "sign", ...metadata }),
      compare({ id: `${item.datasetId}:mapping`, label: "Sign-normalised source → mapped + unmapped", sourceTotal: item.sign.total, targetTotal: item.mapped.total + item.unmapped.total, sourceMagnitude: item.sign.magnitude, targetMagnitude: item.mapped.magnitude + item.unmapped.magnitude, sourceRowCount: item.sign.rows, targetRowCount: item.mapped.rows + item.unmapped.rows, stage: "mapped", ...metadata }),
    ];
    rows.push(item.canonical ? compare({ id: `${item.datasetId}:canonical`, label: "Mapped source → canonical facts", sourceTotal: item.mapped.total, targetTotal: item.canonical.total, sourceMagnitude: item.mapped.magnitude, targetMagnitude: item.canonical.magnitude, sourceRowCount: item.mapped.rows, targetRowCount: item.canonical.rows, stage: "canonical", ...metadata }) : { id: `${item.datasetId}:canonical`, label: "Mapped source → canonical facts", sourceTotal: item.mapped.total, targetTotal: 0, difference: 0, status: "unavailable", stage: "canonical", ...metadata });
    return rows;
  });
}
