import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/providers/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="w-[30px] h-[30px] flex items-center justify-center rounded-[4px] border border-line text-secondary hover:text-primary hover:border-strong transition-colors"
    >
      {theme === "light" ? <Moon size={14} strokeWidth={1.9} /> : <Sun size={14} strokeWidth={1.9} />}
    </button>
  );
}
