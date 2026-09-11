import { useMemo } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { KpiStrip } from "@/components/finance/KpiCard";
import { InsightList } from "@/components/finance/InsightList";
import { RatioList, type RatioItem } from "@/components/finance/RatioList";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { StatementTable } from "@/components/tables/StatementTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import {
  periodsForBasis, selectCashBridge, selectCashFlow, selectCashFlowRows,
  selectCashTrend, selectInsights, selectKpis, selectLines,
  selectWorkingCapitalDays,
} from "@/domain/selectors";
import { formatCurrency, formatDays, formatMetric, formatPercentage } from "@/utils/format";

/**
 * CASH FLOW & WORKING CAPITAL
 * ---------------------------------------------------------------------------
 * Two cross-page contracts are honoured here rather than re-derived:
 *
 *   - working-capital days come from selectWorkingCapitalDays, the same call
 *     the Balance Sheet page makes
 *   - closing cash in the bridge is the same balance the Balance Sheet prints
 *
 * The receivables ageing is split from the reported receivables balance, so
 * the buckets total to the figure on the Balance Sheet instead of being an
 * independent set of plausible-looking numbers.
 */

const CASH_KPIS = [
  "operatingCashFlow", "freeCashFlow", "cashConversionCycle", "dso", "dpo", "dio",
];

/** Ageing profile, applied to the reported receivables balance. */
const AGEING_PROFILE = [
  { id: "current", label: "Current (0–30)", share: 0.58 },
  { id: "30-60", label: "31–60 days", share: 0.23 },
  { id: "60-90", label: "61–90 days", share: 0.1 },
  { id: "90-plus", label: "91+ days", share: 0.09 },
];

interface AgeingBucket {
  id: string;
  label: string;
  amount: number;
  share: number;
}

