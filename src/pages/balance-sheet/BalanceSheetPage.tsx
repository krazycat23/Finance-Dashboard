import { useMemo } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section } from "@/components/layout/Section";
import { KpiRail } from "@/components/finance/KpiRail";
import { RatioList, type RatioItem } from "@/components/finance/RatioList";
import { CompositionChart, type CompositionSlice } from "@/components/charts/CompositionChart";
import { StatementTable } from "@/components/tables/StatementTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { StatementLine, StatementRow } from "@/domain/models";
import {
  periodsForBasis, selectBalanceSheet, selectInsights, selectKpis, selectLeverage,
  selectWorkingCapitalDays,
} from "@/domain/selectors";
import { formatCurrency, formatDays, formatMetric } from "@/utils/format";

/**
 * BALANCE SHEET — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The structural page, composed as a position statement rather than as a
 * chapter of the pack:
 *
 *   masthead    the title, a full-weight standfirst, the commentary beside it
 *   rail        five capital measures, divided by whitespace not rules
 *   statement   full measure, against the prior close, with banded results
 *   foot        asset mix | funding mix | liquidity, in three ruled columns
 *
 * No section numerals: a balance sheet is one statement with its supporting
 * analysis, not a sequence of findings. Working-capital days come from the
 * same selector the Cash Flow page calls — DSO appearing as two different
 * numbers on two pages is the fastest way to lose a CFO's trust.
 */

/**
 * The capital measures. Total assets is a canonical line the aggregation
 * already derives; the registry names it so the rail can present it.
 *
 * Gearing is a pure balance ratio — net debt over net debt plus equity, both
 * closing positions — so it resolves in a single window like any other metric.
 * The ratios that mix a balance with a flow do not, and are read from the
 * leverage selector at the foot of the page instead.
 */
const BALANCE_KPIS = ["totalAssets", "netAssets", "netDebt", "workingCapital", "gearing"];

