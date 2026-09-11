import { useMemo, useState } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KpiCard } from "@/components/finance/KpiCard";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { RankedBarList, type RankedItem } from "@/components/finance/RankedBarList";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  selectBudgetBridge, selectComparableBudget, selectCostComposition,
  selectEbitdaBridge, selectEntityPerformance, selectFullYearOutlook, selectLines,
  selectPriceVolumeMix, selectTopVariances, type CostCategoryTotal,
  type EntityPerformance,
} from "@/domain/selectors";
import { formatCurrency, formatPercentage } from "@/utils/format";

/**
 * VARIANCE & DRIVER ANALYSIS
 * ---------------------------------------------------------------------------
 * Every variance on this page is SIGNED SO THAT POSITIVE IS FAVOURABLE,
 * whatever the line. An overspend on costs is negative; an underspend is
 * positive. Without that convention a variance page forces the reader to work
 * out the sign convention line by line, which is where mistakes come from.
 *
 * The budget comparison is restricted to closed periods — comparing nine months
 * of actual against a twelve-month plan is the most common variance error in
 * management reporting, and the selector layer prevents it.
 */

type BridgeBasis = "budget" | "priorYear";

export function VariancePage() {
  const { selection, currentPeriod } = useFilters();
  const [bridgeBasis, setBridgeBasis] = useState<BridgeBasis>("budget");

  const lines = useMemo(() => selectLines(selection), [selection]);
  const budget = useMemo(() => selectComparableBudget(selection), [selection]);
  // The toggle changes which bridge is built, not just its caption.
  const bridge = useMemo(
    () =>
      bridgeBasis === "budget"
        ? selectBudgetBridge(selection)
        : selectEbitdaBridge(selection),
    [selection, bridgeBasis],
  );
  const pvm = useMemo(() => selectPriceVolumeMix(selection), [selection]);
  const topVariances = useMemo(() => selectTopVariances(selection), [selection]);
  const costs = useMemo(() => selectCostComposition(selection), [selection]);
  const entities = useMemo(() => selectEntityPerformance(selection), [selection]);
  const outlook = useMemo(() => selectFullYearOutlook(selection, "ebitda"), [selection]);

  const kpis = useMemo<KpiDatum[]>(() => {
    const build = (
      metricId: string,
      actual: number,
      comparison: number,
      inverse = false,
    ): KpiDatum => {
      const metric = getMetric(metricId);
      // Signed favourable-positive: on a cost line the variance is the
      // UNDERSPEND, so the subtraction is reversed.
      const value = inverse ? comparison - actual : actual - comparison;
      return {
        metric,
        value,
        comparison: 0,
        comparisonLabel: "vs Plan",
        variance: calculateVariance(value, 0, { favourableDirection: "up" }),
        series: [],
      };
    };

    const recovery = Math.max(0, -outlook.varianceToBudget);

    return [
      build("revenue", lines.actual.revenue ?? 0, budget.revenue ?? 0),
      build("grossProfit", lines.actual.grossProfit ?? 0, budget.grossProfit ?? 0),
      build("operatingCosts", lines.actual.operatingCosts ?? 0, budget.operatingCosts ?? 0, true),
      build("ebitda", lines.actual.ebitda ?? 0, budget.ebitda ?? 0),
      {
        metric: getMetric("forecastChange"),
        value: outlook.varianceToBudget,
        comparison: 0,
        comparisonLabel: "full year vs plan",
        variance: calculateVariance(outlook.varianceToBudget, 0, { favourableDirection: "up" }),
        series: [],
      },
      {
        metric: getMetric("recoveryRequired"),
        value: recovery,
        comparison: 0,
        comparisonLabel: `over ${outlook.remainingPeriods} periods`,
        variance: calculateVariance(recovery, 0, { favourableDirection: "down" }),
        series: [],
      },
    ];
  }, [lines, budget, outlook]);

  const varianceItems = useMemo<RankedItem[]>(
    () =>
      topVariances.map((item) => ({
        id: item.label,
        label: item.label,
        value: item.variance,
        display: formatCurrency(item.variance, { showSign: true, parentheses: false }),
        secondary:
          item.budget === 0
            ? undefined
            : formatPercentage(item.variance / Math.abs(item.budget), { showSign: true }),
        secondaryTone: item.variance >= 0 ? "positive" : "negative",
      })),
    [topVariances],
  );

  const pvmData = useMemo(
    () =>
      pvm.map((component) => ({
        id: component.label,
        label: component.label,
        value: component.value,
      })),
    [pvm],
  );

  const costColumns: Column<CostCategoryTotal>[] = [
    { id: "category", header: "Cost category", align: "left", render: (row) => row.name },
    { id: "actual", header: "Actual", align: "right", groupStart: true, render: (row) => formatCurrency(row.actual) },
    { id: "budget", header: "Budget", align: "right", render: (row) => formatCurrency(row.budget) },
    {
      id: "variance",
      header: "Variance",
      align: "right",
      render: (row) => {
        const variance = calculateVariance(row.variance, 0, { favourableDirection: "up" });
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatCurrency(row.variance, { showSign: true, parentheses: false })}
          </VarianceValue>
        );
      },
    },
    {
      id: "variance-pct",
      header: "Var %",
      align: "right",
      render: (row) => {
        if (row.budget === 0) return "—";
        const relative = row.variance / row.budget;
        const variance = calculateVariance(relative, 0, { favourableDirection: "up" });
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(relative, { showSign: true })}
          </VarianceValue>
        );
      },
    },
    { id: "ly", header: "Last year", align: "right", groupStart: true, render: (row) => formatCurrency(row.priorYear) },
    { id: "share", header: "Share", align: "right", render: (row) => formatPercentage(row.share) },
  ];

  const entityColumns: Column<EntityPerformance>[] = [
    { id: "entity", header: "Business unit", align: "left", render: (row) => row.name },
    { id: "revenue", header: "Revenue", align: "right", groupStart: true, render: (row) => formatCurrency(row.revenue) },
    {
      id: "revenue-growth",
      header: "vs LY",
      align: "right",
      render: (row) => {
        const variance = calculateVariance(row.revenueGrowth ?? 0, 0, { favourableDirection: "up" });
        if (row.revenueGrowth === undefined || !variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.revenueGrowth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
    { id: "ebitda", header: "EBITDA", align: "right", groupStart: true, render: (row) => formatCurrency(row.ebitda) },
    { id: "ebitda-margin", header: "EBITDA %", align: "right", render: (row) => formatPercentage(row.ebitdaMargin) },
    {
      id: "ebitda-growth",
      header: "vs LY",
      align: "right",
      render: (row) => {
        const variance = calculateVariance(row.ebitdaGrowth ?? 0, 0, { favourableDirection: "up" });
        if (row.ebitdaGrowth === undefined || !variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.ebitdaGrowth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
  ];

  /**
   * Driver tree: the chain from revenue variance through margin to EBITDA.
   * Shown as nested rows rather than a graphical tree — at this density a tree
   * diagram costs space without adding information.
   */
  const driverTree = useMemo(() => {
    const revenueVariance = (lines.actual.revenue ?? 0) - (budget.revenue ?? 0);
    const cogsVariance = (budget.costOfSales ?? 0) - (lines.actual.costOfSales ?? 0);
    const gpVariance = (lines.actual.grossProfit ?? 0) - (budget.grossProfit ?? 0);
    const opexVariance = (budget.operatingCosts ?? 0) - (lines.actual.operatingCosts ?? 0);
    const ebitdaVariance = (lines.actual.ebitda ?? 0) - (budget.ebitda ?? 0);

    return [
      { id: "revenue", label: "Revenue", depth: 1, value: revenueVariance },
      { id: "cogs", label: "Cost of sales", depth: 1, value: cogsVariance },
      { id: "gp", label: "Gross profit", depth: 0, value: gpVariance, emphasis: true },
      { id: "opex", label: "Operating costs", depth: 1, value: opexVariance },
      { id: "ebitda", label: "EBITDA", depth: 0, value: ebitdaVariance, emphasis: true },
    ];
  }, [lines, budget]);

  return (
    <>
      <PageHeader
        eyebrow="Variance Analysis"
        title="Variance and driver analysis."
        subtitle="Where performance diverged from plan and from last year, decomposed into the drivers that caused it."
      />

      <PageSections>
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((datum, index) => (
            <KpiCard key={`${datum.metric.id}-${index}`} datum={datum} />
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title={bridgeBasis === "budget" ? "Budget to actual bridge" : "Year-on-year EBITDA bridge"}
              meta={`EBITDA · ${selection.basis} ${currentPeriod.label}`}
              description={
                bridgeBasis === "budget"
                  ? "Budget restricted to closed periods, so the comparison is like for like."
                  : "Movement against the prior-year comparative, decomposed into its drivers."
              }
              actions={
                <SegmentedControl
                  aria-label="Bridge basis"
                  value={bridgeBasis}
                  onChange={setBridgeBasis}
                  options={[
                    { value: "budget", label: "vs Plan" },
                    { value: "priorYear", label: "vs LY" },
                  ]}
                />
              }
            />
            <PanelBody>
              <WaterfallChart steps={bridge} height={252} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Price, volume and mix"
              meta="Revenue movement vs last year"
              description="An exact three-way split: the components sum to the revenue movement."
            />
            <PanelBody>
              <ColumnChart
                data={pvmData}
                height={252}
                divergent
                valueLabel="Effect"
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Largest variances to plan"
              meta="Favourable positive"
            />
            <PanelBody>
              <RankedBarList items={varianceItems} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Driver tree"
              meta="Variance to plan"
              description="How the revenue and cost variances combine into the EBITDA variance."
            />
            <PanelBody>
              <ul className="flex flex-col">
                {driverTree.map((node) => {
                  const variance = calculateVariance(node.value, 0, { favourableDirection: "up" });
                  return (
                    <li
                      key={node.id}
                      className={`flex items-baseline justify-between gap-4 py-2.5 border-b border-subtle last:border-b-0 ${
                        node.emphasis ? "font-semibold" : ""
                      }`}
                      style={{ paddingLeft: node.depth * 14 }}
                    >
                      <span className={node.emphasis ? "text-[12.5px] text-primary" : "text-[12px] text-secondary"}>
                        {node.label}
                      </span>
                      {variance && (
                        <VarianceValue variance={variance} size="sm">
                          {formatCurrency(node.value, { showSign: true, parentheses: false })}
                        </VarianceValue>
                      )}
                    </li>
                  );
                })}
              </ul>
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel flush>
            <PanelHeader title="Operating cost variances" meta={`${selection.basis} ${currentPeriod.label}`} />
            <PanelBody>
              <DataTable
                columns={costColumns}
                rows={costs}
                rowKey={(row) => row.id}
                minWidth={560}
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader title="Business unit movements" meta={`${selection.basis} ${currentPeriod.label}`} />
            <PanelBody>
              <DataTable
                columns={entityColumns}
                rows={entities}
                rowKey={(row) => row.id}
                minWidth={560}
              />
            </PanelBody>
          </Panel>
        </div>
      </PageSections>
    </>
  );
}
