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
}

export interface NavGroup {
  id: string;
  label?: string;
  items: NavItem[];
}

/**
 * Grouped rather than a flat list of eleven: an executive scans by category.
 * Groups are configuration, so a client can reorder or hide sections.
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
