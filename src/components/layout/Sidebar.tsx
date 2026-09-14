import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { numberedNavigation } from "@/config/navigation";
import { EditorialPlate } from "@/components/brand/EditorialPlate";
import { cn } from "@/utils/cn";

/**
 * SIDEBAR — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * A contents page, not a toolbar: a masthead, an editorially numbered index,
 * and a plate at the foot carrying the company's own line. Icons are dropped
 * entirely — eleven glyphs in a column is decoration a finance reader never
 * uses to navigate, and the numerals give them a stable index instead.
 *
 * The numeral is aria-hidden, so each link's accessible name stays the plain
 * destination ("Sales"), which is what a screen-reader user asks for.
 */
export function Sidebar() {
  const { profile } = useReportingDataset();
  const groups = useMemo(() => numberedNavigation(), []);

  return (
    <nav
      aria-label="Primary"
      className="w-[232px] shrink-0 bg-nav border-r border-line flex flex-col h-screen sticky top-0"
    >
      <div className="px-6 pt-6 pb-5">
        <div className="font-serif text-[19px] leading-[1.1] tracking-[-0.01em] text-primary">
          {profile.shortName ?? profile.companyName}
        </div>
        <div className="eyebrow mt-2.5 leading-[1.6]">{profile.tagline}</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-5 min-h-0">
        {groups.map((group) => (
          <div key={group.id} className="mb-6 last:mb-0">
            {group.label && <div className="eyebrow px-6 mb-2">{group.label}</div>}
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-baseline gap-3 pl-6 pr-4 py-[7px]",
                        "type-control border-l-2 transition-colors",
                        isActive
                          ? "border-l-accent bg-panel text-primary font-semibold"
                          : "border-l-transparent text-secondary hover:text-primary hover:bg-inset/70",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            "type-section-number shrink-0 w-[16px]",
                            isActive && "text-accent",
                          )}
                        >
                          {item.ordinal}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* The foot plate: the company's own line, set as the colophon of the
          pack rather than as a status bar. */}
      <EditorialPlate align="bottom" className="h-[186px] shrink-0 border-t border-line">
        <div className="text-[9px] font-semibold uppercase tracking-[0.15em] leading-[1.9]">
          {profile.companyName}
          <br />
          <span className="opacity-60">Reporting currency {profile.reportingCurrency}</span>
        </div>
      </EditorialPlate>
    </nav>
  );
}
