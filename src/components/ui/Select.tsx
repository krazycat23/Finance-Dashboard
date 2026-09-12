import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * A native select styled to match the product. Native is deliberate: it gets
 * keyboard support, screen-reader semantics and mobile behaviour for free, and
 * a filter control is not the place to spend a custom-widget budget.
 */

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  /** Micro-label above the control. A bare "Group" reads as a noun, not a filter. */
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  width?: string;
}

export function Select({
  label, value, options, onChange, className, width = "w-[148px]",
}: SelectProps) {
  return (
    <label className={cn("flex flex-col gap-1", width, className)}>
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-tertiary">
        {label}
      </span>
      <div className="relative">
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "w-full appearance-none bg-panel border border-line rounded-[4px]",
            "pl-2.5 pr-7 py-[7px] text-[12.5px] text-primary font-medium",
            "hover:border-strong transition-colors cursor-pointer",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          strokeWidth={2}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
        />
      </div>
    </label>
  );
}
