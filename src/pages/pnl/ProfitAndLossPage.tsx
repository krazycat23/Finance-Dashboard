import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow, StatementBand } from "@/components/layout/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { Sparkline } from "@/components/finance/Sparkline";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { TrendChart } from "@/components/charts/TrendChart";
import { CompositionChart, type CompositionSlice } from "@/components/charts/CompositionChart";
import { StatementTable } from "@/components/tables/StatementTable";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  periodsForBasis, selectCostComposition, selectEntityPerformance, selectInsights,
  selectKpis, selectMetricSeries, selectProfitAndLoss, selectTopVariances,
  type EntityPerformance, type VarianceItem,
} from "@/domain/selectors";
import { formatCurrency, formatNumber, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * PROFIT & LOSS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The management accounts, composed as a board pack rather than as a page of
 * panels:
 *
 *   masthead   the period's profit statement in one line, and its commentary
 *   band       the four headline measures
 *   01         the statement itself, full measure, on its own leaf of paper
 *   02 | 03    where it diverged from plan, against how it has trended
 *   04 | 05    the margins, against where the cost base sits
 *   06         which entities the profit came from
 *
 * Every figure comes from the same selectors the Overview uses, so the summary
 * and the detail cannot disagree. The page adds no metric, no selector and no
 * arithmetic of its own.
 */

/** The headline measures of a profit statement, in statement order. */
const PNL_KPIS = ["revenue", "grossProfit", "ebitda", "netProfit"];

/**
 * Margins the metric registry actually defines. Net profit margin is not one
 * of them, so it is not shown: a ratio invented at the page level would not
 * carry the registry's unit, precision or favourability, and would be the one
 * figure on the page the rest of the product could contradict.
 */
const MARGIN_METRICS = ["grossMargin", "ebitdaMargin"];

const TREND_MEASURES = [
  { value: "revenue", label: "Revenue" },
  { value: "grossProfit", label: "Gross Profit" },
  { value: "ebitda", label: "EBITDA" },
  { value: "netProfit", label: "Net Profit" },
] as const;
type TrendMeasure = (typeof TREND_MEASURES)[number]["value"];

export function ProfitAndLossPage() {
  return useReportingDataset().source === "demo"
    ? <DemoProfitAndLossPage />
    : <ConfiguredReporting mode="pnl" />;
}

function DemoProfitAndLossPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();
  const [measure, setMeasure] = useState<TrendMeasure>("ebitda");

  const kpis = useMemo(() => selectKpis(PNL_KPIS, selection), [selection]);
  const margins = useMemo(() => selectKpis(MARGIN_METRICS, selection), [selection]);
  const rows = useMemo(() => selectProfitAndLoss(selection), [selection]);
  const costs = useMemo(() => selectCostComposition(selection), [selection]);
  const variances = useMemo(() => selectTopVariances(selection), [selection]);
  const entities = useMemo(() => selectEntityPerformance(selection), [selection]);

  // The profitability focus orders the same rule set around margin and cost,
  // which is the reading this page is for.
  const insights = useMemo(() => selectInsights(selection, "profitability"), [selection]);

  const trend = useMemo(() => {
    const periods = periodsForBasis("R12", selection.periodId);
    return selectMetricSeries(measure, periods, selection.entityId);
  }, [selection, measure]);

  const costSlices = useMemo<CompositionSlice[]>(
    () =>
      costs.map((cost) => ({
        id: cost.id,
        label: cost.name,
        value: cost.actual,
        comparison: formatCurrency(cost.variance, { showSign: true, parentheses: false }),
        comparisonTone: cost.variance >= 0 ? "positive" : "negative",
      })),
    [costs],
  );

  const measureLabel =
    TREND_MEASURES.find((option) => option.value === measure)?.label ?? "EBITDA";
  const periodLabel = `${basis} ${currentPeriod.label}`;

  return (
    <>
      <Masthead
        eyebrow="Management accounts"
        title="Profit & Loss"
        titleClassName="max-w-[14ch]"
        standfirst="Performance, explained."
        lede={`${dataset.profile.companyName} · ${periodLabel}, against budget and last year.`}
        commentary={insights[0]?.text}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Entity", value: entityLabel(entities, selection.entityId) },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      {/* 01 — THE STATEMENT ----------------------------------------------------
          The anchor of the page, given its own leaf of paper and the full set
          of comparisons. Nothing is dropped for tidiness: a management account
          is read across, and a missing column is a missing answer. */}
      <div className="mt-10">
        <StatementBand>
          <Section
            flushTop
            number="01"
            title="Profit & Loss statement"
            meta={`$'000 · ${periodLabel}`}
            description="Reported against budget and against the same period last year. Costs print as deductions; a favourable variance is positive on every line, including costs."
          >
            <StatementTable
              rows={rows}
              actualLabel={periodLabel}
              priorYearLabel="Last Year"
              columnSet="full"
              scale="thousands"
            />
          </Section>
        </StatementBand>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {/* 02 | 03 — where it went, and how it has been going ----------------- */}
        <SectionRow split="40/60">
          <Section
            flushTop
            number="02"
            title="Variance drivers"
            meta="Largest movements vs budget"
            description="Ranked by materiality. Signed so a positive figure is favourable on every line."
          >
            <VarianceDriverTable items={variances} />
          </Section>

          <Section
            flushTop
            number="03"
            title="P&L trend"
            meta="Rolling 12 months"
            actions={
              <SegmentedControl
                aria-label="Trend measure"
                value={measure}
                onChange={setMeasure}
                options={TREND_MEASURES.map((option) => ({ ...option }))}
              />
            }
          >
            <TrendChart
              data={trend}
              height={292}
              actualLabel={`${measureLabel} — actual`}
              priorYearLabel="Last year"
              budgetLabel="Budget"
            />
          </Section>
        </SectionRow>

        {/* 04 | 05 — the margins, and the cost base behind them ---------------- */}
        <SectionRow split="40/60">
          <Section
            flushTop
            number="04"
            title="Margin analysis"
            meta="Against budget and last year"
          >
            <MarginRail data={margins} />
          </Section>

          <Section
            flushTop
            number="05"
            title="Operating cost composition"
            meta={`${formatCurrency(costs.reduce((sum, cost) => sum + cost.actual, 0))} total`}
            description="Grouped by the cost category declared on the chart of accounts."
          >
            <CompositionChart
              slices={costSlices}
              mode="sequential"
              surface="canvas"
              comparisonLabel="vs Budget"
              height={218}
            />
          </Section>
        </SectionRow>

        {/* 06 — where the profit came from ------------------------------------ */}
        <Section
          number="06"
          title="Entity contribution"
          meta={`${entities.length} reporting entities`}
          description="EBITDA by reporting entity, as defined by the active dataset's entity dimension."
        >
          <EntityContributionTable rows={entities} />
        </Section>
      </div>
    </>
  );
}

