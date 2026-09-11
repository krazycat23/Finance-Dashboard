import {
  Bar, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  axisUnitLabel, formatAxis, formatCurrency, formatDays, formatNumber,
  formatPercentage,
} from "@/utils/format";
import { axisProps, useChartTokens } from "./chartTheme";
import { ChartFrame, type LegendEntry } from "./ChartFrame";
import { TooltipShell } from "./ChartTooltip";

/**
 * COLUMN CHART
 * ---------------------------------------------------------------------------
 * A single measure across categories, optionally with a paired comparison
 * series. Used where a ranked bar list would lose the shape of the
 * distribution.
 *
 * Percentage scales always start at zero: truncating a percentage axis
 * multiplies the apparent movement and is the most common way a margin chart
 * misleads.
 */

export interface ColumnPoint {
  id: string;
  label: string;
  value: number;
  comparison?: number;
}

interface ColumnChartProps {
  data: ColumnPoint[];
  height?: number;
  format?: "currency" | "percentage" | "days" | "number";
  valueLabel?: string;
  comparisonLabel?: string;
  scale?: "units" | "thousands" | "millions";
  /** Colours bars by sign rather than as one series. */
  divergent?: boolean;
  /** Overrides the unit caption; defaults to the currency or % for the format. */
  unit?: string;
}

export function ColumnChart({
  data, height = 220, format = "currency",
  valueLabel = "Actual", comparisonLabel = "Last year",
  scale = "millions", divergent = false, unit,
}: ColumnChartProps) {
  const tokens = useChartTokens();
  const hasComparison = data.some((point) => point.comparison !== undefined);

  const legend: LegendEntry[] = [
    {
      id: "value",
      label: valueLabel,
      colour: divergent ? tokens["diverging-positive"] : tokens["series-1"],
      shape: "block",
    },
  ];
  if (divergent) {
    legend[0].label = "Favourable";
    legend.push({ id: "adverse", label: "Adverse", colour: tokens["diverging-negative"], shape: "block" });
  }
  if (hasComparison) {
    legend.push({ id: "comparison", label: comparisonLabel, colour: tokens["series-5"], shape: "block" });
  }

  const display = (value: number) =>
    format === "percentage" ? formatPercentage(value)
    : format === "days" ? formatDays(value, { precision: 0 })
    : format === "number" ? formatNumber(value, { scale, precision: 0 })
    : formatCurrency(value, { scale, precision: 1 });

  const unitCaption =
    unit ??
    (format === "percentage" ? "%"
      : format === "days" ? "Days"
      : format === "number" ? ""
      : axisUnitLabel(scale));

  return (
    <ChartFrame unit={unitCaption} legend={legend} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={tokens["grid-line"]} vertical={false} />
          <XAxis dataKey="label" {...axisProps(tokens)} interval={0} tick={{ fill: tokens["axis-text"], fontSize: 10 }} />
          <YAxis
            {...axisProps(tokens)}
            width={46}
            // Percentages are anchored at zero, always.
            domain={format === "percentage" ? [0, "auto"] : undefined}
            tickFormatter={(value: number) =>
              format === "days" || format === "number"
                ? String(Math.round(value))
                : formatAxis(value, format)
            }
          />
          <Tooltip
            cursor={{ fill: tokens["surface-inset"], fillOpacity: 0.55 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as ColumnPoint;
              return (
                <TooltipShell
                  title={point.label}
                  rows={[
                    { id: "v", label: valueLabel, value: display(point.value), colour: tokens["series-1"] },
                    ...(point.comparison !== undefined
                      ? [{ id: "c", label: comparisonLabel, value: display(point.comparison), colour: tokens["series-5"], muted: true }]
                      : []),
                  ]}
                />
              );
            }}
          />
          {hasComparison && (
            <Bar dataKey="comparison" fill={tokens["series-5"]} radius={[2, 2, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          )}
          <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={26} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.id}
                fill={
                  divergent
                    ? point.value >= 0 ? tokens["diverging-positive"] : tokens["diverging-negative"]
                    : tokens["series-1"]
                }
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
