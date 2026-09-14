import { useMemo } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow, StatementBand } from "@/components/layout/Section";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { buildPerformanceHeadline } from "@/components/finance/performanceHeadline";
import { NumberedInsightList } from "@/components/finance/InsightList";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { StatementTable } from "@/components/tables/StatementTable";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { LineTotals } from "@/domain/selectors/core";
import {
  periodsForBasis, selectCashBridge, selectCashFlow, selectCashFlowRows,
  selectCashTrend, selectInsights, selectKpis, selectLines,
  selectWorkingCapitalDays,
} from "@/domain/selectors";
import { formatCurrency, formatDays, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * CASH FLOW — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The liquidity page: what the business converted, what it spent, and what it
 * is left holding.
 *
 *   01          the cash bridge, full measure
 *   02 | 03     the operating trend against the drivers
 *   04          the cash flow statement, on its own leaf of paper
 *   05 | 06     working capital, as balances and as days
 *
 * The bridge closes on the reported closing cash — the verification suite
 * checks that it does — so nothing here is a modelled approximation.
 */

/** Liquidity measures the registry defines and the resolvers support. */
const CASH_KPIS = ["operatingCashFlow", "freeCashFlow", "cash", "netDebt"];

/**
 * Working capital balances, read straight off the reported lines. The labels
 * are the metric registry's own, so a client renaming a measure renames it
 * here too.
 */
const WORKING_CAPITAL_LINES = [
  { key: "inventory", metricId: "inventory", inverse: false },
  { key: "tradeReceivables", metricId: "tradeReceivables", inverse: false },
  { key: "tradePayables", metricId: "tradePayables", inverse: true },
] as const;

interface WorkingCapitalRow {
  id: string;
  label: string;
  actual: number;
  priorYear: number;
  inverse: boolean;
  total?: boolean;
}

export function CashFlowPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();

  const kpis = useMemo(() => selectKpis(CASH_KPIS, selection), [selection]);
  const cash = useMemo(() => selectCashFlow(selection), [selection]);
  const bridge = useMemo(() => selectCashBridge(selection), [selection]);
  const statement = useMemo(() => selectCashFlowRows(selection), [selection]);
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

  const headline = useMemo(
    () => buildPerformanceHeadline(kpis, ["freeCashFlow", "cash", "netDebt"]),
    [kpis],
  );

  const workingCapital = useMemo<WorkingCapitalRow[]>(() => {
    const value = (totals: LineTotals, key: (typeof WORKING_CAPITAL_LINES)[number]["key"]) =>
      totals[key] ?? 0;

    const rows = WORKING_CAPITAL_LINES.map((line) => ({
      id: line.key,
      label: getMetric(line.metricId).name,
      actual: value(lines.actual, line.key),
      priorYear: value(lines.priorYear, line.key),
      inverse: line.inverse,
    }));

    // Net working capital is the registry's own measure of the same three
    // lines, so the total is not re-derived here from a different definition.
    const net = (totals: LineTotals) =>
      (totals.inventory ?? 0) + (totals.tradeReceivables ?? 0) - (totals.tradePayables ?? 0);

    return [
      ...rows,
      {
        id: "net",
        label: "Net working capital",
        actual: net(lines.actual),
        priorYear: net(lines.priorYear),
        inverse: false,
        total: true,
      },
    ];
  }, [lines]);

  const daysChart = useMemo(
    () => [
      { id: "dso", label: "Debtor days", value: days.dso, comparison: days.priorYear.dso },
      { id: "dio", label: "Inventory days", value: days.dio, comparison: days.priorYear.dio },
      { id: "dpo", label: "Creditor days", value: days.dpo, comparison: days.priorYear.dpo },
    ],
    [days],
  );

  const conversion =
    cash.ebitda === 0 ? undefined : cash.operatingCashFlow / cash.ebitda;

  return (
    <>
      <Masthead
        eyebrow="Cash & liquidity"
        titleClassName="max-w-[20ch]"
        title={headline.text ?? `${currentPeriod.label} cash position reported.`}
        standfirst="Disciplined today. Ready tomorrow."
        lede={`${dataset.profile.companyName} · ${basis} ${currentPeriod.label}. Cash generated, invested and financed, closing on the reported cash balance.`}
        commentary={insights[0]?.text}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Closing", value: formatCurrency(cash.closingCash) },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      {conversion !== undefined && (
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3 py-3.5 border-b border-subtle">
          <span className="type-label">Cash conversion</span>
          <div className="flex items-center gap-3 min-w-[200px] flex-1 max-w-[360px]">
            <Meter value={cash.operatingCashFlow} max={cash.ebitda} className="flex-1" />
            <span className="type-caption whitespace-nowrap">{formatPercentage(conversion)} of EBITDA</span>
          </div>
          <span className="type-caption">
            {formatCurrency(cash.operatingCashFlow)} operating cash flow on{" "}
            {formatCurrency(cash.ebitda)} EBITDA · working capital{" "}
            {formatCurrency(cash.workingCapitalMovement, { showSign: true, parentheses: false })}
          </span>
        </div>
      )}

      <div className="mt-10 flex flex-col gap-10">
        {/* 01 — the bridge --------------------------------------------------- */}
        <Section
          number="01"
          title="Cash flow bridge"
          meta={`${basis} ${currentPeriod.label}`}
          description="Opening cash through operating, investing and financing movements to the reported closing balance."
        >
          <WaterfallChart steps={bridge} height={330} />
        </Section>

        {/* 02 | 03 — the trend, and why -------------------------------------- */}
        <SectionRow split="55/45">
          <Section
            flushTop
            number="02"
            title="Cash balance through the year"
            meta={currentPeriod.fiscalYear}
            description="Closed periods carry the actual balance; open periods carry the forecast, with plan as a reference line."
          >
            <TrendChart
              data={trend}
              height={292}
              showForecast
              showPriorYear={false}
              actualLabel="Closing cash — actual"
              budgetLabel="Plan"
            />
          </Section>

          <Section
            flushTop
            number="03"
            title="Key drivers"
            meta="Derived from reported results"
          >
            {insights.length > 0 ? (
              <NumberedInsightList insights={insights} />
            ) : (
              <p className="type-body">No movements of note in the reported cash flow.</p>
            )}
          </Section>
        </SectionRow>

        {/* 04 — the statement ------------------------------------------------- */}
        <StatementBand>
          <Section
            flushTop
            number="04"
            title="Cash flow statement"
            meta={`$'000 · ${basis} ${currentPeriod.label}`}
            description="Reported against plan. The statement closes on the same cash balance the bridge does."
          >
            <StatementTable
              rows={statement}
              actualLabel={`${basis} ${currentPeriod.label}`}
              columnSet="budgetOnly"
              varianceLabel="Variance"
              scale="thousands"
            />
          </Section>
        </StatementBand>

        {/* 05 | 06 — working capital, as balances and as days ----------------- */}
        <SectionRow split="60/40">
          <Section
            flushTop
            number="05"
            title="Working capital"
            meta="Closing balances against last year"
            description="The three balances that move operating cash, and the net position they leave."
          >
            <WorkingCapitalTable rows={workingCapital} />
          </Section>

          <Section
            flushTop
            number="06"
            title="Working capital days"
            meta="Trailing twelve-month flows"
            description="Days are computed on trailing flows against the closing balance, which is the convention that survives a seasonal business."
          >
            <ColumnChart
              data={daysChart}
              height={244}
              format="days"
              valueLabel="This year"
              comparisonLabel="Last year"
            />
            <p className="type-caption mt-4">
              Cash conversion cycle {formatDays(days.cashConversionCycle)} ·{" "}
              last year {formatDays(days.priorYear.cashConversionCycle)}
            </p>
          </Section>
        </SectionRow>
      </div>
    </>
  );
}