/** The selected entity's own name, for the masthead's context block. */
function entityLabel(entities: EntityPerformance[], entityId: string): string {
  return entities.length === 1 ? entities[0].name : entityId;
}

/**
 * VARIANCE DRIVERS
 * ---------------------------------------------------------------------------
 * The statement lines that moved furthest from plan, ranked by magnitude. The
 * bar is a second reading of the figure beside it, and favourable/adverse is
 * carried by the word as well as the colour.
 */
function VarianceDriverTable({ items }: { items: VarianceItem[] }) {
  const max = Math.max(...items.map((item) => Math.abs(item.variance)), 0);

  const columns: Column<VarianceItem>[] = [
    {
      id: "line",
      header: "Line",
      align: "left",
      width: "32%",
      render: (row) => <span className="text-[12.5px] text-primary">{row.label}</span>,
    },
    {
      id: "variance",
      header: "Variance",
      align: "right",
      width: "18%",
      groupStart: true,
      render: (row) => (
        <span className={row.variance >= 0 ? "text-positive" : "text-negative"}>
          {formatNumber(row.variance, {
            scale: "thousands", showScaleSuffix: false, precision: 0, showSign: true,
          })}
        </span>
      ),
    },
    {
      id: "pct",
      header: "Var %",
      align: "right",
      width: "14%",
      render: (row) =>
        row.budget === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          <span className={row.variance >= 0 ? "text-positive" : "text-negative"}>
            {formatPercentage(row.variance / Math.abs(row.budget), { showSign: true })}
          </span>
        ),
    },
    {
      // Magnitude and sentiment travel together: the bar is a second reading of
      // the figure, and the word carries the favourability without relying on
      // the colour of either.
      id: "bar",
      header: "Favourability",
      align: "left",
      width: "34%",
      groupStart: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Meter
            value={row.variance}
            max={max}
            tone={row.variance >= 0 ? "positive" : "negative"}
            className="flex-1 max-w-[104px]"
          />
          <span className="type-caption whitespace-nowrap w-[74px] shrink-0">
            {row.variance === 0 ? "—" : row.variance > 0 ? "Favourable" : "Adverse"}
          </span>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(row) => row.label}
      minWidth={470}
      empty="No budget comparison is available for this selection."
    />
  );
}

