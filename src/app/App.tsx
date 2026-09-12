import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "./providers/ThemeProvider";
import { FilterProvider } from "./providers/FilterProvider";
import { ReportingDataProvider } from "./providers/ReportingDataProvider";
import { MockDataAdapter } from "@/data/mock";
import { ReportingAvailability } from "@/components/finance/ReportingAvailability";

const reportingAdapter = new MockDataAdapter();

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
 * Providers wrap the router so that theme and global filters survive
 * navigation. Routes mirror config/navigation.ts one-for-one.
 */
export function App() {
  return (
    <ReportingDataProvider adapter={reportingAdapter}>
      <ThemeProvider>
        <FilterProvider>
        <BrowserRouter>
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
        </BrowserRouter>
        </FilterProvider>
      </ThemeProvider>
    </ReportingDataProvider>
  );
}
