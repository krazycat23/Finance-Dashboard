import { useEffect, useState } from "react";
import { useTheme } from "@/app/providers/ThemeProvider";

/**
 * CHART THEME BRIDGE
 * ---------------------------------------------------------------------------
 * Recharts needs concrete colour strings, not CSS variables, for several
 * properties. Rather than duplicating the palette in TypeScript — which is how
 * a design system drifts — this reads the resolved values back off the document
 * whenever the theme changes. The stylesheet stays the single source of truth.
 */

const TOKEN_KEYS = [
  "series-1", "series-2", "series-3", "series-4", "series-5", "series-reference",
  "cat-1", "cat-2", "cat-3", "cat-4", "cat-5",
  "seq-1", "seq-2", "seq-3", "seq-4", "seq-5", "seq-6", "seq-7",
  "positive", "negative", "neutral", "caution",
  "diverging-positive", "diverging-negative", "diverging-neutral",
  "grid-line", "axis-text", "text-primary", "text-secondary", "text-tertiary",
  "surface-panel", "surface-canvas", "surface-inset",
  "border-subtle", "border-default", "border-strong",
] as const;

type TokenKey = (typeof TOKEN_KEYS)[number];
export type ChartTokens = Record<TokenKey, string>;

function readTokens(): ChartTokens {
  const styles = getComputedStyle(document.documentElement);
  const tokens = {} as ChartTokens;
  for (const key of TOKEN_KEYS) {
    tokens[key] = styles.getPropertyValue(`--${key}`).trim();
  }
  return tokens;
}

export function useChartTokens(): ChartTokens {
  const { theme } = useTheme();
  const [tokens, setTokens] = useState<ChartTokens>(() =>
    typeof document === "undefined" ? ({} as ChartTokens) : readTokens(),
  );

  useEffect(() => {
    // The theme attribute is written in an effect too, so defer one frame to
    // read the values after the new cascade has applied.
    const id = requestAnimationFrame(() => setTokens(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return tokens;
}

/** Fixed-order categorical assignment. Never cycled, never sorted by rank. */
export function categoricalScale(tokens: ChartTokens): string[] {
  return [tokens["cat-1"], tokens["cat-2"], tokens["cat-3"], tokens["cat-4"], tokens["cat-5"]];
}

export function sequentialScale(tokens: ChartTokens): string[] {
  return [
    tokens["seq-1"], tokens["seq-2"], tokens["seq-3"], tokens["seq-4"],
    tokens["seq-5"], tokens["seq-6"], tokens["seq-7"],
  ];
}

/**
 * Colour for a categorical member, keyed by its STABLE id rather than its
 * position in the current sort. Filtering a chart must not repaint the members
 * that survive the filter.
 */
export function colourForMember(
  memberIds: string[],
  memberId: string,
  tokens: ChartTokens,
): string {
  const scale = categoricalScale(tokens);
  const index = memberIds.indexOf(memberId);
  if (index === -1 || index >= scale.length) return tokens["series-3"];
  return scale[index];
}

/** Step of the sequential ramp for a rank position out of `count`. */
export function sequentialStep(
  rank: number,
  count: number,
  tokens: ChartTokens,
): string {
  const scale = sequentialScale(tokens);
  if (count <= 1) return scale[0];
  const index = Math.round((rank / (count - 1)) * (scale.length - 1));
  return scale[Math.min(scale.length - 1, Math.max(0, index))];
}

/**
 * Diverging colour for a signed rate, normalised against `bound`.
 * Returns a background and the text colour that stays legible on it — colour is
 * never the only encoding, so the caller also prints the value.
 */
export function divergingFill(
  value: number | undefined,
  bound: number,
  tokens: ChartTokens,
): { background: string; opacity: number } {
  if (value === undefined || bound === 0) {
    return { background: tokens["diverging-neutral"], opacity: 1 };
  }
  const magnitude = Math.min(1, Math.abs(value) / bound);
  return {
    background: value >= 0 ? tokens["diverging-positive"] : tokens["diverging-negative"],
    // A floor keeps a near-zero cell visible as "measured but flat" rather than
    // indistinguishable from an empty cell.
    opacity: 0.1 + magnitude * 0.75,
  };
}

/**
 * Shared axis and grid configuration, so every chart lines up.
 *
 * North House charts are drawn like a printed exhibit: horizontal gridlines
 * only, a hairline baseline, no tick marks, and axis text at caption size in
 * the UI face so it never competes with the figures it labels.
 */
export function axisProps(tokens: ChartTokens) {
  return {
    tick: { fill: tokens["axis-text"], fontSize: 10.5, fontWeight: 500 },
    tickLine: false,
    axisLine: { stroke: tokens["border-default"], strokeWidth: 1 },
  } as const;
}
