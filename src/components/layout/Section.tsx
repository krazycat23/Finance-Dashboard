import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * EDITORIAL SECTION
 * ---------------------------------------------------------------------------
 * The North House replacement for a page full of floating cards: a numeral, a
 * heading, an optional standfirst and controls, separated from the section
 * above by a single strong rule.
 *
 * Content sits directly on the canvas. Nothing is boxed unless the content
 * itself is a discrete exhibit, which keeps the page reading as one document
 * rather than a tray of widgets.
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
}

export function Section({
  number, title, meta, description, actions, children, className,
}: SectionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="border-t border-strong pt-3.5 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-[720px]">
          <div className="flex items-baseline gap-3">
            {number && (
              <span aria-hidden className="type-section-number">
                {number}
              </span>
            )}
            <h2 className="type-section">{title}</h2>
            {meta && <span className="type-caption whitespace-nowrap">{meta}</span>}
          </div>
          {description && <p className="type-caption mt-1.5 max-w-[68ch]">{description}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-end gap-2">{actions}</div>}
      </div>
      <div className="mt-5 min-w-0">{children}</div>
    </section>
  );
}

/**
 * A framed exhibit inside a section — used where content genuinely needs an
 * edge (a chart plot, a dense table). One hairline, no radius, no shadow.
 */
export function Exhibit({
  children, className,
}: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border border-subtle bg-panel p-4 min-w-0", className)}>
      {children}
    </div>
  );
}