/**
 * WORKING CAPITAL BALANCES
 * ---------------------------------------------------------------------------
 * Payables are a source of cash, so a rise is favourable: the row declares
 * that rather than the table inferring it, exactly as the statement tables do.
 */
function WorkingCapitalTable({ rows }: { rows: WorkingCapitalRow[] }) {
  const columns: Column<WorkingCapitalRow>[] = [
    {
      id: "label",
      header: "Balance",
      align: "left",
      width: "34%",
      render: (row) => (
        <span className={cn("text-[12.5px]", row.total ? "text-primary font-semibold" : "text-secondary")}>
          {row.label}
        </span>
      ),
    },
    {
      id: "actual",
      header: "This year",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.actual)}</span>,
    },
    {
      id: "prior",
      header: "Last year",
      align: "right",
      width: "22%",
      render: (row) => formatCurrency(row.priorYear),
    },
    {
      id: "movement",
      header: "Movement",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => {
        const variance = calculateVariance(row.actual, row.priorYear, {
          favourableDirection: row.inverse ? "up" : "down",
        });
        if (!variance) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatCurrency(variance.absolute, { showSign: true, parentheses: false })}
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
      minWidth={520}
      rowClassName={(row) => (row.total ? "border-t border-strong [&>td]:py-[11px]" : undefined)}
      empty="No working capital balances are reported for this selection."
    />
  );
}
