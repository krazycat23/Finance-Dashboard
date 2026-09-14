import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { numberedNavigation } from "@/config/navigation";
import { cn } from "@/utils/cn";

/**
 * SIDEBAR — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * A contents page, not a toolbar. Each destination carries an editorial
 * numeral and a label; icons are dropped entirely, because eleven glyphs in a
 * column is decoration a finance reader never uses to navigate.
 *
 * The active state is a left rule plus weight — it survives both themes
 * without relying on a coloured pill.
 *
 * The numeral is aria-hidden: the accessible name of each link stays the plain
 * destination ("Sales"), which is what a screen-reader user asks for.
 */
export function Sidebar() {
  const { profile } = useReportingDataset();
  const groups = useMemo(() => numberedNavigation(), []);

  return (
    <nav
      aria-label="Primary"
      className="w-[216px] shrink-0 bg-nav border-r border-subtle flex flex-col h-screen sticky top-0"
    >
      <div className="px-5 h-[58px] flex flex-col justify-center border-b border-subtle shrink-0">
        <span className="font-serif text-[15px] leading-none tracking-[0.01em] text-primary truncate">
          {profile.shortName ?? profile.companyName}
        </span>
        <span className="eyebrow mt-[5px]">Reporting</span>
      </div>

      <div className="flex-1 overflow-y-auto py-5">
        {groups.map((group) => (
          <div key={group.id} className="mb-6 last:mb-0">
            {group.label && (
              <div className="eyebrow px-5 mb-2">{group.label}</div>
            )}
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-baseline gap-2.5 pl-5 pr-4 py-[7px]",
                        "type-control border-l-2 transition-colors",
                        isActive
                          ? "border-l-accent bg-inset text-primary font-semibold"
                          : "border-l-transparent text-secondary hover:text-primary hover:bg-inset/60",
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

      <div className="px-5 py-3.5 border-t border-subtle shrink-0">
        <div className="type-caption leading-snug">
          {profile.companyName} · {profile.tagline}
        </div>
        <div className="type-caption mt-0.5">
          Reporting currency {profile.reportingCurrency}
        </div>
      </div>
    </nav>
  );
}
