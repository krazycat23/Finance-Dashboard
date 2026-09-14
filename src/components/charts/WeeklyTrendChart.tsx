import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { WeeklyPoint } from "@/domain/selectors/sales";
import { axisUnitLabel, formatAxis, formatCurrency } from "@/utils/format";
import { axisProps, useChartTokens } from "./chartTheme";
import { ChartFrame, type LegendEntry } from "./ChartFrame";
import { TooltipShell } from "./ChartTooltip";

/**
 * Weekly sales trend. A denser variant of TrendChart: the x axis is thinned so
 * fifty-two labels do not collide, and only closed weeks are plotted.
 */
export function WeeklyTrendChart({
  data, height = 250, scale = "millions",
}: {
  data: WeeklyPoint[];
  height?: number;
  scale?: "units" | "thousands" | "millions";
}) {
  const tokens = useChartTokens();

  const rows = data.map((point) => ({
    label: point.week.shortLabel,
    fullLabel: `${point.week.label} · ${point.week.fiscalYear}`,
    revenue: point.revenue,
    priorYear: point.priorYear,
    budget: point.budget,
  }));

  const legend: LegendEntry[] = [
    { id: "actual", label: "This year", colour: tokens["series-1"], shape: "block" },
    { id: "prior", label: "Last year", colour: tokens["series-5"], shape: "block" },
    { id: "budget", label: "Budget", colour: tokens["series-reference"], shape: "dashed" },
  ];

  const money = (value: number) => formatCurrency(value, { scale, precision: 2 });

  return (
    <ChartFrame unit={axisUnitLabel(scale)} legend={legend} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={tokens["grid-line"]} strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="label"
            {...axisProps(tokens)}
            interval={3}
            tick={{ fill: tokens["axis-text"], fontSize: 10 }}
          />
          <YAxis
            {...axisProps(tokens)}
            width={44}
            tickFormatter={(value: number) => formatAxis(value)}
          />
          <Tooltip
            cursor={{ fill: tokens["surface-inset"], fillOpacity: 0.55 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipShell
                  title={row.fullLabel}
                  rows={[
                    { id: "a", label: "This year", value: money(row.revenue), colour: tokens["series-1"] },
                    ...(row.priorYear
                      ? [{ id: "p", label: "Last year", value: money(row.priorYear), colour: tokens["series-5"] }]
                      : []),
                    { id: "b", label: "Budget", value: money(row.budget), colour: tokens["series-reference"], shape: "dashed" as const },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="priorYear" fill={tokens["series-5"]} maxBarSize={9} isAnimationActive={false} />
          <Bar dataKey="revenue" fill={tokens["series-1"]} maxBarSize={9} isAnimationActive={false} />
          <Line
            dataKey="budget"
            stroke={tokens["series-reference"]}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
