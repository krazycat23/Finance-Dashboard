import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Exhibit, Section } from "@/components/layout/Section";
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
import { StatementTable } from "@/components/tables/StatementTable";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  periodsForBasis, selectBreakdown, selectEbitdaBridge, selectEntityPerformance,
  selectFullYearOutlook, selectInsights, selectKpis, selectMetricSeries,
  selectProfitAndLoss, type DimensionBreakdown,
} from "@/domain/selectors";
import {
  reportingCapabilities, selectAvailable, selectModuleAvailability,
} from "@/domain/selectors/availability";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import {
  formatBasisPoints, formatCurrency, formatPercentage,
} from "@/utils/format";

/**
 * EXECUTIVE OVERVIEW — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The page a CFO opens first, laid out as the opening spread of an annual
 * report rather than as a dashboard:
 *
 *   masthead            company, period, controls (the shell carries these)
 *   editorial lead      the performance statement and its commentary
 *   KPI band            the headline figures, divided by rules, not boxed
 *   01 Trading          the central performance exhibit
 *   02 Key drivers      numbered commentary from the variance selectors
 *   03 Sales mix        an existing sales dimension, or the unavailable state
 *   04 P&L summary      the compact statement
 *   05 EBITDA bridge    where the model supports a genuine bridge
 *   06 Entity           performance by reporting entity
 *
 * It is composed entirely from shared primitives and existing selectors: no
 * chart code, no formatting and no arithmetic of its own.
 */

