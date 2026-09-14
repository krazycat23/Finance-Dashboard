import { useMemo } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow, StatementBand } from "@/components/layout/Section";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { NumberedInsightList } from "@/components/finance/InsightList";
import { RatioList, type RatioItem } from "@/components/finance/RatioList";
import { StatementTable } from "@/components/tables/StatementTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { StatementLine, StatementRow } from "@/domain/models";
import {
  periodsForBasis, selectBalanceSheet, selectInsights, selectKpis,
  selectWorkingCapitalDays,
} from "@/domain/selectors";
import { formatCurrency, formatDays, formatMetric, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * BALANCE SHEET — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The structural page: what the business owns, what it owes, and what that
 * leaves. Working-capital days come from the same selector the Cash Flow page
 * calls — DSO appearing as two different numbers on two pages is the fastest
 * way for a finance product to lose a CFO's trust.
 *
 *   01          the statement, on its own leaf of paper
 *   02 | 03     what the assets are, and what funds them
 *   04 | 05     working capital days against liquidity and leverage
 *   06          commentary
 */

/**
 * Capital measures the registry defines AND a resolver supports. Total assets
 * and gearing are not registered metrics, so they are not shown as headline
 * figures — total assets still appears in the statement below, where the
 * statement spec names it.
 */
const BALANCE_KPIS = ["netAssets", "workingCapital", "netDebt", "cash"];

/** Liquidity and leverage ratios, all registry metrics. */
const RATIO_METRICS = ["currentRatio", "quickRatio", "cashRatio", "netDebtToEbitda"];

/**
 * The composition rows are statement lines. Their labels come from the
 * statement spec's own rows — not from the metric registry, which does not
 * define most balance sheet lines and would name none of them.
 */
const ASSET_LINES: StatementLine[] = [
  "cash", "tradeReceivables", "inventory", "otherCurrentAssets",
  "propertyPlantEquipment", "intangibleAssets", "rightOfUseAssets",
  "otherNonCurrentAssets",
];

const FUNDING_LINES: StatementLine[] = [
  "tradePayables", "borrowingsCurrent", "borrowingsNonCurrent",
  "leaseLiabilitiesCurrent", "leaseLiabilitiesNonCurrent",
  "otherCurrentLiabilities", "otherNonCurrentLiabilities",
  "shareCapital", "retainedEarnings",
];

export function BalanceSheetPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();

  const kpis = useMemo(() => selectKpis(BALANCE_KPIS, selection), [selection]);
  const ratios = useMemo(() => selectKpis(RATIO_METRICS, selection), [selection]);
  const rows = useMemo(() => selectBalanceSheet(selection), [selection]);
  const days = useMemo(() => selectWorkingCapitalDays(selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "cash"), [selection]);

  // The comparative column is the prior CLOSE, so it must be labelled with that
  // month rather than inheriting the reporting month's caption.
  const priorMonthLabel = useMemo(() => {
    const closed = periodsForBasis("R12", selection.periodId).filter((period) => period.isActual);
    const previous = closed[closed.length - 2];
    return previous ? `As at ${previous.label}` : "Prior period";
  }, [selection]);

  /**
   * Which comparatives the model actually reports for this statement. A column
   * of dashes is worse than no column, and a comparison the dataset does not
   * carry must not be forced onto the page.
   */
  const columnSet = useMemo(() => {
    const detail = rows.filter((row) => !row.isSection);
    const hasBudget = detail.some((row) => row.budget !== undefined);
    const hasPriorYear = detail.some((row) => row.priorYear !== undefined);
    if (hasBudget && hasPriorYear) return "full" as const;
    if (hasBudget) return "budgetOnly" as const;
    return "compact" as const;
  }, [rows]);

  const assets = useMemo(() => composition(rows, ASSET_LINES), [rows]);
  const funding = useMemo(() => composition(rows, FUNDING_LINES), [rows]);

  const dayItems = useMemo<RatioItem[]>(() => {
    const build = (id: string, metricId: string, value: number, prior: number): RatioItem => {
      const metric = getMetric(metricId);
      const variance = calculateVariance(value, prior, metric);
      return {
        id,
        label: metric.name,
        display: formatMetric(value, metric),
        variance,
        varianceDisplay: variance
          ? formatDays(variance.absolute, { showSign: true, parentheses: false })
          : undefined,
        comparisonLabel: "vs LY",
      };
    };
    return [
      build("dso", "dso", days.dso, days.priorYear.dso),
      build("dio", "dio", days.dio, days.priorYear.dio),
      build("dpo", "dpo", days.dpo, days.priorYear.dpo),
      build("ccc", "cashConversionCycle", days.cashConversionCycle, days.priorYear.cashConversionCycle),
    ];
  }, [days]);

  const ratioItems = useMemo<RatioItem[]>(
    () =>
      ratios.map((datum) => ({
        id: datum.metric.id,
        label: datum.metric.name,
        display: formatMetric(datum.value, datum.metric),
        variance: datum.variance,
        varianceDisplay: datum.variance
          ? formatMetric(datum.variance.absolute, datum.metric)
          : undefined,
        comparisonLabel: datum.comparisonLabel,
      })),
    [ratios],
  );

  return (
    <>
      <Masthead
        eyebrow="Financial position"
        titleClassName="max-w-[16ch]"
        title="Balance Sheet"
        standfirst="What the business owns, owes and is worth."
        lede={`${dataset.profile.companyName} · as at ${currentPeriod.label}. Reported against the prior close; the statement balances, and the verification suite checks that it does.`}
        commentary={insights[0]?.text}
        context={[
          { label: "As at", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Fiscal", value: `${currentPeriod.fiscalYear} · P${currentPeriod.fiscalPeriod}` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {/* 01 — the statement ------------------------------------------------- */}
        <StatementBand>
          <Section
            flushTop
            number="01"
            title="Balance sheet"
            meta={`$'000 · as at ${currentPeriod.label}`}
            description="Assets, liabilities and equity. Comparative columns appear only where the model reports them. Liabilities print as deductions; a favourable movement is positive on every line."
          >
            <StatementTable
              rows={rows}
              actualLabel={`As at ${currentPeriod.label}`}
              priorYearLabel={priorMonthLabel}
              budgetLabel="Budget"
              columnSet={columnSet}
              varianceLabel="Movement"
              scale="thousands"
            />
          </Section>
        </StatementBand>

        {/* 02 | 03 — what the assets are, and what funds them ------------------ */}
        <SectionRow split="50/50">
          <Section
            flushTop
            number="02"
            title="Asset composition"
            meta={formatCurrency(assets.total)}
            description="Reported asset lines, ranked by carrying value."
          >
            <CompositionList rows={assets.rows} total={assets.total} />
          </Section>

          <Section
            flushTop
            number="03"
            title="Liabilities and equity"
            meta={formatCurrency(funding.total)}
            description="What funds those assets, ranked by size. Liabilities are shown at their carrying value, not as deductions."
          >
            <CompositionList rows={funding.rows} total={funding.total} />
          </Section>
        </SectionRow>

        {/* 04 | 05 — working capital, liquidity and leverage -------------------- */}
        <SectionRow split="60/40">
          <Section
            flushTop
            number="04"
            title="Working capital days"
            meta="Trailing twelve-month flows"
            description="Computed on trailing flows against the closing balance — the convention that survives a seasonal business — and by the same selector the Cash Flow page uses."
          >
            <RatioList items={dayItems} />
          </Section>

          <Section
            flushTop
            number="05"
            title="Liquidity and leverage"
            meta="Registry ratios"
          >
            <RatioList items={ratioItems} />
          </Section>
        </SectionRow>

        {/* 06 — commentary ------------------------------------------------------ */}
        <Section
          number="06"
          title="Balance sheet commentary"
          meta="Derived from reported results"
        >
          <div className="max-w-[110ch]">
            {insights.length > 0 ? (
              <NumberedInsightList insights={insights} />
            ) : (
              <p className="type-body">No movements of note in the reported position.</p>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

interface CompositionRow {
  id: StatementLine;
  label: string;
  value: number;
}

/**
 * Ranked carrying values for a set of statement lines, read off the statement
 * the page is already showing. Absolute values are used so a line the statement
 * prints as a deduction still ranks by its size; lines the dataset does not
 * report are dropped rather than shown as zero.
 */
function composition(statement: StatementRow[], keys: StatementLine[]): {
  rows: CompositionRow[];
  total: number;
} {
  const wanted = new Set<StatementLine>(keys);
  const rows = statement
    .filter((row) => !row.isSection && wanted.has(row.line))
    .map((row) => ({ id: row.line, label: row.label, value: Math.abs(row.actual) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  return { rows, total: rows.reduce((sum, row) => sum + row.value, 0) };
}

/** Ranked bars: a balance sheet is read as an ordered list of what is there. */
function CompositionList({ rows, total }: { rows: CompositionRow[]; total: number }) {
  if (rows.length === 0) {
    return <p className="type-body">No balances are reported for this selection.</p>;
  }
  const max = Math.max(...rows.map((row) => row.value), 0);

  return (
    <ul className="flex flex-col">
      {rows.map((row, index) => (
        <li key={row.id} className="py-3 border-b border-subtle last:border-b-0 first:pt-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="flex items-baseline gap-3 min-w-0">
              <span aria-hidden className="type-section-number w-[14px] shrink-0">{index + 1}</span>
              <span
                className={cn(
                  "truncate text-primary",
                  index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
                )}
              >
                {row.label}
              </span>
            </span>
            <span className="flex items-baseline gap-5 shrink-0 tnum">
              <span className="type-caption w-[46px] text-right">
                {total === 0 ? "—" : formatPercentage(row.value / total)}
              </span>
              <span
                className={cn(
                  "text-right w-[72px] text-primary",
                  index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
                )}
              >
                {formatCurrency(row.value)}
              </span>
            </span>
          </div>
          <Meter value={row.value} max={max} className={cn("mt-2.5", index > 0 && "opacity-75")} />
        </li>
      ))}
    </ul>
  );
}
