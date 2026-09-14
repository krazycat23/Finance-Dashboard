import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * TAB BAR
 * ---------------------------------------------------------------------------
 * A ruled row of views with an underlined active tab, and room for one action
 * at the trailing edge.
 *
 * Distinct from SegmentedControl on purpose: a segmented control switches a
 * measure INSIDE a section, while this switches what the whole page is
 * showing. Giving the two jobs the same control makes a page read as one
 * undifferentiated surface, which is exactly what an editorial layout is
 * trying to avoid.
 */

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown after the label. */
  count?: number;
}

interface TabBarProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** A single trailing action, e.g. a link out. */
  action?: ReactNode;
  "aria-label"?: string;
}

export function TabBar<T extends string>({
  options, value, onChange, action, ...rest
}: TabBarProps<T>) {
  return (
    <div className="flex items-end justify-between gap-6 border-b border-line">
      <div role="tablist" aria-label={rest["aria-label"]} className="flex items-end gap-1 min-w-0 overflow-x-auto no-scrollbar">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "type-control px-3 pb-2.5 pt-1 whitespace-nowrap transition-colors",
                "border-b-2 -mb-px",
                selected
                  ? "border-b-accent text-primary font-semibold"
                  : "border-b-transparent text-secondary hover:text-primary",
              )}
            >
              {option.label}
              {option.count !== undefined && (
                <span className={cn("ml-2 tnum", selected ? "text-secondary" : "text-tertiary")}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {action && <div className="shrink-0 pb-2.5">{action}</div>}
    </div>
  );
}
