import { useMemo, useState } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { KpiCard } from "@/components/finance/KpiCard";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { Meter } from "@/components/ui/Meter";
import { Badge } from "@/components/ui/Badge";
import { ColumnChart } from "@/components/charts/ColumnChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { calculateVariance } from "@/domain/metrics/variance";
import { kpiBoards, defaultKpiMetricId } from "@/config/kpiBoards";
import type { KpiDatum } from "@/domain/selectors/kpi";
import {
  availableOperationalMetrics, selectOperationalByLocation,
  selectOperationalMeasure, selectOperationalSeries,
  type OperationalByLocation, type OperationalMeasure,
} from "@/domain/selectors";
import { formatMetric, formatMetricDelta } from "@/utils/format";

/**
 * OPERATIONAL KPIs
 * ---------------------------------------------------------------------------
 * Fully configuration-driven. Nothing on this page assumes that conversion,
 * NPS or any other specific measure exists: the boards come from
 * config/kpiBoards.ts, the units and favourable direction from the metric
 * registry, and the values from whatever operational records are present.
 *
 * A configured metric with no data is reported as awaiting data. Rendering it
 * as zero would be worse than omitting it — on a scorecard, zero and "not
 * feeding yet" look identical but mean opposite things.
 */

export function KpisPage() {
  const { selection, currentPeriod } = useFilters();

  const available = useMemo(() => availableOperationalMetrics(), []);
  const availableIds = useMemo(
    () => new Set(available.map((metric) => metric.id)),
    [available],
  );

  // Resolve every configured board against what the data actually contains.
  const boards = useMemo(
    () =>
      kpiBoards.map((board) => ({
        ...board,
        measures: board.metricIds
          .map((id) => ({ id, measure: selectOperationalMeasure(id, selection) })),
      })),
    [selection],
  );

  const populatedIds = useMemo(
    () =>
      boards.flatMap((board) =>
        board.measures.filter((m) => m.measure).map((m) => m.id),
      ),
    [boards],
  );

  const [focusMetric, setFocusMetric] = useState(
    availableIds.has(defaultKpiMetricId) ? defaultKpiMetricId : "",
  );
  const activeMetric = focusMetric || populatedIds[0] || "";

  const focusSeries = useMemo(
    () => (activeMetric ? selectOperationalSeries(activeMetric, selection) : []),
    [activeMetric, selection],
  );
  const byLocation = useMemo(
    () => (activeMetric ? selectOperationalByLocation(activeMetric, selection) : []),
    [activeMetric, selection],
  );
  const focusMeasure = useMemo(
    () => (activeMetric ? selectOperationalMeasure(activeMetric, selection) : undefined),
    [activeMetric, selection],
  );

  const toKpiDatum = (measure: OperationalMeasure): KpiDatum => ({
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
  });

  const scorecardColumns: Column<{
    id: string;
    measure?: OperationalMeasure;
    boardLabel: string;
  }>[] = [
    {
      id: "metric",
      header: "Metric",
      align: "left",
      render: (row) =>
        row.measure ? (
          <div>
            <div className="text-primary">{row.measure.metric.name}</div>
            <div className="text-[11px] text-tertiary mt-0.5">{row.boardLabel}</div>
          </div>
        ) : (
          <span className="text-tertiary">{row.id}</span>
        ),
    },
    {
      id: "value",
      header: "Actual",
      align: "right",
      groupStart: true,
      render: (row) =>
        row.measure ? formatMetric(row.measure.value, row.measure.metric) : "—",
    },
    {
      id: "target",
      header: "Target",
      align: "right",
      render: (row) =>
        row.measure?.target === undefined
          ? "—"
          : formatMetric(row.measure.target, row.measure.metric),
    },
    {
      id: "vs-target",
      header: "vs Target",
      align: "right",
      render: (row) => {
        if (!row.measure || row.measure.target === undefined) return "—";
        const variance = calculateVariance(
          row.measure.value, row.measure.target, row.measure.metric,
        );
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatMetricDelta(variance.absolute, variance.relative, row.measure.metric)}
          </VarianceValue>
        );
      },
    },
    {
      id: "ly",
      header: "Last year",
      align: "right",
      groupStart: true,
      render: (row) =>
        row.measure?.priorYear === undefined
          ? "—"
          : formatMetric(row.measure.priorYear, row.measure.metric),
    },
    {
      id: "vs-ly",
      header: "vs LY",
      align: "right",
      render: (row) => {
        if (!row.measure) {
          return <Badge tone="neutral">Awaiting data</Badge>;
        }
        const variance = calculateVariance(
          row.measure.value, row.measure.priorYear, row.measure.metric,
        );
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatMetricDelta(variance.absolute, variance.relative, row.measure.metric)}
          </VarianceValue>
        );
      },
    },
    {
      id: "attainment",
      header: "Attainment",
      align: "left",
      width: "18%",
      render: (row) => {
        if (!row.measure || row.measure.target === undefined) return null;
        // Favourable-down metrics attain by coming in under target, so the
        // ratio is inverted rather than the bar being read backwards.
        const ratio =
          row.measure.metric.favourableDirection === "down"
            ? row.measure.target / Math.max(row.measure.value, 1e-9)
            : row.measure.value / Math.max(row.measure.target, 1e-9);
        return <Meter value={Math.min(ratio, 1.4)} max={1.4} tone={ratio >= 1 ? "positive" : "neutral"} />;
      },
    },
  ];

  const scorecardRows = useMemo(
    () =>
      boards.flatMap((board) =>
        board.measures.map((entry) => ({
          id: entry.id,
          measure: entry.measure,
          boardLabel: board.label,
        })),
      ),
    [boards],
  );

  const locationColumns: Column<OperationalByLocation>[] = [
    { id: "location", header: "Location", align: "left", render: (row) => row.locationName },
    {
      id: "value",
      header: "Actual",
      align: "right",
      render: (row) =>
        focusMeasure ? formatMetric(row.value, focusMeasure.metric) : String(row.value),
    },
    {
      id: "ly",
      header: "Last year",
      align: "right",
      render: (row) =>
        row.priorYear === undefined || !focusMeasure
          ? "—"
          : formatMetric(row.priorYear, focusMeasure.metric),
    },
    {
      id: "movement",
      header: "Movement",
      align: "right",
      render: (row) => {
        if (!focusMeasure || row.priorYear === undefined) return "—";
        const variance = calculateVariance(row.value, row.priorYear, focusMeasure.metric);
        if (!variance) return "—";
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatMetricDelta(variance.absolute, variance.relative, focusMeasure.metric)}
          </VarianceValue>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operational KPIs"
        title="Operational performance scorecard."
        subtitle="Configurable operational measures with targets, trend and location comparison. Boards are defined in configuration, not in code."
      />

      <PageSections>
        {boards.map((board) => {
          const populated = board.measures.filter((entry) => entry.measure);
          return (
            <div key={board.id} className="flex flex-col gap-2.5">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[12.5px] font-semibold text-primary">{board.label}</h2>
                <span className="text-[11.5px] text-tertiary">{board.description}</span>
              </div>
              {populated.length === 0 ? (
                <Panel>
                  <p className="text-[12px] text-tertiary py-4 text-center">
                    No data is feeding any metric configured on this board.
                  </p>
                </Panel>
              ) : (
                <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {populated.map((entry) => (
                    <KpiCard
                      key={entry.id}
                      datum={toKpiDatum(entry.measure!)}
                      onClick={() => setFocusMetric(entry.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title={focusMeasure ? `${focusMeasure.metric.name} trend` : "Metric trend"}
              meta="Rolling 12 months"
              description="Select any KPI card above to change the metric shown here."
              actions={
                populatedIds.length > 1 && (
                  <SegmentedControl
                    aria-label="Focus metric"
                    value={activeMetric}
                    onChange={setFocusMetric}
                    options={populatedIds.slice(0, 4).map((id) => {
                      const metric = available.find((m) => m.id === id);
                      return { value: id, label: metric?.shortName ?? metric?.name ?? id };
                    })}
                  />
                )
              }
            />
            <PanelBody>
              {focusSeries.length > 0 ? (
                <TrendChart
                  data={focusSeries.map((point) => ({
                    period: point.period,
                    actual: point.value,
                    budget: point.target,
                  }))}
                  height={240}
                  variant="area"
                  showPriorYear={false}
                  actualLabel={focusMeasure?.metric.name ?? "Actual"}
                  budgetLabel="Target"
                  scale="units"
                />
              ) : (
                <p className="text-[12px] text-tertiary py-10 text-center">
                  No data for this metric in the selected period.
                </p>
              )}
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="By location"
              meta={focusMeasure?.metric.name}
            />
            <PanelBody>
              {byLocation.length > 0 && focusMeasure ? (
                <ColumnChart
                  data={byLocation.map((row) => ({
                    id: row.locationId,
                    label: row.locationName,
                    value: row.value,
                    comparison: row.priorYear,
                  }))}
                  height={240}
                  format={focusMeasure.metric.format === "percentage" ? "percentage" : "number"}
                  valueLabel="This year"
                  comparisonLabel="Last year"
                  scale="units"
                />
              ) : (
                <p className="text-[12px] text-tertiary py-10 text-center">
                  No location breakdown available for this metric.
                </p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-5">
          <Panel flush>
            <PanelHeader
              title="KPI scorecard"
              meta={`${selection.basis} ${currentPeriod.label}`}
              description="Every configured metric, including any not yet feeding."
            />
            <PanelBody>
              <DataTable
                columns={scorecardColumns}
                rows={scorecardRows}
                rowKey={(row) => row.id}
                minWidth={680}
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Location ranking"
              meta={focusMeasure?.metric.name}
              description="Ranked on the metric selected above."
            />
            <PanelBody>
              <DataTable
                columns={locationColumns}
                rows={byLocation}
                rowKey={(row) => row.locationId}
                minWidth={400}
                empty="No location data for this metric."
              />
            </PanelBody>
          </Panel>
        </div>
      </PageSections>
    </>
  );
}
