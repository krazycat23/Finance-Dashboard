import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow } from "@/components/layout/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Meter } from "@/components/ui/Meter";
import { Badge } from "@/components/ui/Badge";
import { KpiBand } from "@/components/finance/KpiBand";
import { buildPerformanceHeadline } from "@/components/finance/performanceHeadline";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { TrendChart } from "@/components/charts/TrendChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  selectDriverAssumptions, selectForecastSeries, selectFullYearOutlook,
  selectRisksAndOpportunities, selectScenarios,
  type DriverAssumption, type ForecastPoint, type RiskOpportunity, type ScenarioRow,
} from "@/domain/selectors";
import { formatCurrency, formatMetric, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * FORECAST — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The page where the actual/forecast boundary matters most.
 *
 * The full-year number is ACTUAL-TO-DATE PLUS FORECAST-TO-GO. Reporting a pure
 * model output over periods that have already closed is the fastest way for a
 * forecast page to lose credibility, so the split is stated on the page rather
 * than buried. Scenario ranges apply only to the open periods: history carries
 * no uncertainty, and widening a band across closed months would be wrong.
 *
 *   masthead    the full-year position and its commentary
 *   band        the four full-year measures the outlook selector reports
 *   01          the year's trajectory: actual, forecast and plan
 *   02 | 03     what the full-year number is made of, and what must be true
 *   04 | 05     the periods themselves, against the risks around them
 *   06          scenarios, applied to forecast-to-go only
 */

/**
 * The measures the full-year outlook selector reports. Each KPI is that
 * selector's own output against its own budget — no ratio is derived here.
 */
const OUTLOOK_MEASURES = [
  { value: "revenue", label: "Revenue", metricId: "revenue" },
  { value: "grossProfit", label: "Gross Profit", metricId: "grossProfit" },
  { value: "ebitda", label: "EBITDA", metricId: "ebitda" },
  { value: "netProfit", label: "Net Profit", metricId: "netProfit" },
] as const;
type OutlookMeasure = (typeof OUTLOOK_MEASURES)[number]["value"];

export function ForecastsPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod } = useFilters();
  const [measure, setMeasure] = useState<OutlookMeasure>("revenue");

  const outlooks = useMemo(
    () =>
      Object.fromEntries(
        OUTLOOK_MEASURES.map((option) => [
          option.value,
          selectFullYearOutlook(selection, option.value),
        ]),
      ) as Record<OutlookMeasure, ReturnType<typeof selectFullYearOutlook>>,
    [selection],
  );
  const outlook = outlooks[measure];

  const series = useMemo(() => selectForecastSeries(selection, measure), [selection, measure]);
  const scenarios = useMemo(() => selectScenarios(selection), [selection]);
  const assumptions = useMemo(() => selectDriverAssumptions(selection), [selection]);
  const risks = useMemo(() => selectRisksAndOpportunities(selection), [selection]);

  // Each full-year measure against its own plan, straight from the selector.
  const kpis = useMemo<KpiDatum[]>(
    () =>
      OUTLOOK_MEASURES.map((option) => {
        const metric = getMetric(option.metricId);
        const value = outlooks[option.value];
        return {
          metric: { ...metric, shortName: `FY ${metric.shortName ?? metric.name}` },
          value: value.forecast,
          comparison: value.budget,
          comparisonLabel: "vs Plan",
          variance: calculateVariance(value.forecast, value.budget, metric),
          series: [],
        };
      }),
    [outlooks],
  );

  const headline = useMemo(
    () => buildPerformanceHeadline(kpis, ["ebitda", "netProfit", "grossProfit"]),
    [kpis],
  );

  const revenueOutlook = outlooks.revenue;
  const banked =
    revenueOutlook.forecast === 0 ? 0 : revenueOutlook.actualToDate / revenueOutlook.forecast;
  const measureLabel =
    OUTLOOK_MEASURES.find((option) => option.value === measure)?.label ?? "Revenue";

  return (
    <>
      <Masthead
        eyebrow="Forecasting & planning"
        titleClassName="max-w-[22ch]"
        title={headline.text ?? `${currentPeriod.fiscalYear} outlook reported.`}
        lede={`${dataset.profile.companyName} · ${currentPeriod.fiscalYear} full-year outlook: actuals to ${currentPeriod.label} plus forecast for the ${revenueOutlook.remainingPeriods} periods still open.`}
        context={[
          { label: "Fiscal", value: currentPeriod.fiscalYear },
          { label: "Closed to", value: currentPeriod.label },
          { label: "Open", value: `${revenueOutlook.remainingPeriods} periods` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3 py-3.5 border-b border-subtle">
        <span className="type-label">Full-year revenue banked</span>
        <div className="flex items-center gap-3 min-w-[200px] flex-1 max-w-[380px]">
          <Meter value={revenueOutlook.actualToDate} max={revenueOutlook.forecast} className="flex-1" />
          <span className="type-caption whitespace-nowrap">{formatPercentage(banked)}</span>
        </div>
        <span className="type-caption">
          {formatCurrency(revenueOutlook.actualToDate)} actual to date ·{" "}
          {formatCurrency(revenueOutlook.forecastRemaining)} forecast to go
        </span>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {/* 01 — the year's trajectory --------------------------------------- */}
        <Section
          number="01"
          title="Forecast against plan"
          meta={currentPeriod.fiscalYear}
          description="Closed periods carry the actual; open periods carry the current reforecast. Plan runs through both as a reference line."
          actions={
            <SegmentedControl
              aria-label="Outlook measure"
              value={measure}
              onChange={setMeasure}
              options={OUTLOOK_MEASURES.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          }
        >
          <TrendChart
            data={series.map((point) => ({
              period: point.period,
              actual: point.actual,
              budget: point.budget,
              forecast: point.forecast,
            }))}
            height={330}
            showForecast
            showPriorYear={false}
            actualLabel={`${measureLabel} — actual`}
            budgetLabel="Plan"
          />
        </Section>

        {/* 02 | 03 — what it is made of, and what must be true --------------- */}
        <SectionRow split="55/45">
          <Section
            flushTop
            number="02"
            title="Full-year composition"
            meta={measureLabel}
            description="What the full-year number is actually made of, and how it sits against plan and last year."
          >
            <CompositionRail outlook={outlook} />
          </Section>

          <Section
            flushTop
            number="03"
            title="Key assumptions"
            meta="What has to be true for the forecast to land"
          >
            <AssumptionTable rows={assumptions} />
          </Section>
        </SectionRow>

        {/* 04 | 05 — the periods, against the risks around them -------------- */}
        <SectionRow split="60/40">
          <Section
            flushTop
            number="04"
            title="Period detail"
            meta={currentPeriod.fiscalYear}
            description="Closed periods are marked; the remainder carry the reforecast."
          >
            <PeriodTable rows={series} />
          </Section>

          <Section
            flushTop
            number="05"
            title="Risks and opportunities"
            meta={`Net ${formatCurrency(risks.reduce((sum, risk) => sum + risk.value, 0), { showSign: true, parentheses: false })}`}
          >
            <RiskList rows={risks} />
          </Section>
        </SectionRow>

        {/* 06 — scenarios ---------------------------------------------------- */}
        <Section
          number="06"
          title="Scenario comparison"
          meta="Applied to forecast-to-go only"
          description="Closed periods are identical across every scenario; only the open periods move."
        >
          <ScenarioTable rows={scenarios} />
        </Section>
      </div>
    </>
  );
}

/**
 * FULL-YEAR COMPOSITION
 * ---------------------------------------------------------------------------
 * The honest reading of a full-year number: what is banked, what is still
 * forecast, and where the total lands against plan and last year. It is not
 * presented as a driver bridge — the model reports no forecast drivers, and
 * inferring them on the page would be inventing the analysis.
 */
function CompositionRail({ outlook }: { outlook: ReturnType<typeof selectFullYearOutlook> }) {
  const rows = [
    { id: "actual", label: "Actual to date", value: outlook.actualToDate, tone: "accent" as const },
    {
      id: "forecast",
      label: `Forecast to go · ${outlook.remainingPeriods} period${outlook.remainingPeriods === 1 ? "" : "s"}`,
      value: outlook.forecastRemaining,
      tone: "neutral" as const,
    },
  ];

  const totals = [
    { id: "total", label: "Full-year outlook", value: outlook.forecast, strong: true },
    { id: "plan", label: "Plan", value: outlook.budget },
    { id: "prior", label: "Last year", value: outlook.priorYear },
  ];

  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div key={row.id} className="py-3.5 border-b border-subtle">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[12.5px] text-secondary">{row.label}</span>
            <span className="text-[13px] text-primary tnum font-medium">
              {formatCurrency(row.value)}
            </span>
          </div>
          <Meter value={row.value} max={outlook.forecast} tone={row.tone} className="mt-2.5" />
        </div>
      ))}

      {totals.map((row) => (
        <div
          key={row.id}
          className={cn(
            "flex items-baseline justify-between gap-4 py-2.5",
            row.strong && "border-b border-subtle",
          )}
        >
          <span className={cn("text-[12.5px]", row.strong ? "text-primary font-semibold" : "text-secondary")}>
            {row.label}
          </span>
          <span className={cn("tnum", row.strong ? "text-[15px] font-semibold text-primary font-serif" : "text-[12.5px] text-primary")}>
            {formatCurrency(row.value)}
          </span>
        </div>
      ))}

      <div className="flex items-baseline justify-between gap-4 py-2.5 border-t border-strong">
        <span className="text-[12.5px] text-primary font-semibold">Variance to plan</span>
        <span
          className={cn(
            "text-[13px] font-semibold tnum",
            outlook.varianceToBudget >= 0 ? "text-positive" : "text-negative",
          )}
        >
          {formatCurrency(outlook.varianceToBudget, { showSign: true, parentheses: false })}
        </span>
      </div>
    </div>
  );
}

