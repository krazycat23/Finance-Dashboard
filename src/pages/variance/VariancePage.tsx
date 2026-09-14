import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow } from "@/components/layout/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { NumberedInsightList } from "@/components/finance/InsightList";
import { WaterfallChart } from "@/components/charts/WaterfallChart";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  selectBudgetBridge, selectComparableBudget, selectCostComposition,
  selectEbitdaBridge, selectEntityPerformance, selectInsights, selectLines,
  selectPriceVolumeMix, type BridgeStep, type CostCategoryTotal,
  type EntityPerformance,
} from "@/domain/selectors";
import { formatCurrency, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * VARIANCE ANALYSIS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The diagnostic page: why are we ahead or behind?
 *
 * Every variance here is SIGNED SO THAT POSITIVE IS FAVOURABLE, whatever the
 * line. An overspend on costs is negative; an underspend is positive. Without
 * that convention a variance page forces the reader to work out the sign line
 * by line, which is where mistakes come from.
 *
 * The budget comparison is restricted to closed periods — comparing nine months
 * of actual against a twelve-month plan is the most common variance error in
 * management reporting, and the selector layer prevents it.
 *
 *   01          the bridge, full measure
 *   02 | 03     the drivers behind it, against the commentary
 *   04          which entities moved
 *   05 | 06     the revenue decomposition, and the cost base
 */

/** The measures whose variance the band reports, in statement order. */
const VARIANCE_LINES = [
  { line: "revenue", metricId: "revenue", label: "Revenue variance" },
  { line: "grossProfit", metricId: "grossProfit", label: "Gross profit variance" },
  { line: "ebitda", metricId: "ebitda", label: "EBITDA variance" },
  { line: "netProfit", metricId: "netProfit", label: "Net profit variance" },
] as const;

const BRIDGE_BASES = [
  { value: "budget", label: "vs Budget" },
  { value: "priorYear", label: "vs Last year" },
] as const;
type BridgeBasis = (typeof BRIDGE_BASES)[number]["value"];

export function VariancePage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();
  const [bridgeBasis, setBridgeBasis] = useState<BridgeBasis>("budget");

  const lines = useMemo(() => selectLines(selection), [selection]);
  const budget = useMemo(() => selectComparableBudget(selection), [selection]);

  // The toggle changes which bridge is built, not just its caption.
  const bridge = useMemo(
    () => (bridgeBasis === "budget" ? selectBudgetBridge(selection) : selectEbitdaBridge(selection)),
    [selection, bridgeBasis],
  );
  const pvm = useMemo(() => selectPriceVolumeMix(selection), [selection]);
  const costs = useMemo(() => selectCostComposition(selection), [selection]);
  const entities = useMemo(() => selectEntityPerformance(selection), [selection]);
  const insights = useMemo(() => selectInsights(selection, "profitability"), [selection]);

  // The variance itself is the figure, and the domain's own variance helper
  // produces it — the page does not subtract one number from another.
  const kpis = useMemo<KpiDatum[]>(
    () =>
      VARIANCE_LINES.map(({ line, metricId, label }) => {
        const metric = getMetric(metricId);
        const actual = lines.actual[line] ?? 0;
        const planned = budget[line];
        const variance = calculateVariance(actual, planned, metric);
        return {
          metric: { ...metric, shortName: label },
          value: variance?.absolute ?? 0,
          comparison: planned,
          comparisonLabel: "vs Budget",
          variance,
          series: [],
        };
      }),
    [lines, budget],
  );

  const basisLabel = bridgeBasis === "budget" ? "budget" : "last year";

  return (
    <>
      <Masthead
        eyebrow="Variance analysis"
        titleClassName="max-w-[17ch]"
        title="Understand the story behind the numbers."
        standfirst="From variance to action."
        lede={`${dataset.profile.companyName} · ${basis} ${currentPeriod.label}. Every variance is signed so a positive figure is favourable, including on cost lines.`}
        commentary={insights[0]?.text}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Compared", value: "Closed periods" },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {/* 01 — the bridge --------------------------------------------------- */}
        <Section
          number="01"
          title="Variance waterfall"
          meta={`EBITDA ${bridgeBasis === "budget" ? "vs budget" : "vs last year"}`}
          description="Opening and closing columns are levels; the bars between them are the movements the model reports. Nothing is decomposed on this page."
          actions={
            <SegmentedControl
              aria-label="Bridge basis"
              value={bridgeBasis}
              onChange={setBridgeBasis}
              options={BRIDGE_BASES.map((option) => ({ ...option }))}
            />
          }
        >
          <WaterfallChart steps={bridge} height={340} />
        </Section>

        {/* 02 | 03 — the drivers, and what they mean -------------------------- */}
        <SectionRow split="55/45">
          <Section
            flushTop
            number="02"
            title="Variance by driver"
            meta={`Against ${basisLabel}`}
            description="The movements of the bridge above, ranked by contribution to the total."
          >
            <DriverContributionTable steps={bridge} />
          </Section>

          <Section
            flushTop
            number="03"
            title="Commentary"
            meta="Derived from reported results"
          >
            {insights.length > 0 ? (
              <NumberedInsightList insights={insights} />
            ) : (
              <p className="type-body">No movements of note in the reported results.</p>
            )}
          </Section>
        </SectionRow>

        {/* 04 — which entities moved ------------------------------------------ */}
        <Section
          number="04"
          title="Variance by entity"
          meta="Movement on last year"
          description="Ranked by the size of the EBITDA movement, whichever way it went. Entities come from the active dataset's own dimension."
        >
          <EntityMovementTable rows={entities} />
        </Section>

        {/* 05 | 06 — revenue decomposition, and the cost base ------------------ */}
        <SectionRow split="50/50">
          <Section
            flushTop
            number="05"
            title="Price, volume and mix"
            meta="Revenue movement on last year"
            description="An exact three-way split: the components sum precisely to the revenue movement."
          >
            <ColumnChart
              data={pvm.map((component) => ({
                id: component.label,
                label: component.label,
                value: component.value,
              }))}
              height={252}
              divergent
            />
          </Section>

          <Section
            flushTop
            number="06"
            title="Operating cost variance"
            meta="By cost category"
            description="Grouped by the cost category declared on the chart of accounts."
          >
            <CostVarianceList rows={costs} />
          </Section>
        </SectionRow>
      </div>
    </>
  );
}

