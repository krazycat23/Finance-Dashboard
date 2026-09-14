import { useFilters } from "@/app/providers/FilterProvider";
import { CompanySwitcher } from "./CompanySwitcher";
import { GlobalFilters } from "./GlobalFilters";
import { ThemeToggle } from "./ThemeToggle";

/**
 * TOP CONTROL BAR
 * ---------------------------------------------------------------------------
 * Every control that changes what the page reports lives here, on one rule,
 * once: company, entity, basis, period, theme. Pages below carry only the
 * selectors specific to their own content.
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
      <div className="max-w-[1760px] mx-auto px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6 flex-wrap py-3">
          <CompanySwitcher />
          <div className="flex items-end gap-3 flex-wrap">
            <GlobalFilters />
            <div className="pb-[1px]">
              <ThemeToggle />
            </div>
          </div>
        </div>
        <div className="border-t border-subtle py-[6px]">
          <p className="type-caption">
            {BASIS_LABEL[basis]} · {currentPeriod.label} · Fiscal{" "}
            {currentPeriod.fiscalYear} period {currentPeriod.fiscalPeriod}
          </p>
        </div>
      </div>
    </div>
  );
}
