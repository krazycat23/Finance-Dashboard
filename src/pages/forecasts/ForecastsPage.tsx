import { useMemo, useState } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Badge } from "@/components/ui/Badge";
import { KpiCard } from "@/components/finance/KpiCard";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { TrendChart } from "@/components/charts/TrendChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { Meter } from "@/components/ui/Meter";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  selectDriverAssumptions, selectForecastAccuracy, selectForecastSeries,
  selectFullYearOutlook, selectRisksAndOpportunities, selectScenarios,
  type DriverAssumption, type RiskOpportunity, type ScenarioRow,
} from "@/domain/selectors";
import {
  formatCurrency, formatMetric, formatPercentage,
} from "@/utils/format";

/**
 * FORECASTING & PLANNING
 * ---------------------------------------------------------------------------
 * The page where the actual/forecast boundary matters most.
 *
 * The full-year number is ACTUAL-TO-DATE PLUS FORECAST-TO-GO. Reporting a pure
 * model output over periods that have already closed is the fastest way for a
 * forecast page to lose credibility, so the split is stated on the page rather
 * than buried.
 *
 * Scenario ranges are applied only to the open periods: history carries no
 * uncertainty, and widening a band across closed months would be wrong.
 */

type OutlookMeasure = "revenue" | "ebitda";

