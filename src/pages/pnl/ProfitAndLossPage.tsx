import { useMemo } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { KpiStrip } from "@/components/finance/KpiCard";
import { RankedBarList, type RankedItem } from "@/components/finance/RankedBarList";
import { TrendChart } from "@/components/charts/TrendChart";
import { CompositionChart } from "@/components/charts/CompositionChart";
import { StatementTable } from "@/components/tables/StatementTable";
import {
  periodsForBasis, selectCostComposition, selectKpis, selectMetricSeries,
  selectProfitAndLoss, selectTopVariances,
} from "@/domain/selectors";
import { formatCurrency, formatPercentage } from "@/utils/format";

/**
 * PROFIT & LOSS
 * ---------------------------------------------------------------------------
 * The detailed statement, its trend, where the cost base sits, and where it
 * diverged from plan. Every figure comes from the same selectors the Overview
 * uses, so the summary and the detail cannot disagree.
 */

const PNL_KPIS = [
  "revenue", "grossProfit", "ebitda", "ebit", "netProfit", "operatingCosts",
];

export function ProfitAndLossPage() {
  return useReportingDataset().source === "demo" ? <DemoProfitAndLossPage/> : <ConfiguredReporting mode="pnl"/>;
}
function DemoProfitAndLossPage() {
  const { selection, currentPeriod } = useFilters();

  const kpis = useMemo(() => selectKpis(PNL_KPIS, selection), [selection]);
  const rows = useMemo(() => selectProfitAndLoss(selection), [selection]);
  const costs = useMemo(() => selectCostComposition(selection), [selection]);
  const variances = useMemo(() => selectTopVariances(selection), [selection]);

  const trend = useMemo(() => {
    const periods = periodsForBasis("R12", selection.periodId);
    return selectMetricSeries("ebitda", periods, selection.entityId);
  }, [selection]);

  const costSlices = useMemo(
    () =>
      costs.map((cost) => ({
        id: cost.id,
        label: cost.name,
        value: cost.actual,
        comparison: formatCurrency(cost.variance, { showSign: true, parentheses: false }),
        comparisonTone:
          cost.variance >= 0 ? ("positive" as const) : ("negative" as const),
      })),
    [costs],
  );

  const varianceItems = useMemo<RankedItem[]>(
    () =>
      variances.map((item) => ({
        id: item.label,
        label: item.label,
        value: item.variance,
        display: formatCurrency(item.variance, { showSign: true, parentheses: false }),
        secondary:
          item.budget === 0
            ? undefined
            : formatPercentage(Math.abs(item.variance / item.budget), { showSign: false }),
        secondaryTone: item.variance >= 0 ? "positive" : "negative",
      })),
    [variances],
  );

  return (
    <>
      <PageHeader
        eyebrow="Profit & Loss"
        title="Profit and loss performance."
        subtitle="A detailed view of the profit and loss, with actuals, budget, variance and year-on-year comparison."
      />

      <PageSections>
        <KpiStrip data={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Monthly EBITDA"
              meta="Rolling 12 months"
              description="Actual against last year, with plan as a reference line."
            />
            <PanelBody>
              <TrendChart data={trend} height={232} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Operating cost composition"
              meta={`${formatCurrency(costs.reduce((s, c) => s + c.actual, 0))} total`}
            />
            <PanelBody>
              {/* Ranked magnitude, so a sequential ramp rather than categorical hues. */}
              <CompositionChart slices={costSlices} mode="sequential" height={186} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Largest variances to budget"
              meta="Favourable positive"
              description="Signed so that a positive figure is favourable on every line, including costs."
            />
            <PanelBody>
              <RankedBarList items={varianceItems} />
            </PanelBody>
          </Panel>
        </div>

        <Panel flush>
          <PanelHeader
            title="Profit and loss statement"
            meta={`$'000 · ${selection.basis} ${currentPeriod.label}`}
          />
          <PanelBody>
            <StatementTable
              rows={rows}
              actualLabel={`${selection.basis} ${currentPeriod.label}`}
              columnSet="full"
              scale="thousands"
            />
          </PanelBody>
        </Panel>
      </PageSections>
    </>
  );
}
