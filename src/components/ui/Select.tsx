import { ChevronDown } from "lucide-react";
import { cn } from "@/utils/cn";

/**
 * A native select styled to the North House control scale. Native is
 * deliberate: it gets keyboard support, screen-reader semantics and mobile
 * behaviour for free, and a filter control is not the place to spend a
 * custom-widget budget.
 *
 * Two presentations of the same control:
 *
 *   stacked  a micro-label above the field — for forms and dense panels
 *   chip     the label set inline before the value, on one rule — for the
 *            global control bar, where four filters have to read as a single
 *            line of context rather than four stacked form fields
 *
 * The label is on the element either way: an unlabelled dropdown reading
 * "Group" is a noun, not a filter.
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
  variant?: "stacked" | "chip";
  /**
   * Shorter text for the visible label where the full one would crowd the
   * control bar. `label` still names the control for assistive technology and
   * for tests, so shortening the display never renames the field.
   */
  displayLabel?: string;
}

export function Select({
  label, value, options, onChange, className, width = "w-[148px]", disabled,
  variant = "stacked", displayLabel,
}: SelectProps) {
  if (variant === "chip") {
    return (
      <label
        className={cn(
          "group inline-flex items-center gap-2 border border-line bg-panel",
          "pl-2.5 pr-2 py-[5px] min-w-0 hover:border-strong transition-colors",
          className,
        )}
      >
        <span className="type-label shrink-0">{displayLabel ?? label}</span>
        <span className="relative inline-flex items-center min-w-0">
          <select
            aria-label={label}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={cn(
              "appearance-none bg-transparent pr-5 type-control cursor-pointer",
              "truncate max-w-[164px] disabled:opacity-60 disabled:cursor-progress",
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
            className="absolute right-0 text-tertiary pointer-events-none"
          />
        </span>
      </label>
    );
  }

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
