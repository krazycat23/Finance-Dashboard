import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { selectProfitAndLoss, selectSalesTotals, selectWeeklySales, selectBreakdown } from "@/domain/selectors";
import { reportingCapabilities, selectAvailable } from "@/domain/selectors/availability";
import { formatCurrency } from "@/utils/format";
import { ReportingUnavailable } from "./ReportingAvailability";

/** Partial imported datasets show only reported measures, not demo-era comparative assumptions. */
export function ConfiguredReporting({ mode }: { mode: "overview" | "pnl" | "sales" }) {
  const dataset = useReportingDataset();
  const { selection } = useFilters();
  const caps = reportingCapabilities(dataset);
  const pnl = mode !== "sales" ? selectAvailable("pnl", () => selectProfitAndLoss(selection)) : null;
  const sales = mode !== "pnl" && caps.hasSales ? selectSalesTotals(selection) : null;
  const weekly = mode !== "pnl" ? selectAvailable("weekly", () => selectWeeklySales(selection)) : null;
  const channels = sales && dataset.dimensions.channels.length ? selectBreakdown(selection, "channelId") : [];
  return <>
    <PageHeader eyebrow={mode === "overview" ? "Executive Overview" : mode === "pnl" ? "Profit & Loss" : "Sales"} title={dataset.profile.companyName} subtitle="Reported results from the active company. Unconfigured comparisons and modules are omitted."/>
    <PageSections>
      {pnl && <Panel><PanelHeader title="Profit & Loss" meta={`${selection.basis} · ${dataset.profile.reportingCurrency}`}/><PanelBody>
        <table className="w-full text-sm"><thead><tr><th className="text-left">Measure</th><th className="text-right">Actual</th>{caps.hasBudget && <th className="text-right">Budget</th>}</tr></thead><tbody>{pnl.map(row => <tr key={row.line} className="border-t border-subtle"><td className="py-2">{row.label}</td><td className="text-right tnum">{formatCurrency(row.actual, { scale: "units" })}</td>{caps.hasBudget && <td className="text-right tnum">{row.budget === undefined ? "—" : formatCurrency(row.budget, { scale: "units" })}</td>}</tr>)}</tbody></table>
      </PanelBody></Panel>}
      {sales && <Panel><PanelHeader title="Monthly sales"/><PanelBody><div className="text-xl tnum">{formatCurrency(sales.revenue, { scale: "units" })}</div>{channels.length > 0 && <table className="mt-3 w-full text-sm"><thead><tr><th className="text-left">Channel</th><th className="text-right">Revenue</th></tr></thead><tbody>{channels.map(channel => <tr key={channel.id}><td>{channel.name}</td><td className="text-right">{formatCurrency(channel.revenue, { scale: "units" })}</td></tr>)}</tbody></table>}</PanelBody></Panel>}
      {weekly && <Panel><PanelHeader title="Weekly sales" meta="Reported calendar weeks through the selected month"/><PanelBody>{weekly.length ? <table className="w-full text-sm"><thead><tr><th className="text-left">Week</th><th className="text-right">Revenue</th><th className="text-right">Prior year</th></tr></thead><tbody>{weekly.map(point => <tr key={point.week.id}><td>{point.week.label}</td><td className="text-right">{formatCurrency(point.revenue, { scale: "units" })}</td><td className="text-right">{point.priorYear === undefined ? "Unavailable" : formatCurrency(point.priorYear, { scale: "units" })}</td></tr>)}</tbody></table> : <p className="text-sm text-secondary">No reported weeks fall within the selected reporting date.</p>}</PanelBody></Panel>}
      {mode === "sales" && !caps.hasWeeklySales && <ReportingUnavailable message="Weekly sales data has not been mapped."/>}
      {!pnl && !sales && !weekly && <ReportingUnavailable message="Reporting data has not been configured for this company."/>}
      {mode === "overview" && <p className="text-xs text-tertiary">Additional reporting modules can be configured in Data & Mapping.</p>}
    </PageSections>
  </>;
}
