import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KpiStrip } from "@/components/finance/KpiCard";
import { InsightList } from "@/components/finance/InsightList";
import { RankedBarList, type RankedItem } from "@/components/finance/RankedBarList";
import { WeeklyTrendChart } from "@/components/charts/WeeklyTrendChart";
import { CompositionChart } from "@/components/charts/CompositionChart";
import { HeatGrid, type HeatRow } from "@/components/charts/HeatGrid";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import {
  selectBreakdown, selectInsights, selectKpis, selectMonthlyByDimension,
  selectPriorYearSalesTotals, selectSalesTotals, selectWeeklySales,
  type DimensionBreakdown,
} from "@/domain/selectors";
import { formatCurrency, formatNumber, formatPercentage } from "@/utils/format";

/**
 * SALES PERFORMANCE
 * ---------------------------------------------------------------------------
 * Commercial view of the same revenue the P&L reports — both read the same
 * sales facts, so the two pages cannot disagree about the top line.
 */

const SALES_KPIS = [
  "totalSales", "likeForLikeSales", "averageTransactionValue",
  "units", "conversion", "orders",
];

type ProductMeasure = "revenue" | "grossProfit" | "units";

export function SalesPage() {
  return useReportingDataset().source === "demo" ? <DemoSalesPage/> : <ConfiguredReporting mode="sales"/>;
}
function DemoSalesPage() {
  const { selection, currentPeriod } = useFilters();
  const [productMeasure, setProductMeasure] = useState<ProductMeasure>("revenue");

  const kpis = useMemo(() => selectKpis(SALES_KPIS, selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "sales"), [selection]);
  const weekly = useMemo(() => selectWeeklySales(selection, 52), [selection]);
  const channels = useMemo(() => selectBreakdown(selection, "channelId"), [selection]);
  const products = useMemo(() => selectBreakdown(selection, "productId"), [selection]);
  const totals = useMemo(() => selectSalesTotals(selection), [selection]);
  const priorTotals = useMemo(() => selectPriorYearSalesTotals(selection), [selection]);

  const regionGrid = useMemo<HeatRow[]>(() => {
    const rows = selectMonthlyByDimension(selection, "locationId");
    return rows.map((row) => ({
      id: row.id,
      label: row.name,
      cells: row.months.map((month) => ({
        id: month.period.id,
        label: month.period.shortLabel,
        value: month.growth,
      })),
      total: row.total,
    }));
  }, [selection]);

  const channelSlices = useMemo(
    () =>
      channels.map((channel) => ({
        id: channel.id,
        label: channel.name,
        value: channel.revenue,
        comparison:
          channel.growth === undefined
            ? undefined
            : formatPercentage(channel.growth, { showSign: true }),
        comparisonTone:
          (channel.growth ?? 0) >= 0 ? ("positive" as const) : ("negative" as const),
      })),
    [channels],
  );

  const productItems = useMemo<RankedItem[]>(() => {
    const rows = products.map((product): RankedItem => {
      const value =
        productMeasure === "revenue" ? product.revenue
        : productMeasure === "grossProfit" ? product.grossProfit
        : product.units;
      return {
        id: product.id,
        label: product.name,
        value,
        display:
          productMeasure === "units"
            ? formatNumber(value, { scale: "thousands", precision: 1 })
            : formatCurrency(value),
        secondary:
          product.growth === undefined
            ? undefined
            : formatPercentage(product.growth, { showSign: true }),
        secondaryTone: (product.growth ?? 0) >= 0 ? "positive" : "negative",
      };
    });
    return rows.sort((a, b) => b.value - a.value);
  }, [products, productMeasure]);

  const lflGrowth =
    totals.likeForLikePriorYear > 0
      ? totals.likeForLike / totals.likeForLikePriorYear - 1
      : undefined;

  const channelColumns = useMemo<Column<DimensionBreakdown>[]>(() => {
    const revenueMetric = getMetric("totalSales");
    const cell = (value: number, comparison: number) => {
      const variance = calculateVariance(value, comparison, revenueMetric);
      if (!variance) return <span className="text-tertiary">—</span>;
      return (
        <VarianceValue variance={variance} size="sm" showGlyph={false}>
          {variance.relative === undefined
            ? "—"
            : formatPercentage(variance.relative, { showSign: true })}
        </VarianceValue>
      );
    };

    return [
      { id: "channel", header: "Channel", align: "left", render: (row) => row.name },
      { id: "revenue", header: "Actual", align: "right", render: (row) => formatCurrency(row.revenue) },
      { id: "budget", header: "Budget", align: "right", groupStart: true, render: (row) => formatCurrency(row.budgetRevenue) },
      { id: "vs-budget", header: "vs Budget", align: "right", render: (row) => cell(row.revenue, row.budgetRevenue) },
      { id: "ly", header: "Last year", align: "right", groupStart: true, render: (row) => formatCurrency(row.priorYearRevenue) },
      { id: "vs-ly", header: "vs LY", align: "right", render: (row) => cell(row.revenue, row.priorYearRevenue) },
      { id: "share", header: "Share", align: "right", groupStart: true, render: (row) => formatPercentage(row.share) },
      { id: "margin", header: "Gross margin", align: "right", render: (row) => formatPercentage(row.grossMargin) },
    ];
  }, []);

  const channelTotal = useMemo<DimensionBreakdown>(
    () => ({
      id: "total",
      name: "Total",
      revenue: totals.revenue,
      grossProfit: totals.grossProfit,
      grossMargin: totals.grossMargin,
      units: totals.units,
      share: 1,
      priorYearRevenue: priorTotals.revenue,
      budgetRevenue: totals.budgetRevenue,
      growth: priorTotals.revenue ? totals.revenue / priorTotals.revenue - 1 : undefined,
    }),
    [totals, priorTotals],
  );

  return (
    <>
      <PageHeader
        eyebrow="Sales Performance"
        title="Sales performance and growth drivers."
        subtitle="Channel, category and regional performance, with like-for-like trading and variance to plan."
      />

      <PageSections>
        <KpiStrip data={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Weekly sales trend"
              meta="Last 52 trading weeks"
              description="Closed weeks only, against last year and plan."
            />
            <PanelBody>
              <WeeklyTrendChart data={weekly} height={262} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Channel mix"
              meta={`${selection.basis} ${currentPeriod.label}`}
            />
            <PanelBody>
              <CompositionChart
                slices={channelSlices}
                mode="categorical"
                centreValue={formatCurrency(totals.revenue)}
                centreLabel="Total sales"
                height={196}
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel flush>
            <PanelHeader
              title="Key sales insights"
              meta={lflGrowth === undefined ? undefined : `LFL ${formatPercentage(lflGrowth, { showSign: true })}`}
            />
            <PanelBody>
              <InsightList insights={insights} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Performance by category"
              actions={
                <SegmentedControl
                  aria-label="Category measure"
                  value={productMeasure}
                  onChange={setProductMeasure}
                  options={[
                    { value: "revenue", label: "Sales" },
                    { value: "grossProfit", label: "GP" },
                    { value: "units", label: "Units" },
                  ]}
                />
              }
            />
            <PanelBody>
              <RankedBarList items={productItems} showIndex />
            </PanelBody>
          </Panel>
        </div>

        <Panel flush>
          <PanelHeader
            title="Sales by region"
            meta="Growth vs last year"
            description="Each cell shows the year-on-year movement in that month; the scale is shown beneath."
          />
          <PanelBody>
            <HeatGrid rows={regionGrid} totalLabel={selection.basis} />
          </PanelBody>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Sales by channel"
            meta={`${selection.basis} ${currentPeriod.label}`}
          />
          <PanelBody>
            <DataTable
              columns={channelColumns}
              rows={[...channels, channelTotal]}
              rowKey={(row) => row.id}
              rowClassName={(row) =>
                row.id === "total" ? "font-semibold border-t-2 border-strong bg-inset/40" : undefined
              }
            />
          </PanelBody>
        </Panel>
      </PageSections>
    </>
  );
}
