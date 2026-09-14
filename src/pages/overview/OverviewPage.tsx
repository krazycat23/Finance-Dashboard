import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { Section, SectionRow } from "@/components/layout/Section";
import { Masthead } from "@/components/layout/Masthead";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { buildPerformanceHeadline } from "@/components/finance/performanceHeadline";
import { NumberedInsightList } from "@/components/finance/InsightList";
import { RankedBarList, type RankedItem } from "@/components/finance/RankedBarList";
import { ReportingUnavailable } from "@/components/finance/ReportingAvailability";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { TrendChart } from "@/components/charts/TrendChart";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { CompositionChart, type CompositionSlice } from "@/components/charts/CompositionChart";
import { StatementTable } from "@/components/tables/StatementTable";
import {
  periodsForBasis, selectBreakdown, selectEbitdaBridge, selectEntityPerformance,
  selectFullYearOutlook, selectInsights, selectKpis, selectMetricSeries,
  selectProfitAndLoss,
} from "@/domain/selectors";
import {
  reportingCapabilities, selectAvailable, selectModuleAvailability,
} from "@/domain/selectors/availability";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import { formatBasisPoints, formatCurrency, formatPercentage } from "@/utils/format";

/**
 * EXECUTIVE OVERVIEW — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The opening spread of the reporting pack, composed as a document rather than
 * assembled as a dashboard:
 *
 *   masthead      the performance statement, the commentary, the plate
 *   KPI band      four figures on one ruled band, divided by hairlines
 *   01 | 02       trading performance against the sales mix      (60 / 40)
 *   03 | 04       the P&L summary against the key drivers        (60 / 40)
 *   05            the EBITDA bridge, full measure
 *   06            entity performance
 *
 * Nothing on this page is boxed. Charts and tables sit directly on the canvas
 * and are separated by rules and whitespace, so the spread reads continuously
 * from the headline down rather than as a stack of independent modules.
 *
 * It is composed entirely from shared primitives and existing selectors: no
 * chart code, no formatting and no arithmetic of its own.
 */

/** The headline figures. Matches the metrics the reporting spec supports. */
const OVERVIEW_KPIS = ["revenue", "ebitda", "netProfit", "grossMargin"];

/** Measures the trading exhibit can plot, all backed by the metric registry. */
const TRADING_MEASURES = [
  { value: "revenue", label: "Revenue" },
  { value: "grossProfit", label: "Gross Profit" },
  { value: "ebitda", label: "EBITDA" },
  { value: "netProfit", label: "Net Profit" },
] as const;
type TradingMeasure = (typeof TRADING_MEASURES)[number]["value"];

type RankMetric = "revenue" | "margin" | "ebitda";

export function OverviewPage() {
  const dataset = useReportingDataset();
  return dataset.source === "demo" ? <DemoOverviewPage /> : <ConfiguredReporting mode="overview" />;
}

function DemoOverviewPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();
  const capabilities = reportingCapabilities(dataset);

  const [measure, setMeasure] = useState<TradingMeasure>("revenue");
  const [rankMetric, setRankMetric] = useState<RankMetric>("revenue");

  const kpis = useMemo(() => selectKpis(OVERVIEW_KPIS, selection), [selection]);
  const headline = useMemo(() => buildPerformanceHeadline(kpis), [kpis]);
  const insights = useMemo(() => selectInsights(selection), [selection]);

  // The trading exhibit uses a rolling twelve months rather than the reporting
  // basis: a nine-month year-to-date makes a thin chart, and the trailing year
  // is the shape an executive is actually looking for.
  const trend = useMemo(() => {
    const periods = periodsForBasis("R12", selection.periodId);
    return selectMetricSeries(measure, periods, selection.entityId);
  }, [selection, measure]);

  // Every section below is gated on what the active dataset actually supports.
  const outlook = useMemo(
    () => selectAvailable("forecast", () => selectFullYearOutlook(selection), dataset),
    [selection, dataset],
  );
  const bridge = useMemo(
    () => (capabilities.hasPnl ? selectEbitdaBridge(selection) : []),
    [selection, capabilities],
  );
  const salesMix = useMemo(
    () =>
      capabilities.hasSales && dataset.dimensions.channels.length > 0
        ? selectBreakdown(selection, "channelId")
        : [],
    [selection, capabilities, dataset],
  );
  const pnlRows = useMemo(() => selectProfitAndLoss(selection), [selection]);
  const entityPerformance = useMemo(() => selectEntityPerformance(selection), [selection]);

  const mixSlices = useMemo<CompositionSlice[]>(
    () =>
      salesMix.map((row) => ({
        id: row.id,
        label: row.name,
        value: row.revenue,
        comparison:
          row.growth === undefined ? undefined : formatPercentage(row.growth, { showSign: true }),
        comparisonTone:
          row.growth === undefined ? "neutral" : row.growth >= 0 ? "positive" : "negative",
      })),
    [salesMix],
  );
  const mixTotal = useMemo(
    () => salesMix.reduce((sum, row) => sum + row.revenue, 0),
    [salesMix],
  );

  // Each measure carries its own primary value and its own comparative, so the
  // toggle changes what is ranked rather than just relabelling the same bars.
  const rankedItems = useMemo<RankedItem[]>(() => {
    const tone = (value: number | undefined) =>
      value === undefined ? ("neutral" as const)
        : value >= 0 ? ("positive" as const) : ("negative" as const);

    const rows = entityPerformance.map((entity): RankedItem => {
      if (rankMetric === "revenue") {
        return {
          id: entity.id,
          label: entity.name,
          value: entity.revenue,
          display: formatCurrency(entity.revenue),
          secondary: entity.revenueGrowth === undefined
            ? undefined
            : formatPercentage(entity.revenueGrowth, { showSign: true }),
          secondaryTone: tone(entity.revenueGrowth),
        };
      }
      if (rankMetric === "margin") {
        return {
          id: entity.id,
          label: entity.name,
          value: entity.grossMargin,
          display: formatPercentage(entity.grossMargin),
          secondary: entity.marginMovement === undefined
            ? undefined
            : formatBasisPoints(entity.marginMovement, { showSign: true }),
          secondaryTone: tone(entity.marginMovement),
        };
      }
      return {
        id: entity.id,
        label: entity.name,
        value: entity.ebitda,
        display: formatCurrency(entity.ebitda),
        secondary: entity.ebitdaGrowth === undefined
          ? undefined
          : formatPercentage(entity.ebitdaGrowth, { showSign: true }),
        secondaryTone: tone(entity.ebitdaGrowth),
      };
    });
    return rows.sort((a, b) => b.value - a.value);
  }, [entityPerformance, rankMetric]);

  const measureLabel =
    TRADING_MEASURES.find((option) => option.value === measure)?.label ?? "Revenue";

  return (
    <>
      <Masthead
        eyebrow="Overview"
        title={headline.text ?? `${currentPeriod.label} results reported.`}
        lede={`${dataset.profile.companyName} · ${currentPeriod.label} reporting pack. Group results with variance to plan and to last year.`}
        commentary={insights[0]?.text}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Fiscal", value: `${currentPeriod.fiscalYear} · P${currentPeriod.fiscalPeriod}` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      {outlook && <OutlookStrip outlook={outlook} />}

      {/* 01 | 02 --------------------------------------------------------------- */}
      <div className="mt-10 flex flex-col gap-10">
        <SectionRow>
          <Section
            flushTop
            number="01"
            title="Trading performance"
            meta="Rolling 12 months"
            actions={
              <SegmentedControl
                aria-label="Trading measure"
                value={measure}
                onChange={setMeasure}
                options={TRADING_MEASURES.map((option) => ({ ...option }))}
              />
            }
          >
            <TrendChart
              data={trend}
              height={306}
              actualLabel={`${measureLabel} — actual`}
              priorYearLabel="Last year"
              budgetLabel="Budget"
            />
          </Section>

          <Section
            flushTop
            number="02"
            title="Sales mix"
            meta={mixSlices.length > 0 ? "By channel" : undefined}
          >
            {mixSlices.length > 0 ? (
              <CompositionChart
                slices={mixSlices}
                // Ranked by revenue, so the mix reads as one hue light to dark
                // rather than as four unrelated colours competing for meaning.
                mode="sequential"
                surface="canvas"
                height={238}
                centreValue={formatCurrency(mixTotal)}
                centreLabel="Total sales"
              />
            ) : (
              <ReportingUnavailable message={selectModuleAvailability("sales", dataset).message} />
            )}
          </Section>
        </SectionRow>

        {/* 03 | 04 ------------------------------------------------------------- */}
        <SectionRow>
          <Section
            flushTop
            number="03"
            title="Profit & Loss summary"
            meta="$'000"
            description={`${basis} to ${currentPeriod.label}, against budget.`}
          >
            <StatementTable
              rows={pnlRows}
              actualLabel={`${basis} ${currentPeriod.label}`}
              columnSet="budgetOnly"
              scale="thousands"
            />
          </Section>

          <Section
            flushTop
            number="04"
            title="Key drivers"
            meta="Derived from reported results"
          >
            {insights.length > 0 ? (
              <NumberedInsightList insights={insights} />
            ) : (
              <p className="type-body">No movements of note in the reported results.</p>
            )}
          </Section>
        </SectionRow>

        {/* 05 ------------------------------------------------------------------ */}
        {bridge.length > 2 && (
          <Section
            number="05"
            title="EBITDA bridge"
            meta={`${currentPeriod.fiscalYear} vs last year`}
            description="Movement decomposed into the drivers the model reports. Opening and closing columns are levels; the bars between them are movements."
          >
            <WaterfallChart steps={bridge} height={300} />
          </Section>
        )}

        {/* 06 ------------------------------------------------------------------ */}
        <Section
          number="06"
          title="Entity performance"
          meta={`${entityPerformance.length} reporting entities`}
          description="Reporting entities as defined by the active dataset's entity dimension."
          actions={
            <SegmentedControl
              aria-label="Ranking measure"
              value={rankMetric}
              onChange={setRankMetric}
              options={[
                { value: "revenue", label: "Revenue" },
                { value: "margin", label: "Margin" },
                { value: "ebitda", label: "EBITDA" },
              ]}
            />
          }
        >
          <div className="max-w-[980px]">
            <RankedBarList items={rankedItems} showIndex />
          </div>
        </Section>
      </div>
    </>
  );
}

/**
 * FULL-YEAR OUTLOOK STRIP
 * ---------------------------------------------------------------------------
 * Progress against the full-year position — actual to date, forecast to go and
 * the variance to budget the forecast selector already computed — set as a
 * single line hung off the KPI band rather than as a block of its own. Shown
 * only where the dataset supports forecasting.
 */
function OutlookStrip({ outlook }: { outlook: ReturnType<typeof selectFullYearOutlook> }) {
  const variance = calculateVariance(outlook.forecast, outlook.budget, getMetric("ebitda"));
  const progress = outlook.forecast === 0 ? 0 : outlook.actualToDate / outlook.forecast;

  return (
    <div className="flex items-center gap-x-9 gap-y-3 flex-wrap py-3.5 border-b border-subtle">
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
