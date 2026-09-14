import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  TrendingUp,
  FileText,
  Scale,
  Banknote,
  LineChart,
  Gauge,
  GitCompareArrows,
  FileBarChart,
  Database,
  Settings,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /**
   * Editorial numeral shown beside the label ("01 Overview"). Assigned once,
   * in document order, by `numberedNavigation()` — never hand-maintained, so
   * reordering a group cannot leave two items sharing a number.
   */
  ordinal?: string;
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

/**
 * Grouped rather than a flat list of eleven: an executive scans by category.
 * Groups are configuration, so a client can reorder or hide sections.
 *
 * Routes are unchanged by the North House redesign — only their presentation.
 */
export const navigation: NavGroup[] = [
  {
    id: "performance",
    label: "Performance",
    items: [
      { id: "overview", label: "Overview", path: "/", icon: LayoutGrid },
      { id: "sales", label: "Sales", path: "/sales", icon: TrendingUp },
      { id: "kpis", label: "KPIs", path: "/kpis", icon: Gauge },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    items: [
      { id: "pnl", label: "Profit & Loss", path: "/profit-and-loss", icon: FileText },
      { id: "balance-sheet", label: "Balance Sheet", path: "/balance-sheet", icon: Scale },
      { id: "cash-flow", label: "Cash Flow", path: "/cash-flow", icon: Banknote },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    items: [
      { id: "forecasts", label: "Forecasts", path: "/forecasts", icon: LineChart },
      { id: "variance", label: "Variance Analysis", path: "/variance", icon: GitCompareArrows },
      { id: "reports", label: "Reports", path: "/reports", icon: FileBarChart },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { id: "data-mapping", label: "Data & Mapping", path: "/data-mapping", icon: Database },
      { id: "settings", label: "Settings", path: "/settings", icon: Settings },
    ],
  },
];

/**
 * Navigation with a running ordinal across every group, in document order.
 * The numeral is decoration with a purpose: it gives a reader a stable index
 * for a section ("see 04") the way a report's contents page does.
 */
export function numberedNavigation(groups: NavGroup[] = navigation): NavGroup[] {
  let counter = 0;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      counter += 1;
      return { ...item, ordinal: String(counter).padStart(2, "0") };
    }),
  }));
}