/** Headline figures. Only metrics the active dataset reports are requested. */
const OVERVIEW_KPIS = ["revenue", "ebitda", "netProfit", "grossMargin", "cash"];

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
      <PageHeader
        eyebrow="Executive Overview"
        title={dataset.profile.companyName}
        subtitle={`${currentPeriod.label} reporting pack. Group results with variance to plan and to last year.`}
      />

      {/* EDITORIAL LEAD — the statement, and the commentary that supports it.
          Both are readings of the selectors; neither is written here. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-x-12 gap-y-5 mt-6">
        <div className="min-w-0">
          {headline.text ? (
            <p className="type-display max-w-[24ch]">{headline.text}</p>
          ) : (
            <p className="type-display max-w-[24ch]">
              {currentPeriod.label} results reported.
            </p>
          )}
          <p className="type-caption mt-3">
            {basis} · {dataset.profile.reportingCurrency} · Fiscal {currentPeriod.fiscalYear}{" "}
            period {currentPeriod.fiscalPeriod}
          </p>
        </div>

        {insights.length > 0 && (
          <div className="min-w-0 border-l-0 lg:border-l lg:border-subtle lg:pl-12">
            <div className="eyebrow">Finance commentary</div>
            <p className="type-body-lead mt-2.5">{insights[0].text}</p>
          </div>
        )}
      </div>

      <div className="mt-7">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      {outlook && <OutlookRail outlook={outlook} />}

      <PageSections>
        <Section
          number="01"
          title="Trading performance"
          meta="Rolling 12 months"
          description="Actual against last year, with plan shown as a reference line. Periods that have not closed carry no actual."
          actions={
            <SegmentedControl
              aria-label="Trading measure"
              value={measure}
              onChange={setMeasure}
              options={TRADING_MEASURES.map((option) => ({ ...option }))}
            />
          }
        >
          <Exhibit className="px-5 py-5">
            <TrendChart
              data={trend}
              height={320}
              actualLabel={`${measureLabel} — actual`}
              priorYearLabel="Last year"
              budgetLabel="Budget"
            />
          </Exhibit>
        </Section>

        {insights.length > 0 && (
          <Section
            number="02"
            title="Key drivers"
            meta="Derived from reported results"
            description="Each entry restates a movement already present in the statements below."
          >
            <div className="max-w-[110ch]">
              <NumberedInsightList insights={insights} />
            </div>
          </Section>
        )}

        <Section
          number="03"
          title="Sales mix"
          meta={salesMix.length > 0 ? "By channel" : undefined}
          description="Revenue by reported sales dimension, with share of group revenue and movement on last year."
        >
          {salesMix.length > 0 ? (
            <SalesMixTable rows={salesMix} />
          ) : (
            <ReportingUnavailable message={selectModuleAvailability("sales", dataset).message} />
          )}
        </Section>

        <Section
          number="04"
          title="Profit & Loss summary"
          meta="$'000"
          description={`${basis} to ${currentPeriod.label}, against budget and last year.`}
        >
          <StatementTable
            rows={pnlRows}
            actualLabel={`${basis} ${currentPeriod.label}`}
            columnSet="full"
            scale="thousands"
          />
        </Section>

        {bridge.length > 2 && (
          <Section
            number="05"
            title="EBITDA bridge"
            meta={`${currentPeriod.fiscalYear} vs last year`}
            description="Movement decomposed into the drivers the model reports. Opening and closing columns are levels; the bars between them are movements."
          >
            <Exhibit className="px-5 py-5">
              <WaterfallChart steps={bridge} height={300} />
            </Exhibit>
          </Section>
        )}

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
          <div className="max-w-[860px]">
            <RankedBarList items={rankedItems} showIndex />
          </div>
        </Section>
      </PageSections>
    </>
  );
}

/**
 * FULL-YEAR OUTLOOK RAIL
 * ---------------------------------------------------------------------------
 * Progress against the full-year position: actual to date, forecast to go, and
 * the variance to budget the forecast selector already computed. Shown only
 * where the dataset supports forecasting.
 */
function OutlookRail({
  outlook,
}: {
  outlook: ReturnType<typeof selectFullYearOutlook>;
}) {
  const metric = getMetric("ebitda");
  const variance = calculateVariance(outlook.forecast, outlook.budget, metric);
  const progress = outlook.forecast === 0 ? 0 : outlook.actualToDate / outlook.forecast;

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-end border-b border-subtle pb-5">
      <div className="min-w-0 max-w-[560px]">
        <div className="flex items-baseline justify-between gap-4">
          <span className="type-label">Full-year EBITDA outlook</span>
          <span className="type-caption">
            {formatPercentage(progress)} of outlook banked ·{" "}
            {outlook.remainingPeriods} period{outlook.remainingPeriods === 1 ? "" : "s"} open
          </span>
        </div>
        <Meter value={outlook.actualToDate} max={outlook.forecast} className="mt-2" />
        <p className="type-caption mt-1.5">
          {formatCurrency(outlook.actualToDate)} actual to date ·{" "}
          {formatCurrency(outlook.forecastRemaining)} forecast to go
        </p>
      </div>
      <div className="flex items-end gap-8">
        <div>
          <div className="type-label">Outlook</div>
          <div className="type-kpi type-kpi-sm mt-1.5">{formatCurrency(outlook.forecast)}</div>
        </div>
        <div>
          <div className="type-label">Budget</div>
          <div className="type-kpi type-kpi-sm mt-1.5">{formatCurrency(outlook.budget)}</div>
        </div>
        {variance && (
          <div className="pb-1.5">
            <div className="type-label">Variance</div>
            <div className="mt-2.5">
              <VarianceValue variance={variance} label="vs budget" size="md">
                {formatCurrency(variance.absolute, { showSign: true })}
              </VarianceValue>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SALES MIX
 * ---------------------------------------------------------------------------
 * Rendered through the shared table primitive so the mix reads with the same
 * alignment, numerals and rules as the statement below it. The dimension is
 * whatever the dataset reports; no member list is hard-coded.
 */
function SalesMixTable({ rows }: { rows: DimensionBreakdown[] }) {
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 0);

  const columns: Column<DimensionBreakdown>[] = [
    {
      id: "name",
      header: "Channel",
      align: "left",
      width: "30%",
      render: (row) => <span className="text-[12.5px] font-medium text-primary">{row.name}</span>,
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      width: "16%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.revenue)}</span>,
    },
    {
      id: "share",
      header: "Share of revenue",
      align: "right",
      width: "22%",
      // The bar sits under its own number rather than in a column of its own:
      // the magnitude and the figure it restates belong to one another, and a
      // separate bar column leaves a channel of dead space down the table.
      render: (row) => (
        <div className="flex flex-col items-end gap-[5px]">
          <span>{formatPercentage(row.share)}</span>
          <Meter value={row.revenue} max={maxRevenue} className="w-full max-w-[150px]" />
        </div>
      ),
    },
    {
      id: "margin",
      header: "Gross margin",
      align: "right",
      width: "16%",
      groupStart: true,
      render: (row) => formatPercentage(row.grossMargin),
    },
    {
      id: "growth",
      header: "vs LY",
      align: "right",
      width: "16%",
      render: (row) => {
        if (row.growth === undefined) return <span className="text-tertiary">—</span>;
        const variance = calculateVariance(row.revenue, row.priorYearRevenue, getMetric("revenue"));
        if (!variance) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.growth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      minWidth={720}
      empty="No sales dimension members reported for this selection."
    />
  );
}
