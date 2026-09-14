import { useFilters } from "@/app/providers/FilterProvider";
import { CompanySwitcher } from "./CompanySwitcher";
import { GlobalFilters } from "./GlobalFilters";
import { ThemeToggle } from "./ThemeToggle";

/**
 * TOP CONTROL BAR
 * ---------------------------------------------------------------------------
 * Every control that changes what the page reports, on one rule: company,
 * entity, basis, period, theme. Set as a single line of chips rather than a
 * row of form fields, so the bar reads as the pack's reporting context and
 * leaves the page below to be the document.
 *
 * It is sticky because a reader scrolling a long statement must be able to see
 * which company and period the figures belong to without scrolling back.
 */

const BASIS_LABEL: Record<string, string> = {
  MTD: "Month to date",
  QTD: "Quarter to date",
  YTD: "Year to date",
  FY: "Full year",
  R12: "Rolling 12 months",
};

export function TopBar() {
  const { currentPeriod, basis } = useFilters();

  return (
    <div className="sticky top-0 z-20 bg-canvas border-b border-line">
      <div className="max-w-[1760px] mx-auto px-8 lg:px-12">
        <div className="h-[58px] flex items-center justify-between gap-6">
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
            <CompanySwitcher />
            <GlobalFilters />
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <span className="type-caption hidden xl:inline whitespace-nowrap">
              {BASIS_LABEL[basis]} · Fiscal {currentPeriod.fiscalYear} P
              {currentPeriod.fiscalPeriod}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
