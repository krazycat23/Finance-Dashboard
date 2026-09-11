import { useMemo } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { KpiStrip } from "@/components/finance/KpiCard";
import { InsightList } from "@/components/finance/InsightList";
import { RatioList, type RatioItem } from "@/components/finance/RatioList";
import { CompositionChart } from "@/components/charts/CompositionChart";
import { StatementTable } from "@/components/tables/StatementTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import {
  periodsForBasis, selectBalanceSheet, selectInsights, selectKpis, selectLines,
  selectWorkingCapitalDays,
} from "@/domain/selectors";
import { formatCurrency, formatDays, formatMetric, formatTimes } from "@/utils/format";

/**
 * BALANCE SHEET
 * ---------------------------------------------------------------------------
 * Position, funding and liquidity.
 *
 * Working-capital days here come from selectWorkingCapitalDays — the SAME
 * function the Cash Flow page calls. That is deliberate: DSO appearing as two
 * different numbers on two pages is the fastest way for a finance product to
 * lose a CFO's trust.
 */

const BALANCE_KPIS = [
  "cash", "inventory", "tradeReceivables", "tradePayables", "netAssets", "netDebt",
];

export function BalanceSheetPage() {
  const { selection, currentPeriod } = useFilters();

  const kpis = useMemo(() => selectKpis(BALANCE_KPIS, selection), [selection]);
  const rows = useMemo(() => selectBalanceSheet(selection), [selection]);
  const lines = useMemo(() => selectLines(selection), [selection]);
  const days = useMemo(() => selectWorkingCapitalDays(selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "cash"), [selection]);

  // The comparative column is the prior CLOSE, so it must be labelled with that
  // month rather than inheriting the reporting month's caption.
  const priorMonthLabel = useMemo(() => {
    const closed = periodsForBasis("R12", selection.periodId).filter((p) => p.isActual);
    const previous = closed[closed.length - 2];
    return previous ? `As at ${previous.label}` : "Prior period";
  }, [selection]);

  const workingCapitalItems = useMemo<RatioItem[]>(() => {
    const build = (
      id: string,
      metricId: string,
      value: number,
      prior: number,
    ): RatioItem => {
      const metric = getMetric(metricId);
      const variance = calculateVariance(value, prior, metric);
      return {
        id,
        label: metric.name,
        display: formatMetric(value, metric),
        variance,
        varianceDisplay: variance
          ? formatDays(variance.absolute, { showSign: true, parentheses: false })
          : undefined,
        comparisonLabel: "vs LY",
      };
    };

    const currentAssets = lines.actual.totalCurrentAssets ?? 0;
    const currentLiabilities = lines.actual.totalCurrentLiabilities ?? 0;

    return [
      {
        id: "working-capital",
        label: "Working capital",
        display: formatCurrency(currentAssets - currentLiabilities),
      },
      build("dso", "dso", days.dso, days.priorYear.dso),
      build("dio", "dio", days.dio, days.priorYear.dio),
      build("dpo", "dpo", days.dpo, days.priorYear.dpo),
      build("ccc", "cashConversionCycle", days.cashConversionCycle, days.priorYear.cashConversionCycle),
    ];
  }, [lines, days]);

  const liquidityItems = useMemo<RatioItem[]>(() => {
    const ca = lines.actual.totalCurrentAssets ?? 0;
    const cl = lines.actual.totalCurrentLiabilities ?? 1;
    const inventory = lines.actual.inventory ?? 0;
    const cash = lines.actual.cash ?? 0;
    const ebitda = lines.actual.ebitda ?? 1;
    const netDebt =
      (lines.actual.borrowingsCurrent ?? 0) + (lines.actual.borrowingsNonCurrent ?? 0) +
      (lines.actual.leaseLiabilitiesCurrent ?? 0) +
      (lines.actual.leaseLiabilitiesNonCurrent ?? 0) - cash;

    return [
      { id: "current", label: "Current ratio", display: formatTimes(ca / cl), meter: { value: ca / cl, max: 3 } },
      { id: "quick", label: "Quick ratio", display: formatTimes((ca - inventory) / cl), meter: { value: (ca - inventory) / cl, max: 3 } },
      { id: "cash", label: "Cash ratio", display: formatTimes(cash / cl), meter: { value: cash / cl, max: 3 } },
      {
        id: "leverage",
        label: "Net debt / EBITDA (annualised)",
        // The EBITDA in the window is not a full year; annualise so the
        // leverage multiple means what a lender would expect it to mean.
        display: formatTimes(netDebt / ((ebitda / Math.max(lines.periods.filter((p) => p.isActual).length, 1)) * 12)),
        meter: { value: netDebt / ((ebitda / Math.max(lines.periods.filter((p) => p.isActual).length, 1)) * 12), max: 4 },
      },
    ];
  }, [lines]);

  const debtSlices = useMemo(() => {
    const items = [
      { id: "bank", label: "Bank borrowings", value: (lines.actual.borrowingsCurrent ?? 0) + (lines.actual.borrowingsNonCurrent ?? 0) },
      { id: "leases", label: "Lease liabilities", value: (lines.actual.leaseLiabilitiesCurrent ?? 0) + (lines.actual.leaseLiabilitiesNonCurrent ?? 0) },
    ];
    return items.filter((item) => item.value > 0);
  }, [lines]);

  return (
    <>
      <PageHeader
        eyebrow="Financial Position"
        title="Balance sheet and funding position."
        subtitle="Position, working capital, liquidity and debt, with movement against the prior month and prior year."
      />

      <PageSections>
        <KpiStrip data={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="Balance sheet"
              meta={`$'000 · as at ${currentPeriod.label}`}
            />
            <PanelBody>
              <StatementTable
                rows={rows}
                  actualLabel={`As at ${currentPeriod.label}`}
                budgetLabel="Prior month"
                budgetSubLabel={priorMonthLabel}
                varianceLabel="Movement"
                priorYearLabel="Prior year"
                columnSet="full"
                scale="thousands"
              />
            </PanelBody>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel flush>
              <PanelHeader title="Working capital" meta="Days on trailing 12 months" />
              <PanelBody>
                <RatioList items={workingCapitalItems} />
              </PanelBody>
            </Panel>

            <Panel flush>
              <PanelHeader title="Liquidity and leverage" />
              <PanelBody>
                <RatioList items={liquidityItems} />
              </PanelBody>
            </Panel>

            <Panel flush>
              <PanelHeader title="Debt profile" meta="Gross debt by instrument" />
              <PanelBody>
                <CompositionChart
                  slices={debtSlices}
                  mode="categorical"
                  centreValue={formatCurrency(debtSlices.reduce((s, d) => s + d.value, 0))}
                  centreLabel="Gross debt"
                  height={168}
                />
              </PanelBody>
            </Panel>

            <Panel flush>
              <PanelHeader title="Movement commentary" meta="Generated from reported results" />
              <PanelBody>
                <InsightList insights={insights} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </PageSections>
    </>
  );
}
