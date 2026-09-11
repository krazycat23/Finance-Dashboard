import { NavLink } from "react-router-dom";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { navigation } from "@/config/navigation";
import { cn } from "@/utils/cn";

/**
 * SIDEBAR
 * ---------------------------------------------------------------------------
 * Grouped navigation. Eleven flat items make an executive read the whole list
 * every time; four labelled groups make the target findable by category.
 *
 * Branding is read from configuration, and the footer is deliberately compact —
 * persistent chrome that a daily user resents is worse than no chrome at all.
 */

export function Sidebar() {
  const { profile } = useReportingDataset();
  return (
    <nav
      aria-label="Primary"
      className="w-[212px] shrink-0 bg-nav border-r border-subtle flex flex-col h-screen sticky top-0"
    >
      <div className="px-5 h-[52px] flex items-center border-b border-subtle shrink-0">
        <span className="text-[12.5px] font-semibold tracking-[0.16em] uppercase text-primary truncate">
          {profile.shortName ?? profile.companyName}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-2.5">
        {navigation.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            {group.label && (
              <div className="eyebrow px-2.5 mb-1.5">{group.label}</div>
            )}
            <ul className="flex flex-col gap-[1px]">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-2.5 py-[7px] rounded-[4px]",
                        "text-[12.5px] transition-colors",
                        isActive
                          ? "bg-accent-soft text-primary font-medium"
                          : "text-secondary hover:text-primary hover:bg-inset",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={14}
                          strokeWidth={isActive ? 2.25 : 1.75}
                          className="shrink-0"
                        />
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

      <div className="px-4 py-3 border-t border-subtle shrink-0">
        <div className="text-[10.5px] text-tertiary leading-snug">
          {profile.companyName} · {profile.tagline}
        </div>
        <div className="text-[10.5px] text-tertiary tnum mt-0.5">
          Reporting currency {profile.reportingCurrency}
        </div>
      </div>
    </nav>
  );
}