/** The liquidity measures the registry defines, for the foot of the page. */
const LIQUIDITY_METRICS = ["workingCapital", "netDebt", "currentRatio", "quickRatio", "cashRatio"];

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
  const liquidity = useMemo(() => selectKpis(LIQUIDITY_METRICS, selection), [selection]);
  const rows = useMemo(() => selectBalanceSheet(selection), [selection]);
  const days = useMemo(() => selectWorkingCapitalDays(selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "cash"), [selection]);
  const leverage = useMemo(() => selectLeverage(selection), [selection]);

  // The comparative column is the prior CLOSE, so it must be labelled with that
  // month rather than inheriting the reporting month's caption.
  const priorClose = useMemo(() => {
    const closed = periodsForBasis("R12", selection.periodId).filter((period) => period.isActual);
    return closed[closed.length - 2];
  }, [selection]);
  const priorLabel = priorClose ? priorClose.label : "Prior period";

  const assets = useMemo(() => composition(rows, ASSET_LINES), [rows]);
  const funding = useMemo(() => composition(rows, FUNDING_LINES), [rows]);

  const liquidityItems = useMemo<RatioItem[]>(
    () =>
      liquidity.map((datum) => ({
        id: datum.metric.id,
        label: datum.metric.name,
        display: formatMetric(datum.value, datum.metric),
        variance: datum.variance,
        varianceDisplay: datum.variance
          ? formatMetric(datum.variance.absolute, datum.metric)
          : undefined,
        comparisonLabel: datum.comparisonLabel,
      })),
    [liquidity],
  );

  /**
   * The leverage ratios. Each is undefined rather than zero where it cannot be
   * stated — net cash has no debt multiple, and a company paying no interest
   * has no cover — so the list simply omits it instead of asserting a figure.
   */
  const leverageItems = useMemo<RatioItem[]>(() => {
    const build = (
      metricId: string,
      value: number | undefined,
      prior: number | undefined,
    ): RatioItem | undefined => {
      if (value === undefined) return undefined;
      const metric = getMetric(metricId);
      const variance = calculateVariance(value, prior, metric);
      return {
        id: metricId,
        label: metric.name,
        display: formatMetric(value, metric),
        variance,
        varianceDisplay: variance ? formatMetric(variance.absolute, metric) : undefined,
        comparisonLabel: "vs LY",
      };
    };
    return [
      build("netDebtToEbitda", leverage.netDebtToEbitda, leverage.priorYear.netDebtToEbitda),
      build("interestCover", leverage.interestCover, leverage.priorYear.interestCover),
      build("gearing", leverage.gearing, leverage.priorYear.gearing),
    ].filter((item): item is RatioItem => item !== undefined);
  }, [leverage]);

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

  return (
    <>
      <Masthead
        eyebrow="Financial position"
        title="Balance Sheet"
        titleClassName="max-w-[12ch]"
        standfirst="A solid foundation for sustainable growth."
        standfirstScale="lg"
        plateOrientation="landscape"
        commentary={insights[0]?.text}
        commentaryLabel={null}
        context={[
          { label: "As at", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Fiscal", value: `${currentPeriod.fiscalYear} · P${currentPeriod.fiscalPeriod}` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-8">
        <KpiRail data={kpis} comparisonCaption={`vs. ${priorLabel}`} />
      </div>

      {/* THE STATEMENT — against the prior close, which is the comparison a
          position is actually read against. Results carry a quiet tonal band
          because the statement nests four of them. */}
      <div className="mt-9">
        <Section
          title="Consolidated balance sheet"
          meta={`$'000 · as at ${currentPeriod.label}`}
        >
          <StatementTable
            rows={rows}
            actualLabel={`As at ${currentPeriod.label}`}
            priorYearLabel={`As at ${priorLabel}`}
            columnSet="priorOnly"
            varianceLabel="Movement"
            totalTreatment="band"
            scale="thousands"
          />
        </Section>
      </div>

      {/* THE FOOT — three columns on one rule: what the assets are, what funds
          them, and what that leaves in liquidity terms. */}
      <div className="mt-10 border-t border-strong pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 [&>*:not(:first-child)]:lg:border-l [&>*:not(:first-child)]:lg:border-subtle [&>*:not(:first-child)]:lg:pl-10">
          <CompositionBlock
            title="Asset composition"
            caption="% of total assets"
            slices={assets.slices}
            centreValue={formatCurrency(assets.total)}
            centreLabel="Total assets"
          />

          <CompositionBlock
            title="Liabilities & equity mix"
            caption="% of total capital"
            slices={funding.slices}
            centreValue={formatCurrency(funding.total)}
            centreLabel="Total capital"
          />

          <div className="min-w-0">
            <h2 className="type-section text-[16px]">Working capital &amp; liquidity</h2>
            <p className="eyebrow mt-1.5">As reported</p>
            <div className="mt-4">
              <RatioList items={liquidityItems} />
            </div>
            <div className="mt-5 pt-4 border-t border-subtle">
              <p className="eyebrow">Working capital days</p>
              <div className="mt-2">
                <RatioList items={dayItems} />
              </div>
            </div>
            {leverage.available && (
              <div className="mt-5 pt-4 border-t border-subtle">
                <p className="eyebrow">Leverage</p>
                <div className="mt-2">
                  <RatioList items={leverageItems} />
                </div>
                <p className="type-caption mt-3 leading-relaxed">
                  Net debt is the position at {currentPeriod.label}; EBITDA and
                  EBIT are the twelve months ending there. Measuring a closing
                  balance against part of a year would flatter both.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** A donut and its legend, under a heading and a small-caps caption. */
function CompositionBlock({
  title, caption, slices, centreValue, centreLabel,
}: {
  title: string;
  caption: string;
  slices: CompositionSlice[];
  centreValue: string;
  centreLabel: string;
}) {
  return (
    <div className="min-w-0">
      <h2 className="type-section text-[16px]">{title}</h2>
      <p className="eyebrow mt-1.5">{caption}</p>
      <div className="mt-4">
        {slices.length > 0 ? (
          <CompositionChart
            slices={slices}
            mode="sequential"
            surface="canvas"
            layout="stacked"
            height={190}
            centreValue={centreValue}
            centreLabel={centreLabel}
          />
        ) : (
          <p className="type-body">No balances are reported for this selection.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Ranked carrying values for a set of statement lines, read off the statement
 * the page is already showing. Absolute values are used so a line the statement
 * prints as a deduction still ranks by its size; lines the dataset does not
 * report are dropped rather than shown as zero.
 */
function composition(statement: StatementRow[], keys: StatementLine[]): {
  slices: CompositionSlice[];
  total: number;
} {
  const wanted = new Set<StatementLine>(keys);
  const rows = statement
    .filter((row) => !row.isSection && wanted.has(row.line))
    .map((row) => ({ id: row.line as string, label: row.label, value: Math.abs(row.actual) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return {
    slices: rows.map((row) => ({ ...row, comparison: undefined })),
    total,
  };
}
