import type { ReactNode } from "react";
import type { MetricPoint } from "@/domain/selectors/kpi";
import { cn } from "@/utils/cn";

/**
 * COVER BAND — THE FRONT OF THE BOOK
 * ---------------------------------------------------------------------------
 * The one place in the product that inverts. Every other page is ink on paper;
 * the cover is paper on ink, full-bleed to both edges of the measure, and it
 * is the only element allowed to shout.
 *
 * It sits on a silhouette of its own trailing year: the closed months behind
 * the headline, drawn as bare columns along the foot of the band with no axis,
 * no grid and no labels. It is not a chart and should not be read as one — it
 * is the shape of the year, the way a masthead photograph is the shape of a
 * story. The month being reported is the one column at full strength.
 *
 * Drawn with layout, not a charting library: twelve divs whose heights are a
 * share of the tallest. A chart library here would bring axes, tooltips and a
 * theme resolver to draw twelve rectangles, and would fight the ground it sits
 * on the whole way.
 */
export function CoverBand({
  eyebrow, stamp, title, figure, children, series, currentPeriodId,
}: {
  eyebrow: string;
  /** Small-caps qualifier set opposite the eyebrow, e.g. the period. */
  stamp: string;
  title: string;
  /** The headline figure block, set against the title. */
  figure: ReactNode;
  /** Supporting line beneath the title. */
  children?: ReactNode;
  /** The trailing year. Only closed months are drawn. */
  series: MetricPoint[];
  currentPeriodId: string;
}) {
  const closed = series.filter((point) => point.actual !== undefined);
  const values = closed.map((point) => point.actual ?? 0);
  const peak = Math.max(...values, 0);
  const trough = Math.min(...values, peak);

  /**
   * Indexed to the strongest month rather than to zero. A year of monthly
   * revenue sits in a narrow band — every month within a fifth of every other
   * — so a zero-based silhouette is a row of identical bricks and says nothing.
   * Indexing gives the year its shape back. It is a truncated scale, which is
   * why the foot of the band says so and why this is not offered as a chart:
   * the figure above it is the number, this is the shape.
   */
  const height = (value: number) => {
    if (peak <= 0) return 9;
    if (peak === trough) return 100;
    return 18 + 82 * ((value - trough) / (peak - trough));
  };

  return (
    <section className="-mx-8 lg:-mx-12 -mt-7 bg-cover-ground text-cover-on border-b-2 border-accent-warm">
      <div className="px-8 lg:px-12 pt-7 lg:pt-9 pb-7 lg:pb-9">
        <div className="flex items-baseline justify-between gap-6 flex-wrap">
          <span className="text-[10.5px] tracking-[0.16em] uppercase text-cover-on/55">
            {eyebrow}
          </span>
          <span className="text-[10.5px] tracking-[0.16em] uppercase text-cover-on/55 tnum">
            {stamp}
          </span>
        </div>

        {/* The headline and its figure share a baseline but not a column: the
            title takes the measure it needs and the figure hangs right, which
            is what stops the band reading as two stacked blocks. */}
        <div className="mt-6 lg:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-x-14 gap-y-8 items-end">
          <div className="min-w-0">
            <h1 className="font-serif font-normal tracking-[-0.018em] leading-[1.04] text-[clamp(34px,4.6vw,66px)] max-w-[15ch]">
              {title}
            </h1>
            {children && (
              <div className="mt-5 text-[13px] leading-relaxed text-cover-on/70 max-w-[52ch]">
                {children}
              </div>
            )}
          </div>
          <div className="lg:text-right shrink-0">{figure}</div>
        </div>

        {/* The year, along the foot. */}
        {closed.length > 1 && (
          <div className="mt-8 lg:mt-9">
            <div className="flex items-end gap-[3px] h-[96px]" aria-hidden>
              {closed.map((point) => {
                const isCurrent = point.period.id === currentPeriodId;
                return (
                  <div
                    key={point.period.id}
                    className={cn(
                      "flex-1 min-w-0 bg-cover-on",
                      isCurrent ? "opacity-95" : "opacity-[0.22]",
                    )}
                    style={{ height: `${height(point.actual ?? 0)}%` }}
                  />
                );
              })}
            </div>
            <div className="flex items-baseline justify-between gap-4 mt-2.5 pt-2.5 border-t border-cover-on/15">
              <span className="text-[10px] tracking-[0.14em] uppercase text-cover-on/45">
                {closed[0].period.shortLabel}
              </span>
              <span className="text-[10px] tracking-[0.14em] uppercase text-cover-on/45 hidden sm:inline">
                Trailing twelve months · indexed to the strongest
              </span>
              <span className="text-[10px] tracking-[0.14em] uppercase text-cover-on/70">
                {closed[closed.length - 1].period.shortLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