/**
 * MARGIN RAIL
 * ---------------------------------------------------------------------------
 * Margins read as a rail of ratios rather than as KPI cards: the figure, both
 * comparatives, and the trailing twelve months drawn beneath. Only margins the
 * metric registry defines appear, so unit and favourability come from the same
 * place as everywhere else in the product.
 */
function MarginRail({ data }: { data: ReturnType<typeof selectKpis> }) {
  return (
    <div className="flex flex-col">
      {data.map((datum) => (
        <div
          key={datum.metric.id}
          className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 items-end py-5 border-t border-subtle first:border-t-0 first:pt-0"
        >
          <div className="min-w-0">
            <div className="type-label">{datum.metric.shortName ?? datum.metric.name}</div>
            <div className="type-kpi type-kpi-sm mt-2.5">
              {formatPercentage(datum.value)}
            </div>
            <div className="flex flex-col gap-[2px] mt-2.5">
              {datum.variance ? (
                <VarianceValue variance={datum.variance} label={datum.comparisonLabel} size="sm">
                  {formatPercentage(datum.variance.absolute, { showSign: true })}
                </VarianceValue>
              ) : (
                <span className="type-caption">No comparative</span>
              )}
              {datum.secondary && (
                <VarianceValue
                  variance={datum.secondary.variance}
                  label={datum.secondary.label}
                  size="xs"
                  showGlyph={false}
                >
                  {formatPercentage(datum.secondary.variance.absolute, { showSign: true })}
                </VarianceValue>
              )}
            </div>
          </div>
          {datum.series.length > 1 && (
            <Sparkline values={datum.series} title={datum.metric.name} width={132} height={34} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * ENTITY CONTRIBUTION
 * ---------------------------------------------------------------------------
 * Where the profit came from. Ranked by EBITDA — the measure the entity
 * selector reports — with share of group and the movement on last year.
 */
function EntityContributionTable({ rows }: { rows: EntityPerformance[] }) {
  const ranked = [...rows].sort((a, b) => b.ebitda - a.ebitda);
  const max = Math.max(...ranked.map((row) => Math.abs(row.ebitda)), 0);
  const total = ranked.reduce((sum, row) => sum + row.ebitda, 0);

  const columns: Column<EntityPerformance>[] = [
    {
      id: "entity",
      header: "Entity",
      align: "left",
      width: "24%",
      render: (row, index) => (
        <span className="flex items-baseline gap-3 min-w-0">
          <span aria-hidden className="type-section-number w-[14px] shrink-0">
            {index + 1}
          </span>
          {/* The leading contributor carries the weight; the rest read
              against it. */}
          <span
            className={cn(
              "truncate text-primary",
              index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
            )}
          >
            {row.name}
          </span>
        </span>
      ),
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      width: "13%",
      groupStart: true,
      render: (row) => formatCurrency(row.revenue),
    },
    {
      id: "ebitda",
      header: "EBITDA",
      align: "right",
      width: "13%",
      render: (row) => <span className="font-medium">{formatCurrency(row.ebitda)}</span>,
    },
    {
      id: "share",
      header: "Share of group",
      align: "right",
      width: "20%",
      render: (row) => (
        <div className="flex flex-col items-end gap-[5px]">
          <span>{total === 0 ? "—" : formatPercentage(row.ebitda / total)}</span>
          <Meter value={row.ebitda} max={max} className="w-full max-w-[140px]" />
        </div>
      ),
    },
    {
      id: "margin",
      header: "EBITDA margin",
      align: "right",
      width: "15%",
      groupStart: true,
      render: (row) => formatPercentage(row.ebitdaMargin),
    },
    {
      id: "growth",
      header: "vs LY",
      align: "right",
      width: "15%",
      // The selector reports the movement itself; it is printed as reported
      // rather than reconstructing a prior-year base to divide by.
      render: (row) =>
        row.ebitdaGrowth === undefined ? (
          <span className="text-tertiary">—</span>
        ) : (
          <span
            className={cn(
              "font-medium",
              row.ebitdaGrowth >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {formatPercentage(row.ebitdaGrowth, { showSign: true })}
          </span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={ranked}
      rowKey={(row) => row.id}
      minWidth={760}
      empty="No reporting entities are defined for this selection."
    />
  );
}
