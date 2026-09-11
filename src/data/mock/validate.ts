import type { FinancialMonth } from "./finance";

/**
 * CONSISTENCY ASSERTIONS
 * ---------------------------------------------------------------------------
 * Runs once at module load in development. Its purpose is to make the class of
 * bug that destroys credibility in a finance product — a balance sheet that
 * does not balance, a cash flow that does not tie to the cash balance, a gross
 * profit that is not revenue less cost of sales — impossible to ship silently.
 *
 * These are the same checks a reviewer would run by hand on the first screen.
 */

export interface ConsistencyIssue {
  check: string;
  entityId: string;
  periodId: string;
  detail: string;
}

/** Tolerance for floating-point accumulation, in currency units. */
const TOLERANCE = 1;

export function validateFinancials(months: FinancialMonth[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const add = (check: string, m: FinancialMonth, detail: string) =>
    issues.push({ check, entityId: m.entityId, periodId: m.periodId, detail });

  // Cash roll-forward needs the prior month per entity.
  const byEntity = new Map<string, FinancialMonth[]>();
  for (const m of months) {
    const list = byEntity.get(m.entityId);
    if (list) list.push(m);
    else byEntity.set(m.entityId, [m]);
  }

  for (const m of months) {
    // 1. Gross profit identity
    if (Math.abs(m.grossProfit - (m.revenue - m.costOfSales)) > TOLERANCE) {
      add("grossProfit", m, `GP ${m.grossProfit} != revenue - COGS`);
    }

    // 2. EBITDA identity
    if (Math.abs(m.ebitda - (m.grossProfit - m.operatingCosts)) > TOLERANCE) {
      add("ebitda", m, `EBITDA ${m.ebitda} != GP - opex`);
    }

    // 3. EBIT and net profit
    if (Math.abs(m.ebit - (m.ebitda - m.depreciationAmortisation)) > TOLERANCE) {
      add("ebit", m, "EBIT != EBITDA - D&A");
    }
    if (Math.abs(m.netProfit - (m.ebit - m.interest - m.tax)) > TOLERANCE) {
      add("netProfit", m, "Net profit != EBIT - interest - tax");
    }

    // 4. Operating cost categories sum to the line total
    const categorySum = Object.values(m.operatingCostsByCategory).reduce((a, b) => a + b, 0);
    if (Math.abs(categorySum - m.operatingCosts) > TOLERANCE) {
      add("opexComposition", m, "Cost categories do not sum to operating costs");
    }

    // 5. Cash flow components sum to the net movement
    const movement = m.operatingCashFlow + m.investingCashFlow + m.financingCashFlow;
    if (Math.abs(movement - m.netCashMovement) > TOLERANCE) {
      add("cashFlowBridge", m, "OCF + ICF + FCF != net cash movement");
    }

    // 6. Balance sheet balances
    const assets =
      m.cash + m.tradeReceivables + m.inventory + m.otherCurrentAssets +
      m.propertyPlantEquipment + m.intangibleAssets + m.rightOfUseAssets +
      m.otherNonCurrentAssets;
    const liabilitiesAndEquity =
      m.tradePayables + m.borrowingsCurrent + m.leaseLiabilitiesCurrent +
      m.otherCurrentLiabilities + m.borrowingsNonCurrent +
      m.leaseLiabilitiesNonCurrent + m.otherNonCurrentLiabilities +
      m.shareCapital + m.retainedEarnings;
    if (Math.abs(assets - liabilitiesAndEquity) > TOLERANCE) {
      add("balanceSheet", m, `Assets ${assets.toFixed(0)} != L+E ${liabilitiesAndEquity.toFixed(0)}`);
    }
  }

  // 7. Closing cash equals opening cash plus the net movement
  for (const [entityId, list] of byEntity) {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      const expected = prev.cash + curr.netCashMovement;
      if (Math.abs(curr.cash - expected) > TOLERANCE) {
        issues.push({
          check: "cashRollForward",
          entityId,
          periodId: curr.periodId,
          detail: `Cash ${curr.cash.toFixed(0)} != prior ${prev.cash.toFixed(0)} + movement ${curr.netCashMovement.toFixed(0)}`,
        });
      }
    }
  }

  return issues;
}

/**
 * The residual absorbed into other non-current liabilities keeps the balance
 * sheet balanced by construction, so check separately that it stays a
 * plausible size rather than hiding a modelling error.
 */
export function validateResidual(months: FinancialMonth[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  for (const m of months) {
    const assets =
      m.cash + m.tradeReceivables + m.inventory + m.otherCurrentAssets +
      m.propertyPlantEquipment + m.intangibleAssets + m.rightOfUseAssets +
      m.otherNonCurrentAssets;
    const ratio = Math.abs(m.otherNonCurrentLiabilities) / assets;
    if (ratio > 0.2) {
      issues.push({
        check: "residualSize",
        entityId: m.entityId,
        periodId: m.periodId,
        detail: `Balancing residual is ${(ratio * 100).toFixed(1)}% of total assets`,
      });
    }
  }
  return issues;
}
