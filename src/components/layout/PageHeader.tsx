import type { ReactNode } from "react";
import { useFilters } from "@/app/providers/FilterProvider";
import { GlobalFilters } from "./GlobalFilters";
import { ThemeToggle } from "./ThemeToggle";

/**
 * PAGE HEADER
 * ---------------------------------------------------------------------------
 * Eyebrow, editorial title, subtitle, and the global filters.
 *
 * The title uses the serif display face — the one place in the product it
 * appears. It is sized to read as a section heading in a board pack rather
 * than a hero banner: an analytical page cannot afford to spend a third of the
 * fold on a sentence that carries no data.
 *
 * The reporting context line states the fiscal position explicitly, because
 * "YTD · Mar 2026" means nothing without knowing the fiscal year it sits in.
 */

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Page-specific controls, shown beneath the filters. */
  actions?: ReactNode;
}

const BASIS_LABEL: Record<string, string> = {
  MTD: "Month to date",
  QTD: "Quarter to date",
  YTD: "Year to date",
  FY: "Full year",
  R12: "Rolling 12 months",
};

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  const { currentPeriod, basis } = useFilters();

  return (
    <header className="flex items-start justify-between gap-8 flex-wrap">
      <div className="min-w-0 max-w-[760px]">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="font-serif text-[29px] leading-[1.15] tracking-[-0.015em] text-primary mt-1.5">
          {title}
        </h1>
        <p className="text-[13px] text-secondary mt-2 leading-relaxed">{subtitle}</p>
        <p className="text-[11px] text-tertiary mt-2 tnum">
          {BASIS_LABEL[basis]} · {currentPeriod.label} · {currentPeriod.fiscalYear} period{" "}
          {currentPeriod.fiscalPeriod}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2.5 shrink-0">
        <div className="flex items-end gap-2">
          <GlobalFilters />
          <ThemeToggle />
        </div>
        {actions}
      </div>
    </header>
  );
}
