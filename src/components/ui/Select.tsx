import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * A native select styled to the North House control scale. Native is
 * deliberate: it gets keyboard support, screen-reader semantics and mobile
 * behaviour for free, and a filter control is not the place to spend a
 * custom-widget budget.
 *
 * Square, hairline-bordered, with the label set as a small caps micro-label —
 * an unlabelled dropdown reading "Group" is a noun, not a filter.
 */

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  width?: string;
  disabled?: boolean;
}

export function Select({
  label, value, options, onChange, className, width = "w-[148px]", disabled,
}: SelectProps) {
  return (
    <label className={cn("flex flex-col gap-[5px]", width, className)}>
      <span className="type-label">{label}</span>
      <div className="relative">
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "w-full appearance-none bg-panel border border-line",
            "pl-2.5 pr-7 py-[6px] type-control",
            "hover:border-strong transition-colors cursor-pointer",
            "disabled:opacity-60 disabled:cursor-progress",
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
        />
      </div>
    </label>
  );
}
