import type { FavourableDirection, MetricDefinition } from "./types";

/**
 * VARIANCE SEMANTICS
 * ---------------------------------------------------------------------------
 * Two orthogonal facts about a change, deliberately kept apart:
 *
 *   direction  — did the number go up or down?   (encoded as a glyph)
 *   sentiment  — is that good, bad or neither?   (encoded as colour)
 *
 * Keeping them separate is what lets "Markdown impact −12.6%" read as
 * favourable while "Operating costs +3.9%" reads as adverse, and it means the
 * variance is still legible without colour perception.
 */

export type Direction = "up" | "down" | "flat";
export type Sentiment = "positive" | "negative" | "neutral";

export interface Variance {
  /** current − comparison */
  absolute: number;
  /** Proportional change; undefined when the comparison base is zero. */
  relative?: number;
  direction: Direction;
  sentiment: Sentiment;
}

/** Movements below this fraction of the base are reported as flat. */
const FLAT_THRESHOLD = 0.0005;

export function resolveSentiment(
  direction: Direction,
  favourable: FavourableDirection,
): Sentiment {
  if (direction === "flat" || favourable === "neutral") return "neutral";
  return direction === favourable ? "positive" : "negative";
}

export function calculateVariance(
  current: number,
  comparison: number | undefined,
  metric: Pick<MetricDefinition, "favourableDirection">,
): Variance | undefined {
  if (comparison === undefined || !Number.isFinite(comparison)) return undefined;

  const absolute = current - comparison;
  const base = Math.abs(comparison);
  const relative = base === 0 ? undefined : absolute / base;

  const isFlat =
    base === 0 ? absolute === 0 : Math.abs(absolute) / base < FLAT_THRESHOLD;
  const direction: Direction = isFlat ? "flat" : absolute > 0 ? "up" : "down";

  return {
    absolute,
    relative,
    direction,
    sentiment: resolveSentiment(direction, metric.favourableDirection),
  };
}

/**
 * Variance for a statement row, where the favourable direction is a property
 * of the line rather than of a registered metric. `inverse` marks cost lines,
 * on which spending less than budget is favourable.
 */
export function calculateStatementVariance(
  actual: number,
  comparison: number | undefined,
  inverse = false,
): Variance | undefined {
  return calculateVariance(actual, comparison, {
    favourableDirection: inverse ? "down" : "up",
  });
}