/** What the forecast assumes, against what has actually been achieved. */
function AssumptionTable({ rows }: { rows: DriverAssumption[] }) {
  const format = (value: number, shape: DriverAssumption["format"]) =>
    shape === "percentage" ? formatPercentage(value)
      : shape === "currency" ? formatCurrency(value)
      : formatMetric(value, getMetric("units"));

  const columns: Column<DriverAssumption>[] = [
    {
      id: "driver",
      header: "Driver",
      align: "left",
      width: "40%",
      render: (row) => (
        <div className="min-w-0">
          <div className="text-[12.5px] text-primary">{row.driver}</div>
          <div className="type-caption mt-0.5">{row.basis}</div>
        </div>
      ),
    },
    {
      id: "current",
      header: "Achieved",
      align: "right",
      width: "20%",
      groupStart: true,
      render: (row) => format(row.current, row.format),
    },
    {
      id: "assumed",
      header: "Assumed",
      align: "right",
      width: "20%",
      render: (row) => <span className="font-medium">{format(row.assumed, row.format)}</span>,
    },
    {
      id: "delta",
      header: "Movement",
      align: "right",
      width: "20%",
      render: (row) => {
        const variance = calculateVariance(row.assumed, row.current, { favourableDirection: "up" });
        if (!variance) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {row.format === "percentage"
              ? formatPercentage(variance.absolute, { showSign: true })
              : formatCurrency(variance.absolute, { showSign: true, parentheses: false })}
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
      minWidth={440}
      empty="No forecast assumptions are recorded for this selection."
    />
  );
}

/** The fiscal year period by period, with the closed/open boundary marked. */
function PeriodTable({ rows }: { rows: ForecastPoint[] }) {
  const columns: Column<ForecastPoint>[] = [
    {
      id: "period",
      header: "Period",
      align: "left",
      width: "18%",
      render: (row) => <span className="text-[12.5px] text-primary">{row.period.label}</span>,
    },
    {
      id: "status",
      header: "",
      align: "left",
      width: "14%",
      render: (row) => (
        <span className="type-caption">{row.isActual ? "Closed" : "Open"}</span>
      ),
    },
    {
      id: "actual",
      header: "Actual",
      align: "right",
      width: "17%",
      groupStart: true,
      render: (row) =>
        row.actual === undefined
          ? <span className="text-tertiary">—</span>
          : <span className="font-medium">{formatCurrency(row.actual)}</span>,
    },
    {
      id: "forecast",
      header: "Forecast",
      align: "right",
      width: "17%",
      // A forecast is only shown where the period is still open: a reforecast
      // printed over a closed month is the most common way this page lies.
      render: (row) =>
        row.isActual
          ? <span className="text-tertiary">—</span>
          : formatCurrency(row.forecast),
    },
    {
      id: "budget",
      header: "Plan",
      align: "right",
      width: "17%",
      groupStart: true,
      render: (row) => formatCurrency(row.budget),
    },
    {
      id: "variance",
      header: "vs Plan",
      align: "right",
      width: "17%",
      render: (row) => {
        const value = row.isActual ? row.actual : row.forecast;
        const variance = calculateVariance(value ?? 0, row.budget, getMetric("revenue"));
        if (!variance || variance.relative === undefined) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(variance.relative, { showSign: true })}
          </VarianceValue>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.period.id}
      minWidth={620}
      rowClassName={(row) => (row.isActual ? undefined : "[&>td]:text-secondary")}
      empty="No periods fall within the selected fiscal year."
    />
  );
}

/** Risks and upsides as the forecast selector reports them. */
function RiskList({ rows }: { rows: RiskOpportunity[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.id}
          className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1.5 py-3.5 border-b border-subtle last:border-b-0 first:pt-0"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Badge tone={row.type === "risk" ? "negative" : "positive"}>
                {row.type === "risk" ? "Risk" : "Upside"}
              </Badge>
              <span className="text-[12.5px] text-primary truncate">{row.title}</span>
            </div>
            <p className="type-caption mt-1.5 leading-snug">
              {row.detail} · {row.confidence} confidence
            </p>
          </div>
          <span
            className={cn(
              "text-[13px] font-semibold tnum shrink-0",
              row.value >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {formatCurrency(row.value, { showSign: true, parentheses: false })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Scenarios, weighted, against plan. */
function ScenarioTable({ rows }: { rows: ScenarioRow[] }) {
  const columns: Column<ScenarioRow>[] = [
    {
      id: "name",
      header: "Scenario",
      align: "left",
      width: "32%",
      render: (row) => (
        <div className="min-w-0">
          <div className="text-[12.5px] text-primary font-medium">{row.name}</div>
          <div className="type-caption mt-0.5">{row.description}</div>
        </div>
      ),
    },
    {
      id: "probability",
      header: "Weighting",
      align: "right",
      width: "12%",
      render: (row) => formatPercentage(row.probability, { precision: 0 }),
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      width: "14%",
      groupStart: true,
      render: (row) => formatCurrency(row.revenue),
    },
    {
      id: "ebitda",
      header: "EBITDA",
      align: "right",
      width: "14%",
      render: (row) => <span className="font-medium">{formatCurrency(row.ebitda)}</span>,
    },
    {
      id: "margin",
      header: "EBITDA %",
      align: "right",
      width: "14%",
      render: (row) => formatPercentage(row.ebitdaMargin),
    },
    {
      id: "variance",
      header: "vs Plan",
      align: "right",
      width: "14%",
      groupStart: true,
      render: (row) => {
        const variance = calculateVariance(
          row.ebitda, row.ebitda - row.varianceToPlan, getMetric("ebitda"),
        );
        if (!variance) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatCurrency(row.varianceToPlan, { showSign: true, parentheses: false })}
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
      rowClassName={(row) => (row.id === "base" ? "font-medium border-t border-line" : undefined)}
      empty="No scenarios are configured for this selection."
    />
  );
}
