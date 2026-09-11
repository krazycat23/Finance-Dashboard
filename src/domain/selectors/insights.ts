import { formatCurrency, formatPercentage, formatBasisPoints } from "@/utils/format";
import type { PeriodSelection } from "@/domain/models";
import type { Sentiment } from "@/domain/metrics/variance";
import { selectComparableBudget, selectLines } from "./core";
import { selectCashFlow } from "./cashflow";
import { selectBreakdown, selectPriorYearSalesTotals, selectSalesTotals } from "./sales";

/**
 * INSIGHT GENERATION
 * ---------------------------------------------------------------------------
 * Rule-based commentary derived from the same selectors the charts use, so an
 * insight can never state something the tables contradict.
 *
 * This is deliberately the seam where automated management commentary will
 * attach in a later phase: the rules below produce a structured finding
 * (subject, movement, driver, sentiment) and only then render it to prose.
 */

export interface Insight {
  id: string;
  text: string;
  sentiment: Sentiment;
}

/**
 * Which findings matter on which page. The same rule set runs everywhere; the
 * focus decides the order, so the Sales page leads with trading and the P&L
 * page leads with margin and cost.
 */
export type InsightFocus = "executive" | "sales" | "profitability" | "cash";

const FOCUS_ORDER: Record<InsightFocus, string[]> = {
  executive: ["revenue", "margin", "channel", "opex", "cash", "lfl", "region"],
  sales: ["revenue", "lfl", "channel", "region", "margin", "opex", "cash"],
  profitability: ["margin", "opex", "revenue", "channel", "cash", "lfl", "region"],
  cash: ["cash", "revenue", "opex", "margin", "channel", "lfl", "region"],
};

export function selectInsights(
  selection: PeriodSelection,
  focus: InsightFocus = "executive",
): Insight[] {
  const lines = selectLines(selection);
  const budget = selectComparableBudget(selection);
  const sales = selectSalesTotals(selection);
  const priorSales = selectPriorYearSalesTotals(selection);
  const cash = selectCashFlow(selection);
  const channels = selectBreakdown(selection, "channelId");
  const regions = selectBreakdown(selection, "locationId");

  const insights: Insight[] = [];
  const push = (id: string, text: string, sentiment: Sentiment) =>
    insights.push({ id, text, sentiment });

  // 1. Revenue against prior year and plan.
  const revenue = lines.actual.revenue ?? 0;
  const revenuePrior = lines.priorYear.revenue ?? 0;
  const revenueBudget = budget.revenue ?? 0;
  if (revenuePrior > 0) {
    const growth = revenue / revenuePrior - 1;
    const toPlan = revenueBudget > 0 ? revenue / revenueBudget - 1 : 0;
    push(
      "revenue",
      `Revenue of ${formatCurrency(revenue)} is ${formatPercentage(Math.abs(growth))} ${growth >= 0 ? "ahead of" : "behind"} last year and ${formatPercentage(Math.abs(toPlan))} ${toPlan >= 0 ? "ahead of" : "behind"} plan.`,
      growth >= 0 && toPlan >= 0 ? "positive" : growth >= 0 ? "neutral" : "negative",
    );
  }

  // 2. Gross margin rate movement, expressed in basis points.
  const marginNow = revenue ? (lines.actual.grossProfit ?? 0) / revenue : 0;
  const marginPrior = revenuePrior ? (lines.priorYear.grossProfit ?? 0) / revenuePrior : 0;
  if (marginPrior > 0) {
    const move = marginNow - marginPrior;
    push(
      "margin",
      `Gross margin of ${formatPercentage(marginNow)} is ${formatBasisPoints(Math.abs(move))} ${move >= 0 ? "above" : "below"} last year, ${move >= 0 ? "helped by" : "held back by"} channel mix and realised price.`,
      move >= 0 ? "positive" : "negative",
    );
  }

  // 3. The strongest growing channel.
  const bestChannel = channels
    .filter((c) => c.growth !== undefined)
    .sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0))[0];
  if (bestChannel) {
    push(
      "channel",
      `${bestChannel.name} grew ${formatPercentage(bestChannel.growth ?? 0)} year on year and now represents ${formatPercentage(bestChannel.share)} of sales.`,
      (bestChannel.growth ?? 0) >= 0 ? "positive" : "negative",
    );
  }

  // 4. Operating cost discipline against plan — reported as adverse when over.
  const opex = lines.actual.operatingCosts ?? 0;
  const opexBudget = budget.operatingCosts ?? 0;
  if (opexBudget > 0) {
    const over = opex - opexBudget;
    push(
      "opex",
      `Operating costs of ${formatCurrency(opex)} are ${formatCurrency(Math.abs(over))} ${over > 0 ? "above" : "below"} plan, ${formatPercentage(Math.abs(over / opexBudget))} ${over > 0 ? "adverse" : "favourable"}.`,
      over > 0 ? "negative" : "positive",
    );
  }

  // 5. Cash generation.
  push(
    "cash",
    `Operating cash flow of ${formatCurrency(cash.operatingCashFlow)} converted ${formatPercentage(cash.ebitda ? cash.operatingCashFlow / cash.ebitda : 0)} of EBITDA, closing with ${formatCurrency(cash.closingCash)} on hand.`,
    cash.ebitda > 0 && cash.operatingCashFlow / cash.ebitda > 0.7 ? "positive" : "neutral",
  );

  // 6. Weakest region, so the page is not uniformly good news.
  const worstRegion = regions
    .filter((r) => r.growth !== undefined)
    .sort((a, b) => (a.growth ?? 0) - (b.growth ?? 0))[0];
  if (worstRegion && (worstRegion.growth ?? 0) < (bestChannel?.growth ?? 0)) {
    push(
      "region",
      `${worstRegion.name} is the weakest region at ${formatPercentage(worstRegion.growth ?? 0)} year on year, ${formatPercentage(worstRegion.share)} of group sales.`,
      (worstRegion.growth ?? 0) < 0 ? "negative" : "neutral",
    );
  }

  // 7. Like-for-like, where a comparative base exists.
  if (priorSales.likeForLike > 0 && sales.likeForLikePriorYear > 0) {
    const lfl = sales.likeForLike / sales.likeForLikePriorYear - 1;
    push(
      "lfl",
      `Like-for-like sales are ${formatPercentage(lfl)} against last year across comparable locations.`,
      lfl >= 0 ? "positive" : "negative",
    );
  }

  const order = FOCUS_ORDER[focus];
  const ranked = [...insights].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  return ranked.slice(0, 5);
}
