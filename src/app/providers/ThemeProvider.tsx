import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { useReportingDataset } from "./ReportingDataProvider";

/**
 * THEME
 * ---------------------------------------------------------------------------
 * Two valuations of one design system:
 *
 *   sand      North House — Sand      warm ivory canvas, deep forest, stone
 *   obsidian  North House — Obsidian  near-black charcoal, ivory type, bronze
 *
 * There is exactly one set of components; the theme only changes token values.
 */
export type ThemeMode = "sand" | "obsidian";

export const THEME_LABELS: Record<ThemeMode, string> = {
  sand: "Sand",
  obsidian: "Obsidian",
};

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "reporting-engine:theme";

/**
 * Company profiles (and any preference stored before the North House rebrand)
 * speak in light/dark. They map onto the two themes rather than being rejected,
 * so an existing preference survives the redesign.
 */
function normaliseTheme(value: string | null | undefined): ThemeMode | undefined {
  if (value === "sand" || value === "light") return "sand";
  if (value === "obsidian" || value === "dark") return "obsidian";
  return undefined;
}

function readInitialTheme(defaultTheme: string | undefined): ThemeMode {
  try {
    const stored = normaliseTheme(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Private browsing or blocked storage: fall through to the configured default.
  }
  return normaliseTheme(defaultTheme) ?? "sand";
}

/**
 * Theme is applied by stamping `data-theme` on <html>. Every token — including
 * the ones the charts read — is defined against that attribute, so the DOM and
 * the SVG charts change in the same paint rather than in two steps.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useReportingDataset();
  const [theme, setThemeState] = useState<ThemeMode>(() => readInitialTheme(profile.defaultTheme));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persistence is a convenience, never a requirement.
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === "sand" ? "obsidian" : "sand")),
    [],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
