import { cn } from "@/utils/cn";

/**
 * A restrained tab control used for in-section view switching (Revenue / Gross
 * Profit / EBITDA). Deliberately small, square and quiet: it is a control, not
 * a feature. The selected segment carries the theme accent — forest in Sand,
 * bronze in Obsidian — so the active measure is unmistakable in both.
 */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  "aria-label"?: string;
}

export function SegmentedControl<T extends string>({
  options, value, onChange, size = "sm", ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className="inline-flex items-stretch border border-line divide-x divide-[var(--border-subtle)]"
    >
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
              "type-control transition-colors whitespace-nowrap",
              size === "sm" ? "px-2.5 py-[5px]" : "px-3 py-[7px]",
              selected
                ? "bg-accent text-accent-on"
                : "text-secondary hover:text-primary hover:bg-inset",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
