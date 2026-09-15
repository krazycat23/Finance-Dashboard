import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { Section } from "@/components/layout/Section";
import { CoverBand } from "@/components/overview/CoverBand";
import { Meter } from "@/components/ui/Meter";
import { buildPerformanceHeadline } from "@/components/finance/performanceHeadline";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { StatementTable } from "@/components/tables/StatementTable";
import { numberedNavigation } from "@/config/navigation";
import {
  periodsForBasis, selectEbitdaBridge, selectFullYearOutlook, selectInsights,
  selectKpis, selectMetricSeries, selectProfitAndLoss, selectReportLibrary,
} from "@/domain/selectors";
import { reportingCapabilities, selectAvailable } from "@/domain/selectors/availability";
import type { KpiDatum } from "@/domain/selectors/kpi";
import type { Insight } from "@/domain/selectors/insights";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import { formatCurrency, formatMetric, formatMetricDelta, formatPercentage } from "@/utils/format";

/**
 * EXECUTIVE OVERVIEW — THE FRONT OF THE BOOK
 * ---------------------------------------------------------------------------
 * Every other page in this product is a working document: a statement, a
 * trading report, a reconciliation. This one is not, and had no business
 * looking like one. It is the cover and the contents — the two things a reader
 * meets before they have decided what to read.
 *
 *   cover      inverted, full-bleed, the headline standing on the shape of its
 *              own trailing year
 *   figures    three results, unruled, each hung on its own hairline
 *   outlook    where the full year is heading, on one line
 *   contents   every other page in the pack, each with a live reading of what
 *              it currently says — the index IS the navigation
 *   movements  what changed, set as statements rather than as a list
 *   bridge     the one exhibit the cover earns: how EBITDA got here
 *   result     the group result in brief
 *
 * Deliberately NOT here: a trading series with a measure toggle, a channel mix
 * ring, an entity ranking. Every one of them is a Sales page exhibit, and
 * repeating them was what made the two pages read as the same page twice.
 *
 * No section numerals. A cover is not chapter one.
 */

/** The headline figure, and the three results set beneath it. */
const LEAD_KPI = "revenue";
const SUPPORTING_KPIS = ["ebitda", "netProfit", "grossMargin"];

export function OverviewPage() {
  const dataset = useReportingDataset();
  return dataset.source === "demo" ? <DemoOverviewPage /> : <ConfiguredReporting mode="overview" />;
}

function DemoOverviewPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();
  const capabilities = reportingCapabilities(dataset);

  const kpis = useMemo(
    () => selectKpis([LEAD_KPI, ...SUPPORTING_KPIS], selection),
    [selection],
  );
  const lead = kpis[0];
  const supporting = kpis.slice(1);

  const headline = useMemo(() => buildPerformanceHeadline(kpis), [kpis]);
  const insights = useMemo(() => selectInsights(selection), [selection]);

  // The silhouette behind the headline is the trailing year, whatever basis is
  // being reported: a nine-month year-to-date makes a stub, and the shape a
  // reader is looking for on a cover is the year.
  const year = useMemo(
    () => selectMetricSeries(LEAD_KPI, periodsForBasis("R12", selection.periodId), selection.entityId),
    [selection],
  );

  const outlook = useMemo(
    () => selectAvailable("forecast", () => selectFullYearOutlook(selection), dataset),
    [selection, dataset],
  );
  const bridge = useMemo(
    () => (capabilities.hasPnl ? selectEbitdaBridge(selection) : []),
    [selection, capabilities],
  );
  const pnlRows = useMemo(() => selectProfitAndLoss(selection), [selection]);

  return (
    <>
      <CoverBand
        eyebrow={`${dataset.profile.companyName} · Group reporting`}
        stamp={`${currentPeriod.label} · ${currentPeriod.fiscalYear} P${currentPeriod.fiscalPeriod} · ${basis}`}
        title={headline.text ?? `${currentPeriod.label} results reported.`}
        series={year}
        currentPeriodId={currentPeriod.id}
        figure={<CoverFigure datum={lead} basis={basis} />}
      >
        {insights[0]?.text}
      </CoverBand>

      <FigureRow data={supporting} />

      {outlook && <OutlookStrip outlook={outlook} />}

      <div className="mt-11 flex flex-col gap-11">
        <Section
          flushTop
          title="In this pack"
          meta={currentPeriod.label}
          description="Every report in the pack, with what it currently says. Each line opens the page it reads from."
        >
          <PackIndex />
        </Section>

        <Section
          title="What moved"
          meta="Derived from reported results"
          description="The findings the working pages carry, in the order they matter."
        >
          <MovementNotes insights={insights} />
        </Section>

        {bridge.length > 2 && (
          <Section
            title="How EBITDA got here"
            meta={`${currentPeriod.fiscalYear} vs last year`}
            description="Movement decomposed into the drivers the model reports. Opening and closing columns are levels; the bars between them are movements."
          >
            <WaterfallChart steps={bridge} height={300} />
          </Section>
        )}

        <Section
          title="The group result"
          meta={`$'000 · ${basis} ${currentPeriod.label}`}
          description="The statement in brief. Profit & Loss carries it in full, by division and by cost centre."
        >
          <StatementTable
            rows={pnlRows}
            actualLabel={currentPeriod.label}
            columnSet="priorOnly"
            totalTreatment="band"
          />
        </Section>
      </div>
    </>
  );
}

