import type { IngestionReconciliation } from "../types";

/** Keeps stage values explicit so later stages never need to reconstruct raw totals. */
export class ReconciliationAccumulator {
  private readonly totals = new Map<string, number>();
  add(stage: string, value: number) { this.totals.set(stage, (this.totals.get(stage) ?? 0) + value); }
  total(stage: string) { return this.totals.get(stage) ?? 0; }
  compare(id: string, label: string, sourceStage: string, targetStage: string, stage: IngestionReconciliation["stage"]): IngestionReconciliation {
    const sourceTotal=this.total(sourceStage), targetTotal=this.total(targetStage), difference=sourceTotal-targetTotal;
    return { id, label, sourceTotal, targetTotal, difference, tolerance:.01, status:Math.abs(difference)<.01?"Reconciled":"Exception", stage };
  }
}
