/**
 * COMPENSATED SUMMATION
 * ---------------------------------------------------------------------------
 * A trial balance reconciliation is proved to the cent across more than a
 * hundred thousand values. Naive floating-point addition drifts by roughly a
 * dollar at that scale, which would force a reconciliation tolerance wide
 * enough to hide a real mapping gap. Neumaier summation keeps the running
 * error and folds it back, so the totals stay exact and the tolerance can stay
 * tight enough to be worth something.
 */
export function sum(values: Iterable<number>): number {
  let total = 0;
  let compensation = 0;
  for (const value of values) {
    const next = total + value;
    compensation += Math.abs(total) >= Math.abs(value)
      ? (total - next) + value
      : (value - next) + total;
    total = next;
  }
  return total + compensation;
}

export class Accumulator {
  private total = 0;
  private compensation = 0;
  add(value: number): void {
    const next = this.total + value;
    this.compensation += Math.abs(this.total) >= Math.abs(value)
      ? (this.total - next) + value
      : (value - next) + this.total;
    this.total = next;
  }
  get value(): number {
    return this.total + this.compensation;
  }
}
