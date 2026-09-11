import {
  Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { Period } from "@/domain/models";
import { axisUnitLabel, formatCurrency, formatAxis } from "@/utils/format";
import { axisProps, useChartTokens } from "./chartTheme";
import { ChartFrame, type LegendEntry } from "./ChartFrame";
import { TooltipShell } from "./ChartTooltip";

/**
 * TREND CHART
 * ---------------------------------------------------------------------------
 * Actual versus prior year versus plan over time.
 *
 * Two rules are enforced here rather than left to the caller:
 *
 *  1. ACTUALS STOP AT THE REPORTING CUT-OFF. Periods that have not closed carry
 *     no actual bar. Where a forecast is supplied it continues as a distinct,
 *     lighter series inside a shaded region that is labelled as forecast. This
 *     is the single most common way a finance chart lies.
 *  2. ONE AXIS. Comparative series share the scale of the primary measure; a
 *     second y-axis is never introduced.
 *
 * Identity is carried by form as well as colour — actual is a solid bar, prior
 * year a muted bar, plan a dashed line — so the series stay distinguishable
 * without colour perception.
 */

export interface TrendPoint {
  period: Period;
  actual?: number;
  priorYear?: number;
  budget?: number;
  forecast?: number;
}

interface TrendChartProps {
  data: TrendPoint[];
  height?: number;
  /** Render the primary series as an area rather than bars. */
  variant?: "bar" | "area";
  showPriorYear?: boolean;
  showBudget?: boolean;
  showForecast?: boolean;
  actualLabel?: string;
  priorYearLabel?: string;
  budgetLabel?: string;
  scale?: "units" | "thousands" | "millions";
}

interface ChartRow {
  label: string;
  fullLabel: string;
  actual?: number;
  priorYear?: number;
  budget?: number;
  forecast?: number;
  isActual: boolean;
}

export function TrendChart({
  data, height = 250, variant = "bar",
  showPriorYear = true, showBudget = true, showForecast = false,
  actualLabel = "Actual", priorYearLabel = "Last year", budgetLabel = "Budget",
  scale = "millions",
}: TrendChartProps) {
  const tokens = useChartTokens();

  // A rolling-twelve-month axis crosses a year boundary. Labelling January (and
  // the first point) with the year stops "Mar" being ambiguous between the two
  // years on screen.
  const spansYears =
    new Set(data.map((point) => point.period.calendarYear)).size > 1;

  const rows: ChartRow[] = data.map((point, index) => ({
    label:
      spansYears && (index === 0 || point.period.calendarMonth === 1)
        ? `${point.period.shortLabel} ${String(point.period.calendarYear).slice(-2)}`
        : point.period.shortLabel,
    fullLabel: point.period.label,
    actual: point.actual,
    priorYear: showPriorYear ? point.priorYear : undefined,
    budget: showBudget ? point.budget : undefined,
    // A forecast value is emitted only for open periods, so the forecast series
    // can never overlay a period that has already closed.
    forecast: showForecast && !point.period.isActual ? point.forecast : undefined,
    isActual: point.period.isActual,
  }));

  // Bounds of the unclosed region, used to shade and label it.
  const firstOpenIndex = rows.findIndex((row) => !row.isActual);
  const hasOpenPeriods = firstOpenIndex !== -1;

  const legend: LegendEntry[] = [
    { id: "actual", label: actualLabel, colour: tokens["series-1"], shape: "block" },
  ];
  if (showPriorYear) {
    legend.push({ id: "prior", label: priorYearLabel, colour: tokens["series-5"], shape: "block" });
  }
  if (showBudget) {
    legend.push({ id: "budget", label: budgetLabel, colour: tokens["series-reference"], shape: "dashed" });
  }
  if (showForecast && hasOpenPeriods) {
    legend.push({ id: "forecast", label: "Forecast", colour: tokens["series-2"], shape: "block" });
  }

  const money = (value: number) =>
    formatCurrency(value, { scale, precision: 1 });

  return (
    <ChartFrame
      unit={axisUnitLabel(scale)}
      legend={legend}
      height={height}
      footnote={
        hasOpenPeriods
          ? "Shaded periods have not closed. No actual is plotted for them."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid
            stroke={tokens["grid-line"]}
            strokeDasharray="0"
            vertical={false}
          />
          {hasOpenPeriods && (
            <ReferenceArea
              x1={rows[firstOpenIndex].label}
              x2={rows[rows.length - 1].label}
              fill={tokens["surface-inset"]}
              fillOpacity={0.7}
              ifOverflow="extendDomain"
            />
          )}
          <XAxis dataKey="label" {...axisProps(tokens)} interval="preserveStartEnd" minTickGap={12} />
          <YAxis
            {...axisProps(tokens)}
            width={46}
            tickFormatter={(value: number) => formatAxis(value)}
          />
          <Tooltip
            cursor={{ fill: tokens["surface-inset"], fillOpacity: 0.55 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as ChartRow;
              return (
                <TooltipShell
                  title={row.fullLabel}
                  subtitle={row.isActual ? undefined : "Period not closed"}
                  rows={[
                    ...(row.actual !== undefined
                      ? [{ id: "a", label: actualLabel, value: money(row.actual), colour: tokens["series-1"] }]
                      : []),
                    ...(row.forecast !== undefined
                      ? [{ id: "f", label: "Forecast", value: money(row.forecast), colour: tokens["series-2"] }]
                      : []),
                    ...(row.priorYear !== undefined
                      ? [{ id: "p", label: priorYearLabel, value: money(row.priorYear), colour: tokens["series-5"] }]
                      : []),
                    ...(row.budget !== undefined
                      ? [{ id: "b", label: budgetLabel, value: money(row.budget), colour: tokens["series-reference"], shape: "dashed" as const }]
                      : []),
                  ]}
                />
              );
            }}
          />

          {showPriorYear && (
            <Bar
              dataKey="priorYear"
              fill={tokens["series-5"]}
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          )}

          {variant === "bar" ? (
            <Bar
              dataKey="actual"
              fill={tokens["series-1"]}
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          ) : (
            <Area
              dataKey="actual"
              stroke={tokens["series-1"]}
              strokeWidth={2}
              fill={tokens["series-1"]}
              fillOpacity={0.08}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}

          {showForecast && (
            <Bar
              dataKey="forecast"
              fill={tokens["series-2"]}
              radius={[2, 2, 0, 0]}
              maxBarSize={22}
              isAnimationActive={false}
            />
          )}

          {showBudget && (
            <Line
              dataKey="budget"
              stroke={tokens["series-reference"]}
              strokeWidth={1.75}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
