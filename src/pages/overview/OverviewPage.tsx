import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader, } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KpiStrip } from "@/components/finance/KpiCard";
import { InsightList } from "@/components/finance/InsightList";
import { RankedBarList, type RankedItem } from "@/components/finance/RankedBarList";
import { TrendChart } from "@/components/charts/TrendChart";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { StatementTable } from "@/components/tables/StatementTable";
import {
  periodsForBasis, selectBalanceSheet, selectCashFlowRows, selectEbitdaBridge,
  selectEntityPerformance, selectInsights, selectKpis, selectMetricSeries,
  selectProfitAndLoss,
} from "@/domain/selectors";
import { formatBasisPoints, formatCurrency, formatPercentage } from "@/utils/format";

/**
 * EXECUTIVE OVERVIEW
 * ---------------------------------------------------------------------------
 * The page a CFO opens first. Composed entirely from shared primitives — it
 * contains no chart code, no formatting and no arithmetic of its own.
 *
 * Structure follows how the question is actually asked:
 *   where are we      -> KPI strip
 *   what happened     -> revenue trend
 *   why               -> EBITDA bridge
 *   what should I know-> insights and outliers
 *   show me           -> the statements
 */

const OVERVIEW_KPIS = [
  "revenue", "grossProfit", "grossMargin", "ebitda", "netProfit", "cash",
];

type RankMetric = "revenue" | "margin" | "ebitda";
type StatementTab = "pnl" | "balance" | "cashflow";

export function OverviewPage() {
  const dataset = useReportingDataset();
  return dataset.source === "demo" ? <DemoOverviewPage/> : <ConfiguredReporting mode="overview"/>;
}
function DemoOverviewPage() {
  const { selection, currentPeriod } = useFilters();
  const [rankMetric, setRankMetric] = useState<RankMetric>("revenue");
  const [statementTab, setStatementTab] = useState<StatementTab>("pnl");

  const kpis = useMemo(() => selectKpis(OVERVIEW_KPIS, selection), [selection]);
  const insights = useMemo(() => selectInsights(selection), [selection]);
  const bridge = useMemo(() => selectEbitdaBridge(selection), [selection]);

  // The revenue trend uses a rolling twelve months rather than the reporting
  // basis: a nine-month year-to-date makes a thin chart, and the trailing year
  // is the shape an executive is actually looking for.
  const trend = useMemo(() => {
    const periods = periodsForBasis("R12", selection.periodId);
    return selectMetricSeries("revenue", periods, selection.entityId);
  }, [selection]);

  const entityPerformance = useMemo(
    () => selectEntityPerformance(selection),
    [selection],
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

  const pnlRows = useMemo(() => selectProfitAndLoss(selection), [selection]);
  const balanceRows = useMemo(() => selectBalanceSheet(selection), [selection]);
  const cashRows = useMemo(() => selectCashFlowRows(selection), [selection]);

  const statementRows =
    statementTab === "pnl" ? pnlRows : statementTab === "balance" ? balanceRows : cashRows;

  return (
    <>
      <PageHeader
        eyebrow="Executive Overview"
        title="Commercial performance at a glance."
        subtitle="Key financial and operational metrics, with year-to-date performance and variance to plan."
      />

      <PageSections>
        <KpiStrip data={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Revenue trend"
              meta="Rolling 12 months"
              description="Actual against last year, with plan shown as a reference line."
            />
            <PanelBody>
              <TrendChart data={trend} height={262} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="EBITDA bridge"
              meta={`${currentPeriod.fiscalYear} vs last year`}
              description="Movement decomposed into volume, price, input cost and operating cost."
            />
            <PanelBody>
              <WaterfallChart steps={bridge} height={262} />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader title="Key highlights" meta="Generated from reported results" />
            <PanelBody>
              <InsightList insights={insights} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Performance by business unit"
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
            />
            <PanelBody>
              <RankedBarList items={rankedItems} showIndex />
            </PanelBody>
          </Panel>
        </div>

        <Panel flush>
          <PanelHeader
            title="Financial summary"
            meta={`${formatScale()} · ${currentPeriod.label}`}
            actions={
              <SegmentedControl
                aria-label="Statement"
                value={statementTab}
                onChange={setStatementTab}
                options={[
                  { value: "pnl", label: "P&L" },
                  { value: "balance", label: "Balance Sheet" },
                  { value: "cashflow", label: "Cash Flow" },
                ]}
              />
            }
          />
          <PanelBody>
            <StatementTable
              rows={statementRows}
              actualLabel={`${selection.basis} ${currentPeriod.label}`}
              columnSet={statementTab === "cashflow" ? "budgetOnly" : "full"}
              scale="thousands"
            />
          </PanelBody>
        </Panel>
      </PageSections>
    </>
  );
}

/** Statement tables are presented in thousands; the caption says so once. */
function formatScale(): string {
  return "$'000";
}
