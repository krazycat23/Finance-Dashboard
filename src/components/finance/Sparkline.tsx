/**
 * SPARKLINE
 * ---------------------------------------------------------------------------
 * A twelve-period actual series, drawn without axes. Deliberately constrained:
 *
 *  - it is never extended into periods that have not closed
 *  - it carries no colour meaning of its own; sentiment lives on the variance
 *    figure beside it, so the two never contradict each other
 *  - it is decoration-free: a single hairline, no dots and no fill. North
 *    House uses no gradients, and at this size a tinted area under the line
 *    reads as a slab of colour rather than as a trend.
 */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  /** Accessible description; the card supplies the metric name. */
  title?: string;
}

export function Sparkline({
  values, width = 84, height = 26, stroke = "var(--series-2)", title,
}: SparklineProps) {
  if (values.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.abs(max) || 1;
  const padding = 2;
  const usableHeight = height - padding * 2;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = padding + (1 - (value - min) / range) * usableHeight;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title ? `${title} trend, last ${values.length} periods` : undefined}
      className="overflow-visible"
    >
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