/**
 * DRIVER CONTRIBUTION
 * ---------------------------------------------------------------------------
 * The bridge read as a table: each movement, its share of the total movement,
 * and whether it helped or hurt. Contribution is measured against the total
 * absolute movement so the shares are comparable when drivers pull in opposite
 * directions.
 */
function DriverContributionTable({ steps }: { steps: BridgeStep[] }) {
  const deltas = steps.filter((step) => step.kind === "delta");
  const total = deltas.reduce((sum, step) => sum + Math.abs(step.value), 0);
  const max = Math.max(...deltas.map((step) => Math.abs(step.value)), 0);

  const columns: Column<BridgeStep>[] = [
    {
      id: "driver",
      header: "Driver",
      align: "left",
      width: "30%",
      render: (row, index) => (
        <div className="min-w-0">
          <span
            className={cn(
              "truncate text-primary",
              index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
            )}
          >
            {row.label}
          </span>
          {row.description && <div className="type-caption mt-0.5">{row.description}</div>}
        </div>
      ),
    },
    {
      id: "value",
      header: "Movement",
      align: "right",
      width: "20%",
      groupStart: true,
      render: (row) => (
        <span className={row.value >= 0 ? "text-positive" : "text-negative"}>
          {formatCurrency(row.value, { showSign: true, parentheses: false })}
        </span>
      ),
    },
    {
      id: "share",
      header: "Contribution",
      align: "right",
      width: "16%",
      render: (row) =>
        total === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          formatPercentage(Math.abs(row.value) / total)
        ),
    },
    {
      id: "bar",
      header: "Impact",
      align: "left",
      width: "34%",
      groupStart: true,
      render: (row) => (
        <div className="flex flex-col gap-[5px]">
          <span className="type-caption">{row.value >= 0 ? "Favourable" : "Adverse"}</span>
          <Meter
            value={row.value}
            max={max}
            tone={row.value >= 0 ? "positive" : "negative"}
            className="w-[86px]"
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={[...deltas].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))}
      rowKey={(row) => row.label}
      minWidth={420}
      empty="The bridge reports no movements for this selection."
    />
  );
}

