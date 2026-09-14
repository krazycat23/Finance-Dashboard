import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";

/**
 * PAGE COLOPHON
 * ---------------------------------------------------------------------------
 * The foot of every page: who produced it, and on what basis. A long report
 * that ends on a table ends abruptly; a printed pack closes on a rule and a
 * line of provenance, and a reader who has scrolled a statement should be able
 * to see what period they were reading without scrolling back.
 */
export function PageColophon() {
  const { profile } = useReportingDataset();
  const { currentPeriod, basis } = useFilters();

  return (
    <footer className="mt-16 pt-4 border-t border-line flex items-baseline justify-between gap-6 flex-wrap">
      <span className="eyebrow">{profile.shortName ?? profile.companyName}</span>
      <span className="eyebrow text-right">
        {basis} · {currentPeriod.label} · {profile.reportingCurrency}
      </span>
    </footer>
  );
}