/**
 * THE COVER FIGURE
 * ---------------------------------------------------------------------------
 * One number, set at the largest size anywhere in the product, hung off the
 * right of the headline. It is the reporting basis the reader selected, not a
 * window of the page's choosing — the filter bar says year to date, so this
 * says year to date.
 */
function CoverFigure({ datum, basis }: { datum: KpiDatum; basis: string }) {
  return (
    <div className="lg:flex lg:flex-col lg:items-end">
      <div className="text-[10.5px] tracking-[0.16em] uppercase text-cover-on/55">
        {datum.metric.name} · {basis}
      </div>
      <div className="font-serif tracking-[-0.022em] leading-[0.94] text-[clamp(48px,6.4vw,94px)] tnum mt-2">
        {formatMetric(datum.value, datum.metric)}
      </div>
      <div className="flex items-baseline gap-x-6 gap-y-2 mt-4 flex-wrap lg:justify-end">
        {datum.variance && (
          <VarianceValue variance={datum.variance} label={datum.comparisonLabel} size="md" ground="cover">
            {formatMetricDelta(datum.variance.absolute, datum.variance.relative, datum.metric)}
          </VarianceValue>
        )}
        {datum.secondary && (
          <VarianceValue
            variance={datum.secondary.variance}
            label={datum.secondary.label}
            size="md"
            ground="cover"
          >
            {formatMetricDelta(
              datum.secondary.variance.absolute,
              datum.secondary.variance.relative,
              datum.metric,
            )}
          </VarianceValue>
        )}
      </div>
    </div>
  );
}

/**
 * THE FIGURE ROW
 * ---------------------------------------------------------------------------
 * The results under the headline. Not the KPI band the working pages use: no
 * enclosing rules and no dividers between cells, each figure instead hung on a
 * hairline of its own with the variance below the line. Three, not four — the
 * fourth figure is the one on the cover.
 */