export function ForecastsPage() {
  const { selection, currentPeriod } = useFilters();
  const [measure, setMeasure] = useState<OutlookMeasure>("revenue");

  const revenueOutlook = useMemo(
    () => selectFullYearOutlook(selection, "revenue"),
    [selection],
  );
  const ebitdaOutlook = useMemo(
    () => selectFullYearOutlook(selection, "ebitda"),
    [selection],
  );
  const outlook = measure === "revenue" ? revenueOutlook : ebitdaOutlook;

  const series = useMemo(
    () => selectForecastSeries(selection, measure),
    [selection, measure],
  );
  const scenarios = useMemo(() => selectScenarios(selection), [selection]);
  const assumptions = useMemo(() => selectDriverAssumptions(selection), [selection]);
  const risks = useMemo(() => selectRisksAndOpportunities(selection), [selection]);
  const accuracy = useMemo(() => selectForecastAccuracy(selection), [selection]);

  const kpis = useMemo<KpiDatum[]>(() => {
    const build = (
      metricId: string,
      value: number,
      comparison: number | undefined,
      comparisonLabel: string,
    ): KpiDatum => {
      const metric = getMetric(metricId);
      return {
        metric,
        value,
        comparison,
        comparisonLabel,
        variance: calculateVariance(value, comparison, metric),
        series: [],
      };
    };

    const runRate =
      revenueOutlook.remainingPeriods < 12
        ? revenueOutlook.actualToDate / (12 - revenueOutlook.remainingPeriods)
        : 0;

    return [
      build("fullYearForecast", revenueOutlook.forecast, revenueOutlook.budget, "vs Plan"),
      build("ebitda", ebitdaOutlook.forecast, ebitdaOutlook.budget, "vs Plan"),
      build("revenueRunRate", runRate, revenueOutlook.priorYear / 12, "vs LY"),
      build("forecastAccuracy", accuracy, 0.95, "vs target"),
      build("forecastChange", revenueOutlook.varianceToBudget, undefined, ""),
      build("recoveryRequired", Math.max(0, -ebitdaOutlook.varianceToBudget), undefined, ""),
    ];
  }, [revenueOutlook, ebitdaOutlook, accuracy]);

  const scenarioColumns: Column<ScenarioRow>[] = [
    {
      id: "name",
      header: "Scenario",
      align: "left",
      render: (row) => (
        <div>
          <div className="text-primary font-medium">{row.name}</div>
          <div className="text-[11px] text-tertiary mt-0.5">{row.description}</div>
        </div>
      ),
    },
    { id: "probability", header: "Weighting", align: "right", render: (row) => formatPercentage(row.probability, { precision: 0 }) },
    { id: "revenue", header: "Revenue", align: "right", groupStart: true, render: (row) => formatCurrency(row.revenue) },
    { id: "ebitda", header: "EBITDA", align: "right", render: (row) => formatCurrency(row.ebitda) },
    { id: "margin", header: "EBITDA %", align: "right", render: (row) => formatPercentage(row.ebitdaMargin) },
    {
      id: "variance",
      header: "vs Plan",
      align: "right",
      groupStart: true,
      render: (row) => {
        const variance = calculateVariance(
          row.ebitda, row.ebitda - row.varianceToPlan, getMetric("ebitda"),
        );
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatCurrency(row.varianceToPlan, { showSign: true, parentheses: false })}
          </VarianceValue>
        );
      },
    },
  ];

  const assumptionColumns: Column<DriverAssumption>[] = [
    { id: "driver", header: "Driver", align: "left", render: (row) => row.driver },
    { id: "basis", header: "Basis", align: "left", render: (row) => <span className="text-secondary">{row.basis}</span> },
    {
      id: "current",
      header: "Achieved",
      align: "right",
      groupStart: true,
      render: (row) => formatAssumption(row.current, row.format),
    },
    {
      id: "assumed",
      header: "Assumed",
      align: "right",
      render: (row) => formatAssumption(row.assumed, row.format),
    },
    {
      id: "delta",
      header: "Movement",
      align: "right",
      render: (row) => {
        const variance = calculateVariance(row.assumed, row.current, {
          favourableDirection: "up",
        });
        if (!variance) return "—";
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

  const riskColumns: Column<RiskOpportunity>[] = [
    {
      id: "title",
      header: "Item",
      align: "left",
      render: (row) => (
        <div className="flex items-start gap-2">
          <Badge tone={row.type === "risk" ? "negative" : "positive"}>
            {row.type === "risk" ? "Risk" : "Upside"}
          </Badge>
          <div className="min-w-0">
            <div className="text-primary">{row.title}</div>
            <div className="text-[11px] text-tertiary mt-0.5">{row.detail}</div>
          </div>
        </div>
      ),
    },
    { id: "confidence", header: "Confidence", align: "left", render: (row) => <span className="text-secondary">{row.confidence}</span> },
    {
      id: "value",
      header: "EBITDA impact",
      align: "right",
      render: (row) => (
        <span className={row.value >= 0 ? "text-positive" : "text-negative"}>
          {formatCurrency(row.value, { showSign: true, parentheses: false })}
        </span>
      ),
    },
  ];

  const completion =
    revenueOutlook.forecast === 0
      ? 0
      : revenueOutlook.actualToDate / revenueOutlook.forecast;

  return (
    <>
      <PageHeader
        eyebrow="Forecasting & Planning"
        title="Forecast and full-year outlook."
        subtitle="Full-year outlook built from actuals to date plus forecast to go, with scenarios, assumptions and the risks around them."
      />

      <PageSections>
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((datum) => (
            <KpiCard key={datum.metric.id} datum={datum} />
          ))}
        </div>

        <Panel flush>
          <PanelHeader
            title="Actual against forecast and plan"
            meta={currentPeriod.fiscalYear}
            description={`${revenueOutlook.remainingPeriods} of 12 periods remain open. Closed periods show actuals; open periods show the current reforecast.`}
            actions={
              <SegmentedControl
                aria-label="Outlook measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: "revenue", label: "Revenue" },
                  { value: "ebitda", label: "EBITDA" },
                ]}
              />
            }
          />
          <PanelBody>
            <TrendChart
              data={series.map((point) => ({
                period: point.period,
                actual: point.actual,
                budget: point.budget,
                forecast: point.forecast,
                priorYear: point.priorYear,
              }))}
              height={268}
              showForecast
              showPriorYear={false}
            />
          </PanelBody>
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Full-year composition"
              meta={getMetric(measure === "revenue" ? "revenue" : "ebitda").name}
              description="What the full-year number is actually made of."
            />
            <PanelBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <CompositionRow
                  label="Actual to date"
                  value={outlook.actualToDate}
                  total={outlook.forecast}
                  tone="accent"
                />
                <CompositionRow
                  label={`Forecast to go (${outlook.remainingPeriods} periods)`}
                  value={outlook.forecastRemaining}
                  total={outlook.forecast}
                  tone="neutral"
                />
              </div>
              <div className="border-t border-subtle pt-3 flex flex-col gap-2.5">
                <SummaryRow label="Full-year forecast" value={formatCurrency(outlook.forecast)} strong />
                <SummaryRow label="Plan" value={formatCurrency(outlook.budget)} />
                <SummaryRow label="Last year" value={formatCurrency(outlook.priorYear)} />
                <SummaryRow
                  label="Variance to plan"
                  value={formatCurrency(outlook.varianceToBudget, { showSign: true, parentheses: false })}
                  tone={outlook.varianceToBudget >= 0 ? "positive" : "negative"}
                />
              </div>
              <p className="text-[11px] text-tertiary leading-snug">
                {formatPercentage(completion)} of the full-year revenue forecast is
                already banked as actuals. The scenario range below applies only to
                the periods still open.
              </p>
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Scenario comparison"
              meta="Applied to forecast-to-go only"
              description="Closed periods are identical across every scenario."
            />
            <PanelBody>
              <DataTable
                columns={scenarioColumns}
                rows={scenarios}
                rowKey={(row) => row.id}
                rowClassName={(row) => (row.id === "base" ? "bg-inset/40 font-medium" : undefined)}
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel flush>
            <PanelHeader
              title="Driver assumptions"
              description="What has to be true for the forecast to land."
            />
            <PanelBody>
              <DataTable
                columns={assumptionColumns}
                rows={assumptions}
                rowKey={(row) => row.id}
                minWidth={460}
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Risks and opportunities"
              meta={`Net ${formatCurrency(risks.reduce((s, r) => s + r.value, 0), { showSign: true, parentheses: false })}`}
            />
            <PanelBody>
              <DataTable
                columns={riskColumns}
                rows={risks}
                rowKey={(row) => row.id}
                minWidth={460}
              />
            </PanelBody>
          </Panel>
        </div>
      </PageSections>
    </>
  );
}

function CompositionRow({
  label, value, total, tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "accent" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-secondary">{label}</span>
        <span className="text-[12.5px] text-primary tnum font-medium">
          {formatCurrency(value)}
        </span>
      </div>
      <Meter value={value} max={total} tone={tone} />
    </div>
  );
}

function SummaryRow({
  label, value, strong, tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-[12px] ${strong ? "text-primary font-medium" : "text-secondary"}`}>
        {label}
      </span>
      <span
        className={`text-[12.5px] tnum ${
          tone === "positive" ? "text-positive"
          : tone === "negative" ? "text-negative"
          : "text-primary"
        } ${strong ? "font-semibold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatAssumption(value: number, format: DriverAssumption["format"]): string {
  if (format === "percentage") return formatPercentage(value);
  if (format === "currency") return formatCurrency(value);
  return formatMetric(value, getMetric("units"));
}
