import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow } from "@/components/layout/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { Sparkline } from "@/components/finance/Sparkline";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance, type Variance } from "@/domain/metrics/variance";
import { kpiBoards, defaultKpiMetricId } from "@/config/kpiBoards";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  availableOperationalMetrics, selectOperationalByLocation,
  selectOperationalMeasure, selectOperationalSeries,
  type OperationalByLocation, type OperationalMeasure,
} from "@/domain/selectors";
import { formatMetric, formatMetricDelta } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * KPI SCORECARD — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * Fully configuration-driven. Nothing here assumes that conversion, NPS or any
 * other measure exists: the boards come from config/kpiBoards.ts, the units and
 * favourable direction from the metric registry, and the values from whatever
 * operational records are present.
 *
 * A configured metric with no data is reported as awaiting data. Rendering it
 * as zero would be worse than omitting it — on a scorecard, zero and "not
 * feeding yet" look identical but mean opposite things.
 *
 * Exception first: whatever is behind is named before the boards are read, so
 * the page opens on what needs attention rather than on an alphabet of tiles.
 */

interface BoardMeasure {
  id: string;
  measure?: OperationalMeasure;
  boardLabel: string;
}

export function KpisPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();

  const available = useMemo(() => availableOperationalMetrics(), []);
  const availableIds = useMemo(() => new Set(available.map((metric) => metric.id)), [available]);

  // Resolve every configured board against what the data actually contains.
  const boards = useMemo(
    () =>
      kpiBoards.map((board) => ({
        ...board,
        measures: board.metricIds.map<BoardMeasure>((id) => ({
          id,
          boardLabel: board.label,
          measure: selectOperationalMeasure(id, selection),
        })),
      })),
    [selection],
  );

  const populated = useMemo(
    () => boards.flatMap((board) => board.measures).filter((row) => row.measure),
    [boards],
  );

  /** Metrics behind last year or behind target, worst first. */
  const exceptions = useMemo(
    () =>
      populated
        .map((row) => {
          const measure = row.measure!;
          const vsTarget = calculateVariance(measure.value, measure.target, measure.metric);
          const vsPrior = calculateVariance(measure.value, measure.priorYear, measure.metric);
          const adverse = [vsTarget, vsPrior].filter(
            (variance): variance is Variance => variance?.sentiment === "negative",
          );
          return { row, measure, vsTarget, vsPrior, adverse };
        })
        .filter((entry) => entry.adverse.length > 0)
        .sort(
          (a, b) =>
            Math.abs(b.adverse[0].relative ?? 0) - Math.abs(a.adverse[0].relative ?? 0),
        ),
    [populated],
  );

  const bandData = useMemo<KpiDatum[]>(
    () => populated.slice(0, 4).map((row) => toKpiDatum(row.measure!)),
    [populated],
  );

  const [focusMetric, setFocusMetric] = useState(
    availableIds.has(defaultKpiMetricId) ? defaultKpiMetricId : "",
  );
  const activeMetric = focusMetric || populated[0]?.id || "";

  const focusMeasure = useMemo(
    () => (activeMetric ? selectOperationalMeasure(activeMetric, selection) : undefined),
    [activeMetric, selection],
  );
  const focusSeries = useMemo(
    () => (activeMetric ? selectOperationalSeries(activeMetric, selection) : []),
    [activeMetric, selection],
  );
  const byLocation = useMemo(
    () => (activeMetric ? selectOperationalByLocation(activeMetric, selection) : []),
    [activeMetric, selection],
  );

  // Boards with nothing feeding are not rendered as empty shells.
  const liveBoards = boards.filter((board) => board.measures.some((row) => row.measure));

  return (
    <>
      <Masthead
        eyebrow="Operational scorecard"
        titleClassName="max-w-[18ch]"
        title="Key performance indicators"
        standfirst="What the operation is actually doing."
        lede={`${dataset.profile.companyName} · ${basis} ${currentPeriod.label}. Boards are configuration; a configured metric with no data is reported as awaiting data, never as zero.`}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Tracked", value: `${populated.length} of ${boards.flatMap((b) => b.measures).length}` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      {bandData.length > 0 && (
        <div className="mt-9">
          <KpiBand data={bandData} emphasiseFirst />
        </div>
      )}

      {exceptions.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 py-3.5 border-b border-subtle">
          <span className="type-label shrink-0">Behind</span>
          {exceptions.slice(0, 4).map((entry) => (
            <span key={entry.row.id} className="flex items-baseline gap-2.5">
              <span className="text-[12px] text-secondary">{entry.measure.metric.name}</span>
              <VarianceValue variance={entry.adverse[0]} size="sm">
                {formatMetricDelta(
                  entry.adverse[0].absolute,
                  entry.adverse[0].relative,
                  entry.measure.metric,
                )}
              </VarianceValue>
            </span>
          ))}
        </div>
      )}

      <div className="mt-10 flex flex-col gap-10">
        {liveBoards.map((board, index) => (
          <Section
            key={board.id}
            number={String(index + 1).padStart(2, "0")}
            title={board.label}
            meta={`${board.measures.filter((row) => row.measure).length} of ${board.measures.length} feeding`}
            description={board.description}
          >
            <ScorecardGroup rows={board.measures} />
          </Section>
        ))}

        {activeMetric && focusMeasure && (
          <SectionRow split="60/40">
            <Section
              flushTop
              number={String(liveBoards.length + 1).padStart(2, "0")}
              title="Metric detail"
              meta={focusMeasure.metric.name}
              description="Reported periods only, with the configured target as a reference line where one exists."
              actions={
                <SegmentedControl
                  aria-label="Focus metric"
                  value={activeMetric}
                  onChange={setFocusMetric}
                  options={populated.slice(0, 4).map((row) => ({
                    value: row.id,
                    label: row.measure!.metric.shortName ?? row.measure!.metric.name,
                  }))}
                />
              }
            >
              <ColumnChart
                data={focusSeries.map((point) => ({
                  id: point.period.id,
                  label: point.period.shortLabel,
                  value: point.value,
                  comparison: point.target,
                }))}
                height={280}
                format={chartFormat(focusMeasure)}
                valueLabel="Actual"
                comparisonLabel="Target"
              />
            </Section>

            <Section
              flushTop
              number={String(liveBoards.length + 2).padStart(2, "0")}
              title="By location"
              meta={focusMeasure.metric.name}
              description="Locations come from the active dataset's own dimension."
            >
              <LocationTable rows={byLocation} measure={focusMeasure} />
            </Section>
          </SectionRow>
        )}
      </div>
    </>
  );
}