function FigureRow({ data }: { data: KpiDatum[] }) {
  if (data.length === 0) return null;

  return (
    <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-x-10 gap-y-8">
      {data.map((datum) => (
        <div key={datum.metric.id} className="min-w-0">
          <div className="type-label">{datum.metric.shortName ?? datum.metric.name}</div>
          <div className="font-serif text-[clamp(30px,3vw,42px)] leading-none tracking-[-0.015em] tnum mt-3 text-primary">
            {formatMetric(datum.value, datum.metric)}
          </div>
          <div className="mt-3.5 pt-3 border-t border-strong flex items-baseline gap-x-5 gap-y-1.5 flex-wrap">
            {datum.variance ? (
              <VarianceValue variance={datum.variance} label={datum.comparisonLabel}>
                {formatMetricDelta(datum.variance.absolute, datum.variance.relative, datum.metric)}
              </VarianceValue>
            ) : (
              <span className="type-caption">No comparative</span>
            )}
            {datum.secondary && (
              <VarianceValue variance={datum.secondary.variance} label={datum.secondary.label}>
                {formatMetricDelta(
                  datum.secondary.variance.absolute,
                  datum.secondary.variance.relative,
                  datum.metric,
                )}
              </VarianceValue>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * THE CONTENTS
 * ---------------------------------------------------------------------------
 * The pack's own table of contents, and the idea this page is built around: a
 * reader arriving at an overview wants to know what is in the book and whether
 * any of it needs them. So every page is listed, in the order the navigation
 * defines, each carrying a live reading of what it currently says.
 *
 * Readings come from the metric registry and the same selectors the destination
 * page calls, so a line here can never disagree with the page it opens. A page
 * whose module the dataset does not support is listed without a reading rather
 * than dropped: a contents page that hides chapters is not a contents page.
 */
interface IndexReading {
  metricId?: string;
  /** Stated instead of a metric where the page has no single headline figure. */
  note?: string;
}

function PackIndex() {
  const dataset = useReportingDataset();
  const { selection } = useFilters();
  const capabilities = reportingCapabilities(dataset);

  // What each page leads with. Only metrics the registry defines and the
  // resolvers can produce; a page with no single figure says what it is for.
  const readings: Record<string, IndexReading> = useMemo(
    () => ({
      sales: capabilities.hasSales ? { metricId: "totalSales" } : { note: "No sales facts supplied" },
      kpis: capabilities.hasSales ? { metricId: "transactions" } : { note: "Operational measures" },
      pnl: capabilities.hasPnl ? { metricId: "ebitda" } : { note: "No ledger supplied" },
      "balance-sheet": capabilities.hasBalanceSheet
        ? { metricId: "netDebt" }
        : { note: "No balance sheet supplied" },
      "cash-flow": capabilities.hasCashFlow
        ? { metricId: "operatingCashFlow" }
        : { note: "No cash flow supplied" },
      forecasts: capabilities.hasForecast
        ? { note: "Scenarios, risks and opportunities" }
        : { note: "No forecast supplied" },
      variance: capabilities.hasBudget
        ? { note: "Actual against plan, line by line" }
        : { note: "No plan supplied" },
      reports: { note: "Schedules, exports and board packs" },
      "data-mapping": { note: "Coverage, exceptions and lineage" },
      settings: { note: "Reporting preferences" },
    }),
    [capabilities],
  );

  const metricIds = useMemo(
    () => [...new Set(Object.values(readings).map((r) => r.metricId).filter((id): id is string => !!id))],
    [readings],
  );
  const data = useMemo(() => selectKpis(metricIds, selection), [metricIds, selection]);
  const byMetric = useMemo(
    () => new Map(data.map((datum) => [datum.metric.id, datum])),
    [data],
  );

  const library = useMemo(() => selectReportLibrary(dataset), [dataset]);

  // The numbered navigation, so the contents carries the same ordinals the
  // sidebar does. A contents page that numbers its chapters differently from
  // the spine is worse than one that does not number them at all.
  const groups = useMemo(() => numberedNavigation(), []);

  return (
    // The groups run side by side, the way a contents page sets its parts —
    // not stacked, which turns a nine-line index into a column of scrolling.
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-9 gap-y-8">
      {groups.map((group) => {
        const items = group.items.filter((item) => item.id !== "overview");
        if (items.length === 0) return null;

        return (
          <div key={group.id} className="min-w-0">
            <div className="type-label">{group.label}</div>
            <ul className="mt-2.5">
              {items.map((item) => {
                const reading = readings[item.id];
                const datum = reading?.metricId ? byMetric.get(reading.metricId) : undefined;
                // The library is the reports page's own count, read from the
                // same selector that page reads.
                const note =
                  item.id === "reports" && library.scheduled.length > 0
                    ? `${library.scheduled.length} schedules · ${library.boardPacks.length} board packs`
                    : reading?.note;

                return (
                  <li key={item.id}>
                    <Link
                      to={item.path}
                      className="group grid grid-cols-[1.9rem_minmax(0,1fr)] items-baseline gap-x-2.5 py-3 border-b border-subtle hover:bg-inset transition-colors"
                    >
                      <span className="type-section-number text-tertiary">{item.ordinal}</span>
                      <span className="min-w-0">
                        <span className="text-[13px] text-primary group-hover:underline underline-offset-[3px]">
                          {item.label}
                        </span>
                        {/* The figure IS the reading. A note as well as a figure
                            says the same thing twice in half the width. */}
                        {!datum && note && (
                          <span className="type-caption block mt-0.5">{note}</span>
                        )}
                        {datum && (
                          <span className="flex items-baseline gap-2 mt-1">
                            <span className="text-[13px] font-semibold text-primary tnum">
                              {formatMetric(datum.value, datum.metric)}
                            </span>
                            {datum.variance ? (
                              <VarianceValue variance={datum.variance} size="xs" glyph="triangle">
                                {formatMetricDelta(
                                  datum.variance.absolute,
                                  datum.variance.relative,
                                  datum.metric,
                                )}
                              </VarianceValue>
                            ) : (
                              <span className="type-caption">No comparative</span>
                            )}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * WHAT MOVED
 * ---------------------------------------------------------------------------
 * The same findings the working pages carry, set as statements rather than as
 * a numbered list: the ordinal is large and quiet, the sentence is the size of
 * body copy that expects to be read, and a rule separates one from the next.
 */
function MovementNotes({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return <p className="type-body">No movements of note in the reported results.</p>;
  }

  return (
    <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-10">
      {insights.slice(0, 6).map((insight, index) => (
        <li
          key={insight.id}
          className="grid grid-cols-[2.1rem_minmax(0,1fr)] gap-x-3 py-4 border-b border-subtle"
        >
          <span className="font-serif text-[19px] leading-none text-tertiary tnum pt-[3px]">
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="type-body-lead">{insight.text}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * FULL-YEAR OUTLOOK STRIP
 * ---------------------------------------------------------------------------
 * Progress against the full-year position — actual to date, forecast to go and
 * the variance to budget the forecast selector already computed — set as a
 * single line beneath the figures rather than as a block of its own. Shown only
 * where the dataset supports forecasting.
 */
function OutlookStrip({ outlook }: { outlook: ReturnType<typeof selectFullYearOutlook> }) {
  const variance = calculateVariance(outlook.forecast, outlook.budget, getMetric("ebitda"));
  const progress = outlook.forecast === 0 ? 0 : outlook.actualToDate / outlook.forecast;

  return (
    <div className="mt-10 flex items-center gap-x-9 gap-y-3 flex-wrap py-3.5 border-y border-subtle">
      <span className="type-label shrink-0">Full-year EBITDA outlook</span>

      <div className="flex items-center gap-3 min-w-[220px] flex-1 max-w-[420px]">
        <Meter value={outlook.actualToDate} max={outlook.forecast} className="flex-1" />
        <span className="type-caption whitespace-nowrap">{formatPercentage(progress)} banked</span>
      </div>

      <span className="type-caption whitespace-nowrap">
        {formatCurrency(outlook.actualToDate)} to date · {formatCurrency(outlook.forecastRemaining)}{" "}
        to go · {outlook.remainingPeriods} period{outlook.remainingPeriods === 1 ? "" : "s"} open
      </span>

      <span className="flex items-baseline gap-5 ml-auto shrink-0">
        <span className="type-caption">
          Outlook{" "}
          <span className="text-primary font-medium tnum">{formatCurrency(outlook.forecast)}</span>
        </span>
        <span className="type-caption">
          Budget{" "}
          <span className="text-primary font-medium tnum">{formatCurrency(outlook.budget)}</span>
        </span>
        {variance && (
          <VarianceValue variance={variance} label="vs budget" size="sm">
            {formatCurrency(variance.absolute, { showSign: true })}
          </VarianceValue>
        )}
      </span>
    </div>
  );
}
