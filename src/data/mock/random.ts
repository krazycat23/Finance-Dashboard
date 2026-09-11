/**
 * Deterministic PRNG (mulberry32). The dataset must be identical on every
 * reload — a demo that reshuffles its numbers between screenshots is useless
 * for a board pack, and non-determinism would make the consistency checks in
 * `validate.ts` meaningless.
 */
export function createRandom(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Random {
  (): number;
}

/** Uniform in [min, max). */
export function between(rng: Random, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Small multiplicative noise around 1.0, e.g. jitter(rng, 0.03) -> 0.97..1.03 */
export function jitter(rng: Random, amplitude: number): number {
  return 1 + (rng() - 0.5) * 2 * amplitude;
}

export function pick<T>(rng: Random, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function round(value: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}