export function CashFlowPage() {
  const { selection, currentPeriod } = useFilters();

  const kpis = useMemo(() => selectKpis(CASH_KPIS, selection), [selection]);
  const cash = useMemo(() => selectCashFlow(selection), [selection]);
  const bridge = useMemo(() => selectCashBridge(selection), [selection]);
  const rows = useMemo(() => selectCashFlowRows(selection), [selection]);
  const days = useMemo(() => selectWorkingCapitalDays(selection), [selection]);
  const lines = useMemo(() => selectLines(selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "cash"), [selection]);

  const trend = useMemo(() => {
    const periods = periodsForBasis("FY", selection.periodId);
    return selectCashTrend(periods, selection.entityId).map((point) => ({
      period: point.period,
      actual: point.actual,
      budget: point.budget,
      forecast: point.forecast,
    }));
  }, [selection]);

  const daysChart = useMemo(
    () => [
      { id: "dso", label: "DSO", value: days.dso, comparison: days.priorYear.dso },
      { id: "dio", label: "Inventory days", value: days.dio, comparison: days.priorYear.dio },
      { id: "dpo", label: "DPO", value: days.dpo, comparison: days.priorYear.dpo },
    ],
    [days],
  );

  const ageing = useMemo<AgeingBucket[]>(() => {
    const receivables = lines.actual.tradeReceivables ?? 0;
    return AGEING_PROFILE.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      amount: receivables * bucket.share,
      share: bucket.share,
    }));
  }, [lines]);

  const ageingTotal = useMemo(
    () => ageing.reduce((sum, bucket) => sum + bucket.amount, 0),
    [ageing],
  );

  const ageingColumns: Column<AgeingBucket>[] = [
    { id: "bucket", header: "Ageing bucket", align: "left", render: (row) => row.label },
    { id: "amount", header: "Amount", align: "right", render: (row) => formatCurrency(row.amount) },
    { id: "share", header: "% of total", align: "right", render: (row) => formatPercentage(row.share) },
    {
      id: "bar",
      header: "",
      align: "left",
      width: "30%",
      render: (row) => <Meter value={row.share} max={0.6} />,
    },
  ];

  const conversionItems = useMemo<RatioItem[]>(() => {
    const ccc = getMetric("cashConversionCycle");
    const revenue = lines.actual.revenue ?? 0;
    return [
      {
        id: "conversion",
        label: "EBITDA to operating cash conversion",
        display: formatPercentage(cash.ebitda ? cash.operatingCashFlow / cash.ebitda : 0),
        meter: { value: cash.ebitda ? cash.operatingCashFlow / cash.ebitda : 0, max: 1 },
      },
      { id: "capex", label: "Capital expenditure", display: formatCurrency(cash.capex) },
      {
        id: "capex-ratio",
        label: "Capex as a share of revenue",
        display: formatPercentage(revenue ? cash.capex / revenue : 0),
      },
      { id: "dividends", label: "Dividends paid", display: formatCurrency(cash.dividends) },
      {
        id: "ccc",
        label: ccc.name,
        display: formatMetric(days.cashConversionCycle, ccc),
        variance: calculateVariance(
          days.cashConversionCycle, days.priorYear.cashConversionCycle, ccc,
        ),
        varianceDisplay: formatDays(
          days.cashConversionCycle - days.priorYear.cashConversionCycle,
          { showSign: true, parentheses: false },
        ),
        comparisonLabel: "vs LY",
      },
    ];
  }, [cash, days, lines]);

  return (
    <>
      <PageHeader
        eyebrow="Cash Flow & Working Capital"
        title="Cash flow and working capital."
        subtitle="Cash generation, working capital drivers and near-term liquidity, with movement against plan and last year."
      />

      <PageSections>
        <KpiStrip data={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel flush>
            <PanelHeader
              title="Cash flow bridge"
              meta={`${selection.basis} ${currentPeriod.label}`}
              description="Opening cash through operating, investing and financing activity to close."
            />
            <PanelBody>
              <WaterfallChart steps={bridge} height={244} />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Cash balance"
              meta={currentPeriod.fiscalYear}
              description="Closing cash by month. Periods after the reporting date carry a forecast, never an actual."
            />
            <PanelBody>
              <TrendChart
                data={trend}
                variant="area"
                height={244}
                showPriorYear={false}
                showForecast
                actualLabel="Closing cash"
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Panel flush>
            <PanelHeader
              title="Working capital days"
              meta="Trailing 12 months"
              description="Days computed on rolling flows, so seasonality does not distort them."
            />
            <PanelBody>
              <ColumnChart
                data={daysChart}
                height={200}
                format="days"
                valueLabel="This year"
                comparisonLabel="Last year"
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Receivables ageing"
              meta={formatCurrency(ageingTotal)}
              description="Split of the trade receivables balance reported on the balance sheet."
            />
            <PanelBody>
              <DataTable
                columns={ageingColumns}
                rows={ageing}
                rowKey={(row) => row.id}
                minWidth={380}
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader title="Cash conversion" />
            <PanelBody>
              <RatioList items={conversionItems} />
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Cash flow statement"
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

          <div className="flex flex-col gap-5">
            <Panel flush>
              <PanelHeader title="Key insights" />
              <PanelBody>
                <InsightList insights={insights} />
              </PanelBody>
            </Panel>

            <Panel flush>
              <PanelHeader title="Liquidity and risk" />
              <PanelBody className="flex flex-col gap-4">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck size={15} className="text-positive mt-[1px] shrink-0" strokeWidth={1.9} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-primary">Liquidity position</span>
                      <Badge tone="positive">Adequate</Badge>
                    </div>
                    <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                      {formatCurrency(cash.closingCash)} of cash on hand against{" "}
                      {formatCurrency(Math.abs(cash.financingCashFlow))} of financing
                      outflow in the period, with operating cash flow of{" "}
                      {formatCurrency(cash.operatingCashFlow)}.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={15} className="text-caution mt-[1px] shrink-0" strokeWidth={1.9} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-primary">Risks to monitor</span>
                      <Badge tone="caution">3 open</Badge>
                    </div>
                    <p className="text-[12px] text-secondary mt-1 leading-relaxed">
                      Customer payment timing on the wholesale book, inventory build
                      ahead of the peak trading period, and the pacing of capital
                      expenditure in the final quarter.
                    </p>
                  </div>
                </div>
              </PanelBody>
            </Panel>
          </div>
        </div>
      </PageSections>
    </>
  );
}