/** Which entities moved, and by how much, ranked by the size of the move. */
function EntityMovementTable({ rows }: { rows: EntityPerformance[] }) {
  const ranked = [...rows].sort(
    (a, b) => Math.abs(b.ebitdaGrowth ?? 0) - Math.abs(a.ebitdaGrowth ?? 0),
  );
  const max = Math.max(...ranked.map((row) => Math.abs(row.ebitdaGrowth ?? 0)), 0);

  const movement = (value: number | undefined) =>
    value === undefined ? (
      <span className="text-tertiary">—</span>
    ) : (
      <span className={cn("font-medium", value >= 0 ? "text-positive" : "text-negative")}>
        {formatPercentage(value, { showSign: true })}
      </span>
    );

  const columns: Column<EntityPerformance>[] = [
    {
      id: "entity",
      header: "Entity",
      align: "left",
      width: "22%",
      render: (row, index) => (
        <span className="flex items-baseline gap-3 min-w-0">
          <span aria-hidden className="type-section-number w-[14px] shrink-0">{index + 1}</span>
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
      width: "14%",
      groupStart: true,
      render: (row) => formatCurrency(row.revenue),
    },
    {
      id: "revenue-growth",
      header: "Revenue vs LY",
      align: "right",
      width: "14%",
      render: (row) => movement(row.revenueGrowth),
    },
    {
      id: "ebitda",
      header: "EBITDA",
      align: "right",
      width: "14%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.ebitda)}</span>,
    },
    {
      id: "ebitda-growth",
      header: "EBITDA vs LY",
      align: "right",
      width: "14%",
      render: (row) => movement(row.ebitdaGrowth),
    },
    {
      id: "impact",
      header: "Size of move",
      align: "left",
      width: "22%",
      groupStart: true,
      render: (row) => (
        <Meter
          value={row.ebitdaGrowth ?? 0}
          max={max}
          tone={(row.ebitdaGrowth ?? 0) >= 0 ? "positive" : "negative"}
          className="max-w-[150px]"
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={ranked}
      rowKey={(row) => row.id}
      minWidth={820}
      empty="No reporting entities are defined for this selection."
    />
  );
}

/** Operating cost categories against plan, ranked by the size of the variance. */
function CostVarianceList({ rows }: { rows: CostCategoryTotal[] }) {
  const ranked = [...rows].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const max = Math.max(...ranked.map((row) => Math.abs(row.variance)), 0);

  return (
    <ul className="flex flex-col">
      {ranked.map((row, index) => (
        <li key={row.id} className="py-3 border-b border-subtle last:border-b-0 first:pt-0">
          <div className="flex items-baseline justify-between gap-4">
            <span className="flex items-baseline gap-3 min-w-0">
              <span aria-hidden className="type-section-number w-[14px] shrink-0">{index + 1}</span>
              <span
                className={cn(
                  "truncate text-primary",
                  index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
                )}
              >
                {row.name}
              </span>
            </span>
            <span className="flex items-baseline gap-5 shrink-0 tnum">
              <span className="type-caption w-[66px] text-right">{formatCurrency(row.actual)}</span>
              <span
                className={cn(
                  "text-[12.5px] font-medium w-[70px] text-right",
                  row.variance >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {formatCurrency(row.variance, { showSign: true, parentheses: false })}
              </span>
            </span>
          </div>
          <Meter
            value={row.variance}
            max={max}
            tone={row.variance >= 0 ? "positive" : "negative"}
            className={cn("mt-2.5", index > 0 && "opacity-75")}
          />
        </li>
      ))}
    </ul>
  );
}
