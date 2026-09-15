import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { OrderFlowPoint } from "@/domain/selectors/sales";
import { axisUnitLabel, formatAxis, formatCurrency } from "@/utils/format";
import { axisProps, useChartTokens } from "./chartTheme";
import { ChartFrame, type LegendEntry } from "./ChartFrame";
import { TooltipShell } from "./ChartTooltip";

/**
 * ORDERS WRITTEN AGAINST ORDERS DELIVERED
 * ---------------------------------------------------------------------------
 * Two columns and a line, which is the conventional reading of an order book:
 * the columns are the two flows, and the line is the balance they leave behind.
 *
 * The bank is an order of magnitude smaller than a month's trading, so it
 * carries its own axis on the right. Both axes are labelled, and the bank's
 * axis is drawn in the bank's own colour, because a second scale that is not
 * obviously a second scale is worse than no second scale at all.
 */
export function OrderFlowChart({
  data, height = 280, scale = "millions",
}: {
  data: OrderFlowPoint[];
  height?: number;
  scale?: "units" | "thousands" | "millions";
}) {
  const tokens = useChartTokens();

  const rows = data.map((point) => ({
    label: point.period.shortLabel,
    fullLabel: `${point.period.label} · ${point.period.fiscalYear}`,
    written: point.written,
    delivered: point.delivered,
    bank: point.bank,
  }));

  const legend: LegendEntry[] = [
    { id: "written", label: "Written", colour: tokens["series-1"], shape: "block" },
    { id: "delivered", label: "Delivered", colour: tokens["series-5"], shape: "block" },
    { id: "bank", label: "Order bank", colour: tokens["series-reference"], shape: "line" },
  ];

  const money = (value: number) => formatCurrency(value, { scale, precision: 2 });

  return (
    <ChartFrame
      unit={axisUnitLabel(scale)}
      legend={legend}
      height={height}
      footnote="The bank is a balance — every order written less every order delivered — and is read against the right-hand axis."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={tokens["grid-line"]} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" {...axisProps(tokens)} />
          <YAxis
            yAxisId="flow"
            {...axisProps(tokens)}
            width={44}
            tickFormatter={(value: number) => formatAxis(value)}
          />
          <YAxis
            yAxisId="bank"
            orientation="right"
            {...axisProps(tokens)}
            width={44}
            tick={{ fill: tokens["series-reference"], fontSize: 10 }}
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
                    { id: "w", label: "Written", value: money(row.written), colour: tokens["series-1"] },
                    { id: "d", label: "Delivered", value: money(row.delivered), colour: tokens["series-5"] },
                    { id: "b", label: "Order bank", value: money(row.bank), colour: tokens["series-reference"] },
                  ]}
                />
              );
            }}
          />
          <Bar yAxisId="flow" dataKey="written" fill={tokens["series-1"]} maxBarSize={13} isAnimationActive={false} />
          <Bar yAxisId="flow" dataKey="delivered" fill={tokens["series-5"]} maxBarSize={13} isAnimationActive={false} />
          <Line
            yAxisId="bank"
            dataKey="bank"
            stroke={tokens["series-reference"]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
