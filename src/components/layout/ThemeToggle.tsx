import { THEME_LABELS, useTheme, type ThemeMode } from "@/app/providers/ThemeProvider";
import { cn } from "@/utils/cn";

const ORDER: ThemeMode[] = ["sand", "obsidian"];

/**
 * THEME CONTROL
 * ---------------------------------------------------------------------------
 * Named, not iconographic. "Sand" and "Obsidian" are part of the product's
 * vocabulary, and a reader choosing a document ground should see what they are
 * choosing. The preference persists through the theme provider.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-stretch border border-line divide-x divide-[var(--border-subtle)]"
    >
      {ORDER.map((mode) => {
        const selected = mode === theme;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${THEME_LABELS[mode]} theme`}
            onClick={() => setTheme(mode)}
            className={cn(
              "type-control px-2.5 py-[6px] whitespace-nowrap transition-colors",
              selected
                ? "bg-accent text-accent-on"
                : "bg-transparent text-secondary hover:text-primary hover:bg-inset",
            )}
          >
            {THEME_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
