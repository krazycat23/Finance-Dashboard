import {
  Bar, CartesianGrid, Cell, ComposedChart, Customized, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { axisUnitLabel, formatAxis, formatCurrency } from "@/utils/format";
import { axisProps, useChartTokens } from "./chartTheme";
import { ChartFrame, type LegendEntry } from "./ChartFrame";
import { TooltipShell } from "./ChartTooltip";

/**
 * WATERFALL / BRIDGE CHART
 * ---------------------------------------------------------------------------
 * Floating bars from a starting value to an ending value.
 *
 * The geometry is computed here, exactly: each delta bar is drawn from the
 * running cumulative to the next, using a transparent base bar plus a visible
 * bar stacked on it. A waterfall whose bars do not land where the arithmetic
 * says they should is worse than no waterfall, so the values are never scaled
 * or nudged for appearance.
 *
 * Colour is diverging (favourable / adverse) and reserved: the start and end
 * columns are neutral, because they are levels rather than movements.
 *
 * The value axis is deliberately NOT anchored at zero. A bridge shows movements
 * between two levels, and anchoring at zero compresses every driver into an
 * unreadable sliver. The truncation is disclosed in the footnote, and a zero
 * reference line is drawn whenever zero falls inside the plotted range.
 */

export interface WaterfallStep {
  label: string;
  value: number;
  kind: "start" | "delta" | "end";
  description?: string;
}

interface WaterfallChartProps {
  steps: WaterfallStep[];
  height?: number;
  scale?: "units" | "thousands" | "millions";
  /** Inverts sentiment, for bridges where a rise is adverse (e.g. cost). */
  invertSentiment?: boolean;
}

interface WaterfallRow {
  label: string;
  /** Transparent spacer that lifts the visible bar to its start point. */
  base: number;
  /** Magnitude of the visible bar. */
  magnitude: number;
  value: number;
  kind: WaterfallStep["kind"];
  runningTotal: number;
  description?: string;
}

function buildRows(steps: WaterfallStep[]): WaterfallRow[] {
  let running = 0;
  return steps.map((step) => {
    if (step.kind === "start") {
      running = step.value;
      return {
        label: step.label, base: 0, magnitude: step.value, value: step.value,
        kind: step.kind, runningTotal: running, description: step.description,
      };
    }
    if (step.kind === "end") {
      return {
        label: step.label, base: 0, magnitude: step.value, value: step.value,
        kind: step.kind, runningTotal: step.value, description: step.description,
      };
    }
    // A delta bar spans [running, running + value]; the base is the lower edge.
    const start = running;
    const end = running + step.value;
    running = end;
    return {
      label: step.label,
      base: Math.min(start, end),
      magnitude: Math.abs(step.value),
      value: step.value,
      kind: step.kind,
      runningTotal: running,
      description: step.description,
    };
  });
}

export function WaterfallChart({
  steps, height = 250, scale = "millions", invertSentiment = false,
}: WaterfallChartProps) {
  const tokens = useChartTokens();
  const rows = buildRows(steps);

  // Domain spans the LEVELS the staircase touches, not the zero-anchored start
  // and end columns. Including their base would drag the axis back to zero and
  // compress every driver into an unreadable sliver. Those two columns are
  // still drawn from zero, so they simply render as full columns clipped at the
  // axis floor -- which is how a bridge is meant to read.
  const levels = rows.flatMap((row) =>
    row.kind === "delta"
      ? [row.base, row.base + row.magnitude]
      : [row.value],
  );
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const padding = (max - min) * 0.18 || Math.abs(max) * 0.1 || 1;
  const domainMin = min - padding;
  const domainMax = max + padding;
  const axisTruncated = domainMin > 0;

  const colourFor = (row: WaterfallRow): string => {
    if (row.kind !== "delta") return tokens["series-3"];
    const favourable = invertSentiment ? row.value < 0 : row.value > 0;
    return favourable ? tokens["diverging-positive"] : tokens["diverging-negative"];
  };

  const legend: LegendEntry[] = [
    { id: "level", label: "Opening / closing", colour: tokens["series-3"], shape: "block" },
    { id: "fav", label: "Favourable", colour: tokens["diverging-positive"], shape: "block" },
    { id: "adv", label: "Adverse", colour: tokens["diverging-negative"], shape: "block" },
  ];

  const money = (value: number, showSign = false) =>
    formatCurrency(value, { scale, precision: 1, showSign, parentheses: !showSign });

  return (
    <ChartFrame
      unit={axisUnitLabel(scale)}
      legend={legend}
      height={height}
      footnote={
        axisTruncated
          ? "Value axis is truncated to the range of the bridge so each driver is legible."
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 14, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={tokens["grid-line"]} vertical={false} />
          <XAxis
            dataKey="label"
            {...axisProps(tokens)}
            interval={0}
            tick={{ fill: tokens["axis-text"], fontSize: 10 }}
          />
          <YAxis
            {...axisProps(tokens)}
            width={46}
            domain={[domainMin, domainMax]}
            // Without this Recharts widens the domain to fit the zero-anchored
            // base segments, undoing the truncation. Clipping is intended here:
            // the opening and closing columns run off the bottom of the frame.
            allowDataOverflow
            tickFormatter={(value: number) => formatAxis(value)}
          />
          {domainMin <= 0 && domainMax >= 0 && (
            <ReferenceLine y={0} stroke={tokens["border-strong"]} strokeWidth={1} />
          )}
          <Tooltip
            cursor={{ fill: tokens["surface-inset"], fillOpacity: 0.55 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as WaterfallRow;
              return (
                <TooltipShell
                  title={row.label}
                  subtitle={row.description}
                  rows={[
                    {
                      id: "value",
                      label: row.kind === "delta" ? "Movement" : "Value",
                      value: money(row.value, row.kind === "delta"),
                      colour: colourFor(row),
                    },
                    ...(row.kind === "delta"
                      ? [{ id: "running", label: "Running total", value: money(row.runningTotal), muted: true }]
                      : []),
                  ]}
                />
              );
            }}
          />
          {/* Transparent spacer carrying each bar to its starting height. */}
          <Bar dataKey="base" stackId="bridge" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="magnitude" stackId="bridge" radius={[2, 2, 0, 0]} maxBarSize={46} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell key={index} fill={colourFor(row)} />
            ))}
          </Bar>
          <Customized
            component={(chartProps: object) => (
              <Connectors
                {...(chartProps as { offset?: ConnectorOffset })}
                rows={rows}
                domain={[domainMin, domainMax]}
                stroke={tokens["border-strong"]}
              />
            )}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * Dashed connectors joining the top of each step to the base of the next.
 *
 * Rendered as a Recharts custom layer so it receives the resolved plot
 * geometry — the connector positions are computed from the same scale as the
 * bars rather than estimated, which is what keeps them attached when the
 * container resizes.
 */
interface ConnectorOffset {
  left: number;
  top: number;
  width: number;
  height: number;
}

function Connectors(props: {
  rows: WaterfallRow[];
  domain: [number, number];
  stroke: string;
  /** Plot geometry, injected by Recharts through <Customized>. */
  offset?: ConnectorOffset;
}) {
  const { rows, domain, stroke, offset } = props;
  if (!offset) return null;

  const [minValue, maxValue] = domain;
  const range = maxValue - minValue || 1;
  const toY = (value: number) =>
    offset.top + (1 - (value - minValue) / range) * offset.height;

  const bandWidth = offset.width / rows.length;
  const barHalf = Math.min(46, bandWidth * 0.6) / 2;

  const segments: { x1: number; x2: number; y: number }[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const centre = offset.left + bandWidth * (i + 0.5);
    const nextCentre = offset.left + bandWidth * (i + 1.5);
    const level = rows[i].runningTotal;
    segments.push({ x1: centre + barHalf, x2: nextCentre - barHalf, y: toY(level) });
  }

  return (
    <g aria-hidden>
      {segments.map((segment, index) => (
        <line
          key={index}
          x1={segment.x1}
          x2={segment.x2}
          y1={segment.y}
          y2={segment.y}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.7}
        />
      ))}
    </g>
  );
}
