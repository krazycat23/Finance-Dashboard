import { cn } from "@/utils/cn";

/**
 * A restrained tab control used for in-panel view switching (Revenue / Margin /
 * EBITDA). Deliberately small and quiet: it is a control, not a feature.
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
      className="inline-flex items-center gap-0.5 bg-inset border border-subtle rounded-[4px] p-0.5"
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
              "rounded-[3px] font-medium transition-colors whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]",
              selected
                ? "bg-panel text-primary border border-subtle"
                : "text-secondary hover:text-primary border border-transparent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