function toKpiDatum(measure: OperationalMeasure): KpiDatum {
  return {
    metric: measure.metric,
    value: measure.value,
    comparison: measure.priorYear,
    comparisonLabel: "vs LY",
    variance: calculateVariance(measure.value, measure.priorYear, measure.metric),
    series: measure.series,
    secondary:
      measure.target === undefined
        ? undefined
        : {
            label: "vs Target",
            variance: calculateVariance(measure.value, measure.target, measure.metric)!,
          },
  };
}

/** The chart format the metric registry declares, mapped to the chart's own. */
function chartFormat(measure: OperationalMeasure): "currency" | "percentage" | "days" | "number" {
  const format = measure.metric.format;
  return format === "currency" || format === "percentage" || format === "days"
    ? format
    : "number";
}

/**
 * SCORECARD GROUP
 * ---------------------------------------------------------------------------
 * One ruled row per metric: the name, the figure at display size, the trailing
 * series, and both comparatives. A metric the data does not yet carry keeps its
 * row and says so — the gap is the finding.
 */
function ScorecardGroup({ rows }: { rows: BoardMeasure[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const measure = row.measure;
        if (!measure) {
          return (
            <li
              key={row.id}
              className="flex items-center justify-between gap-4 py-5 border-b border-subtle last:border-b-0 first:pt-0"
            >
              <span className="text-[12.5px] text-tertiary">{row.id}</span>
              <Badge tone="neutral">Awaiting data</Badge>
            </li>
          );
        }

        const vsTarget = calculateVariance(measure.value, measure.target, measure.metric);
        const vsPrior = calculateVariance(measure.value, measure.priorYear, measure.metric);

        return (
          <li
            key={row.id}
            className={cn(
              "grid gap-x-8 gap-y-3 items-center py-5",
              "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.1fr)_auto_auto]",
              "border-b border-subtle last:border-b-0 first:pt-0",
            )}
          >
            <div className="min-w-0">
              <div className="type-label">{measure.metric.name}</div>
              <div className="type-kpi type-kpi-sm mt-2.5">
                {formatMetric(measure.value, measure.metric)}
              </div>
            </div>

            <div className="flex flex-col gap-[3px] sm:items-end">
              {vsPrior ? (
                <VarianceValue variance={vsPrior} label="vs LY" size="md">
                  {formatMetricDelta(vsPrior.absolute, vsPrior.relative, measure.metric)}
                </VarianceValue>
              ) : (
                <span className="type-caption">No comparative</span>
              )}
              {vsTarget ? (
                <VarianceValue variance={vsTarget} label="vs Target" size="sm" showGlyph={false}>
                  {formatMetricDelta(vsTarget.absolute, vsTarget.relative, measure.metric)}
                </VarianceValue>
              ) : (
                <span className="type-caption">No target set</span>
              )}
            </div>

            {measure.series.length > 1 && (
              <Sparkline
                values={measure.series}
                title={measure.metric.name}
                width={180}
                height={38}
                stroke="var(--series-1)"
                className="hidden lg:block"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The focus metric by location, ranked, with its target where one exists. */
function LocationTable({
  rows, measure,
}: { rows: OperationalByLocation[]; measure: OperationalMeasure }) {
  const ranked = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(...ranked.map((row) => Math.abs(row.value)), 0);

  const columns: Column<OperationalByLocation>[] = [
    {
      id: "location",
      header: "Location",
      align: "left",
      width: "38%",
      render: (row, index) => (
        <span
          className={cn(
            "truncate text-primary",
            index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
          )}
        >
          {row.locationName}
        </span>
      ),
    },
    {
      id: "value",
      header: "Actual",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => (
        <span className="font-medium">{formatMetric(row.value, measure.metric)}</span>
      ),
    },
    {
      id: "bar",
      header: "",
      align: "left",
      width: "18%",
      render: (row, index) => (
        <Meter value={row.value} max={max} className={cn("max-w-[76px]", index > 0 && "opacity-75")} />
      ),
    },
    {
      id: "vs-ly",
      header: "vs LY",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => {
        const variance = calculateVariance(row.value, row.priorYear, measure.metric);
        if (!variance) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatMetricDelta(variance.absolute, variance.relative, measure.metric)}
          </VarianceValue>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={ranked}
      rowKey={(row) => row.locationId}
      minWidth={360}
      empty="This metric is not reported by location."
    />
  );
}
