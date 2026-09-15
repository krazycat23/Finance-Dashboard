import type { PeriodSelection } from "@/domain/models";
import { aggregateLines, periodsForBasis, resolveEntityIds, selectLines } from "./core";

/**
 * LEVERAGE
 * ---------------------------------------------------------------------------
 * The ratios that mix a balance with a flow, which is why they cannot be
 * ordinary metric resolvers: net debt is a position at the close, EBITDA and
 * EBIT are twelve months of trading. Resolving either from a single reporting
 * window would divide a closing balance by nine months of profit and report
 * the answer as though it meant something.
 *
 * So both sides are taken from the window each belongs to — the balance at the
 * reporting date, the flows over the twelve months ending there — and the
 * prior-year figures are built the same way one year earlier.
 */
export interface Leverage {
  netDebt: number;
  equity: number;
  /** Twelve months of trading ending at the reporting date. */
  ltmEbitda: number;
  ltmEbit: number;
  ltmInterest: number;
  gearing?: number;
  netDebtToEbitda?: number;
  interestCover?: number;
  priorYear: {
    netDebt: number;
    gearing?: number;
    netDebtToEbitda?: number;
    interestCover?: number;
  };
  /** False where the ledger carries no borrowings at all. */
  available: boolean;
}

interface Position {
  netDebt: number;
  equity: number;
  ltmEbitda: number;
  ltmEbit: number;
  ltmInterest: number;
}

function positionAt(periodId: string, entityIds: string[]): Position {
  const closing = aggregateLines([periodId], entityIds, "actual");
  const ltmIds = periodsForBasis("R12", periodId)
    .filter((p) => p.isActual)
    .map((p) => p.id);
  const ltm = aggregateLines(ltmIds, entityIds, "actual");

  return {
    netDebt:
      (closing.borrowingsCurrent ?? 0) + (closing.borrowingsNonCurrent ?? 0) +
      (closing.leaseLiabilitiesCurrent ?? 0) + (closing.leaseLiabilitiesNonCurrent ?? 0) -
      (closing.cash ?? 0),
    equity: closing.totalEquity ?? 0,
    ltmEbitda: ltm.ebitda ?? 0,
    ltmEbit: ltm.ebit ?? 0,
    ltmInterest: ltm.interest ?? 0,
  };
}

function gearingOf(position: Position): number | undefined {
  const capital = position.netDebt + position.equity;
  return capital > 0 ? position.netDebt / capital : undefined;
}

/**
 * A company with net cash has no leverage to report, and dividing a negative
 * net debt by EBITDA produces a negative multiple that reads as a covenant
 * breach rather than as a strong balance sheet. Both are left undefined, and
 * the page states the position instead.
 */
function netDebtToEbitdaOf(position: Position): number | undefined {
  if (position.ltmEbitda <= 0 || position.netDebt <= 0) return undefined;
  return position.netDebt / position.ltmEbitda;
}

function interestCoverOf(position: Position): number | undefined {
  if (position.ltmInterest <= 0) return undefined;
  return position.ltmEbit / position.ltmInterest;
}

export function selectLeverage(selection: PeriodSelection): Leverage {
  const entityIds = resolveEntityIds(selection.entityId);
  const closed = periodsForBasis(selection.basis, selection.periodId).filter((p) => p.isActual);
  const closeId = closed.at(-1)?.id ?? selection.periodId;

  const [year, month] = closeId.split("-").map(Number);
  const priorCloseId = `${year - 1}-${String(month).padStart(2, "0")}`;

  const current = positionAt(closeId, entityIds);
  const prior = positionAt(priorCloseId, entityIds);

  const lines = selectLines(selection).actual;
  const available =
    (lines.borrowingsCurrent ?? 0) + (lines.borrowingsNonCurrent ?? 0) +
    (lines.leaseLiabilitiesCurrent ?? 0) + (lines.leaseLiabilitiesNonCurrent ?? 0) > 0;

  return {
    netDebt: current.netDebt,
    equity: current.equity,
    ltmEbitda: current.ltmEbitda,
    ltmEbit: current.ltmEbit,
    ltmInterest: current.ltmInterest,
    gearing: gearingOf(current),
    netDebtToEbitda: netDebtToEbitdaOf(current),
    interestCover: interestCoverOf(current),
    priorYear: {
      netDebt: prior.netDebt,
      gearing: gearingOf(prior),
      netDebtToEbitda: netDebtToEbitdaOf(prior),
      interestCover: interestCoverOf(prior),
    },
    available,
  };
}
