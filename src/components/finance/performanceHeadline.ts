import type { KpiDatum } from "@/domain/selectors/kpi";

/**
 * PERFORMANCE HEADLINE
 * ---------------------------------------------------------------------------
 * The editorial lead on the Overview page.
 *
 * This is presentation, not analysis: it states, in words, exactly what the
 * KPI band already states in figures — the sentiment the variance selectors
 * computed, for the metrics that carry a comparative. It invents nothing. If a
 * metric has no comparative, it is not mentioned; if none of them do, there is
 * no headline and the page shows the reporting context instead.
 *
 * Phrasing stays factual ("ahead of", "behind", "level with"). It never
 * characterises a quarter, forecasts an outcome, or supplies a cause.
 */

const AHEAD: Record<string, string> = {
  positive: "ahead of",
  negative: "behind",
  neutral: "level with",
};

/**
 * Column headings read as prose. "vs LY" is a heading; "last year" is a
 * clause, and the headline is a sentence.
 */
const COMPARISON_PROSE: Record<string, string> = {
  ly: "last year",
  budget: "plan",
  plan: "plan",
  forecast: "forecast",
};

function comparison(label: string): string {
  const bare = label.replace(/^vs\s+/i, "").trim();
  return COMPARISON_PROSE[bare.toLowerCase()] ?? bare.toLowerCase();
}

function metricName(datum: KpiDatum): string {
  return datum.metric.shortName ?? datum.metric.name;
}

export interface PerformanceHeadline {
  /** Sentence-cased statement, or undefined when nothing is comparable. */
  text?: string;
}

/**
 * Builds the headline from up to two metrics: the lead figure and the first
 * profit measure that carries a comparative.
 */
export function buildPerformanceHeadline(
  data: KpiDatum[],
  profitMetricIds: string[] = ["ebitda", "netProfit", "grossProfit"],
): PerformanceHeadline {
  const lead = data.find((datum) => datum.variance);
  if (!lead) return {};

  const profit = data.find(
    (datum) =>
      datum.metric.id !== lead.metric.id &&
      datum.variance &&
      profitMetricIds.includes(datum.metric.id),
  );

  const leadComparison = comparison(lead.comparisonLabel);

  // Two metrics that moved the same way against the same comparison read as
  // one statement, not as two near-identical clauses.
  if (
    profit?.variance &&
    profit.variance.sentiment === lead.variance!.sentiment &&
    comparison(profit.comparisonLabel) === leadComparison
  ) {
    return {
      text: `${metricName(lead)} and ${metricName(profit)} both ${AHEAD[lead.variance!.sentiment]} ${leadComparison}.`,
    };
  }

  const clauses = [
    `${metricName(lead)} ${AHEAD[lead.variance!.sentiment]} ${leadComparison}`,
    ...(profit?.variance
      ? [`${metricName(profit)} ${AHEAD[profit.variance.sentiment]} ${comparison(profit.comparisonLabel)}`]
      : []),
  ];
  return { text: `${clauses.join("; ")}.` };
}
