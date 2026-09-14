import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency, formatPercentage } from "@/utils/format";
import { categoricalScale, sequentialStep, useChartTokens } from "./chartTheme";
import { TooltipShell } from "./ChartTooltip";
import { cn } from "@/utils/cn";

/**
 * COMPOSITION CHART
 * ---------------------------------------------------------------------------
 * A donut with a legend table beside it. The table is not decoration: it is the
 * secondary encoding that makes the split readable without relying on colour,
 * and it is where the actual numbers live.
 *
 * Two colour modes, chosen by the caller according to the data's job:
 *   "categorical" — unordered members (channels, entities), fixed hue order
 *   "sequential"  — ranked magnitude (cost categories), one hue light to dark
 *
 * Members beyond the categorical palette fold into a neutral "Other" rather
 * than generating new hues.
 */

export interface CompositionSlice {
  id: string;
  label: string;
  value: number;
  /** Optional comparative, rendered in the legend table. */
  comparison?: string;
  comparisonTone?: "positive" | "negative" | "neutral";
}

interface CompositionChartProps {
  slices: CompositionSlice[];
  mode?: "categorical" | "sequential";
  /** Figure shown inside the ring. */
  centreValue?: string;
  centreLabel?: string;
  height?: number;
  className?: string;
  /** Ground the chart sits on, so the ring separators match behind it. */
  surface?: "panel" | "canvas";
}

export function CompositionChart({
  slices, mode = "categorical", centreValue, centreLabel, height = 200, className,
  surface = "panel",
}: CompositionChartProps) {
  const tokens = useChartTokens();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const categorical = categoricalScale(tokens);

  const colourFor = (index: number): string => {
    if (mode === "sequential") return sequentialStep(index, slices.length, tokens);
    // Beyond the fixed palette, fold into neutral rather than inventing a hue.
    return index < categorical.length ? categorical[index] : tokens["series-5"];
  };

  const data = slices.map((slice, index) => ({
    ...slice,
    share: total === 0 ? 0 : slice.value / total,
    colour: colourFor(index),
  }));

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-[minmax(0,170px)_1fr] gap-6 items-center", className)}>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="66%"
              outerRadius="96%"
              paddingAngle={1.5}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke={surface === "canvas" ? tokens["surface-canvas"] : tokens["surface-panel"]}
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.id} fill={slice.colour} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as (typeof data)[number];
                return (
                  <TooltipShell
                    title={slice.label}
                    rows={[
                      { id: "v", label: "Value", value: formatCurrency(slice.value), colour: slice.colour },
                      { id: "s", label: "Share", value: formatPercentage(slice.share), muted: true },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centreValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-serif text-[19px] font-medium text-primary tnum tracking-[-0.015em]">
              {centreValue}
            </span>
            {centreLabel && (
              <span className="text-[10.5px] text-tertiary mt-0.5">{centreLabel}</span>
            )}
          </div>
        )}
      </div>

      {/* The legend table: identity, value and share without relying on colour. */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-subtle">
            <th className="text-left pb-1.5 text-[10px] uppercase tracking-[0.07em] text-tertiary font-medium">
              &nbsp;
            </th>
            <th className="text-right pb-1.5 text-[10px] uppercase tracking-[0.07em] text-tertiary font-medium">
              Share
            </th>
            <th className="text-right pb-1.5 text-[10px] uppercase tracking-[0.07em] text-tertiary font-medium">
              vs LY
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((slice) => (
            <tr key={slice.id} className="border-b border-subtle last:border-b-0">
              <td className="py-[7px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden
                    className="w-2 h-2 shrink-0"
                    style={{ backgroundColor: slice.colour }}
                  />
                  <span className="text-[12px] text-primary truncate">{slice.label}</span>
                </span>
              </td>
              <td className="py-[7px] text-right text-[12px] text-primary tnum">
                {formatPercentage(slice.share)}
              </td>
              <td
                className={cn(
                  "py-[7px] text-right text-[12px] tnum",
                  slice.comparisonTone === "positive" && "text-positive",
                  slice.comparisonTone === "negative" && "text-negative",
                  (!slice.comparisonTone || slice.comparisonTone === "neutral") && "text-secondary",
                )}
              >
                {slice.comparison ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
