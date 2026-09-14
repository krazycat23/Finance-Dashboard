import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * EDITORIAL SECTION
 * ---------------------------------------------------------------------------
 * The North House alternative to a page of cards: a numeral, a heading, an
 * optional standfirst and controls, separated from what came before by a
 * single rule. Content sits directly on the canvas — charts and tables carry
 * no container of their own, so the page reads as one document rather than a
 * tray of widgets.
 *
 * The numeral is set large and in the display serif. It is the page's index —
 * the thing that tells a reader where they are in the pack — so it is a
 * visible part of the composition rather than a caption above the title.
 */

interface SectionProps {
  /** Editorial numeral, e.g. "01". Decorative, hidden from assistive tech. */
  number?: string;
  title: string;
  /** Short qualifier after the title — the basis, the unit, the comparison. */
  meta?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Omits the section's own top rule, where a parent row already draws one. */
  flushTop?: boolean;
}

export function Section({
  number, title, meta, description, actions, children, className, flushTop,
}: SectionProps) {
  return (
    <section className={cn("min-w-0 flex flex-col", className)}>
      <div
        className={cn(
          "flex items-start justify-between gap-6 flex-wrap",
          !flushTop && "border-t border-strong pt-4",
        )}
      >
        <div className="min-w-0 max-w-[760px]">
          <div className="flex items-baseline gap-3.5">
            {number && (
              <span
                aria-hidden
                className="font-serif text-[26px] leading-none text-tertiary tnum tracking-[-0.02em]"
              >
                {number}
              </span>
            )}
            <h2 className="type-section text-[17px]">{title}</h2>
            {meta && <span className="type-caption whitespace-nowrap">{meta}</span>}
          </div>
          {description && <p className="type-caption mt-2 max-w-[62ch]">{description}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-end gap-2">{actions}</div>}
      </div>
      <div className="mt-5 min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * A paired row of sections — the 60/40 spread the reporting pack is built on.
 * One rule runs across both columns and a hairline divides them, so the two
 * read as one spread rather than two stacked modules.
 */
export function SectionRow({
  children, className, split = "60/40",
}: {
  children: ReactNode;
  className?: string;
  split?: "60/40" | "50/50";
}) {
  return (
    <div className="border-t border-strong">
      <div
        className={cn(
          "grid grid-cols-1 gap-x-10 gap-y-9 pt-4",
          split === "60/40"
            ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
            : "lg:grid-cols-2",
          // The divider is a rule on the second column, so it disappears with
          // the columns when the row stacks at laptop width and below.
          "[&>*:nth-child(2)]:lg:border-l [&>*:nth-child(2)]:lg:border-subtle",
          "[&>*:nth-child(2)]:lg:pl-10",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
