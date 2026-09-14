import type { ReactNode } from "react";
import { EditorialPlate } from "@/components/brand/EditorialPlate";
import { cn } from "@/utils/cn";

/**
 * MASTHEAD
 * ---------------------------------------------------------------------------
 * The opening spread of a reporting page, shared by every page that has one so
 * the pack cannot drift section to section.
 *
 * Three columns divided by hairlines at roughly 55 / 20 / 25 — the proportions
 * of a report cover rather than of a dashboard header:
 *
 *   the statement    eyebrow, title, standfirst, lede
 *   the commentary   whatever the selectors reported, never invented here
 *   the plate        the reporting context, set on the brand plate
 *
 * Commentary is optional and is passed in by the page; this component never
 * writes a sentence about the numbers.
 */

export interface MastheadContextEntry {
  label: string;
  value: ReactNode;
}

interface MastheadProps {
  eyebrow: string;
  /** The page's own h1. */
  title: string;
  /** A short serif line under the title — the page's standfirst. */
  standfirst?: string;
  /** One sentence of reporting context. */
  lede?: string;
  commentary?: string;
  commentaryLabel?: string;
  /** Reporting context, rendered on the plate's caption band. */
  context: MastheadContextEntry[];
  /** Narrows the title measure where a page title is short. */
  titleClassName?: string;
}

export function Masthead({
  eyebrow, title, standfirst, lede, commentary,
  commentaryLabel = "Finance commentary", context, titleClassName,
}: MastheadProps) {
  return (
    <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.95fr)] gap-x-9 gap-y-7">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className={cn("type-display mt-3.5", titleClassName ?? "max-w-[20ch]")}>{title}</h1>
        {standfirst && (
          <>
            <p className="font-serif text-[17px] leading-[1.4] text-secondary mt-2.5">
              {standfirst}
            </p>
            <div className="w-9 h-px bg-[var(--border-strong)] mt-4" />
          </>
        )}
        {lede && <p className="type-body-lead mt-4 max-w-[52ch]">{lede}</p>}
      </div>

      {commentary && (
        <div className="min-w-0 lg:border-l lg:border-subtle lg:pl-9">
          <div className="eyebrow">{commentaryLabel}</div>
          <p className="font-serif text-[15px] leading-[1.5] text-primary mt-3.5">{commentary}</p>
          <div className="w-8 h-px bg-[var(--border-strong)] mt-4" />
        </div>
      )}

      <EditorialPlate className="min-h-[218px] hidden lg:flex" align="bottom">
        <dl className="grid grid-cols-2 gap-x-6 text-[9px] font-semibold uppercase tracking-[0.15em] leading-[1.9]">
          {context.map((entry) => (
            <div key={entry.label}>
              <dt className="opacity-60">{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      </EditorialPlate>
    </header>
  );
}
