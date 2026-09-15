import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "./providers/ThemeProvider";
import { FilterProvider } from "./providers/FilterProvider";
import { ReportingDataProvider } from "./providers/ReportingDataProvider";
import { ReportingAvailability } from "@/components/finance/ReportingAvailability";
import { OverviewPage } from "@/pages/overview/OverviewPage";
import { SalesPage } from "@/pages/sales/SalesPage";
import { ProfitAndLossPage } from "@/pages/pnl/ProfitAndLossPage";
import { BalanceSheetPage } from "@/pages/balance-sheet/BalanceSheetPage";
import { CashFlowPage } from "@/pages/cash-flow/CashFlowPage";
import { ForecastsPage } from "@/pages/forecasts/ForecastsPage";
import { KpisPage } from "@/pages/kpis/KpisPage";
import { VariancePage } from "@/pages/variance/VariancePage";
import { ReportsPage } from "@/pages/reports/ReportsPage";
import { DataMappingPage } from "@/pages/data-mapping/DataMappingPage";
import { SettingsPage } from "@/pages/settings/SettingsPage";

/**
 * The application serves paths, which needs a host that rewrites unknown paths
 * onto index.html. A static preview build has no such host, so VITE_HASH_ROUTES
 * switches the same routes onto the fragment and the build becomes portable —
 * openable from a subdirectory, a file share or a review link.
 *
 * It changes the shape of the URL and nothing else: the route table below is
 * the one and only definition either way.
 */
const Router = import.meta.env.VITE_HASH_ROUTES === "true" ? HashRouter : BrowserRouter;

/**
 * Which company adapter the application opens with. The registry is the only
 * place adapters are named; this just chooses between the ids it already
 * publishes, so adding a company never touches this file.
 *
 * `?adapter=<id>` wins so a build can be pointed at a company without being
 * rebuilt, then the build-time default, then the reference demo.
 */
function selectedAdapterId(): string {
  const requested = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("adapter");
  return requested?.trim() || import.meta.env.VITE_COMPANY_ADAPTER || "reference-demo";
}

/**
 * Providers wrap the router so that theme and global filters survive
 * navigation. Routes mirror config/navigation.ts one-for-one.
 */
export function App() {
  return (
    <ReportingDataProvider adapter={selectedAdapterId()}>
      <ThemeProvider>
        <FilterProvider>
        <Router>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="sales" element={<ReportingAvailability module="sales"><SalesPage /></ReportingAvailability>} />
              <Route path="profit-and-loss" element={<ReportingAvailability module="pnl"><ProfitAndLossPage /></ReportingAvailability>} />
              <Route path="balance-sheet" element={<ReportingAvailability module="balance"><BalanceSheetPage /></ReportingAvailability>} />
              <Route path="cash-flow" element={<ReportingAvailability module="cashflow"><CashFlowPage /></ReportingAvailability>} />
              <Route path="forecasts" element={<ReportingAvailability module="forecast"><ForecastsPage /></ReportingAvailability>} />
              <Route path="kpis" element={<ReportingAvailability module="kpis"><KpisPage /></ReportingAvailability>} />
              <Route path="variance" element={<ReportingAvailability module="variance"><VariancePage /></ReportingAvailability>} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="data-mapping" element={<DataMappingPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Router>
        </FilterProvider>
      </ThemeProvider>
    </ReportingDataProvider>
  );
}
