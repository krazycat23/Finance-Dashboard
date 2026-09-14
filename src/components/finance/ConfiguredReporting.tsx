import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Section } from "@/components/layout/Section";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { selectProfitAndLoss, selectSalesTotals, selectWeeklySales, selectBreakdown } from "@/domain/selectors";
import type { StatementRow } from "@/domain/models";
import type { DimensionBreakdown, WeeklyPoint } from "@/domain/selectors/sales";
import { reportingCapabilities, selectAvailable } from "@/domain/selectors/availability";
import { formatCurrency } from "@/utils/format";
import { ReportingUnavailable } from "./ReportingAvailability";

/**
 * CONFIGURED REPORTING
 * ---------------------------------------------------------------------------
 * Partial imported datasets show only reported measures, never demo-era
 * comparative assumptions. The North House pass changes presentation only: the
 * same capability gates decide what appears, the same selectors supply it, and
 * absent comparatives still read "Unavailable" rather than a synthetic zero.
 */
export function ConfiguredReporting({ mode }: { mode: "overview" | "pnl" | "sales" }) {
  const dataset = useReportingDataset();
  const { selection } = useFilters();
  const caps = reportingCapabilities(dataset);
  const pnl = mode !== "sales" ? selectAvailable("pnl", () => selectProfitAndLoss(selection)) : null;
  const sales = mode !== "pnl" && caps.hasSales ? selectSalesTotals(selection) : null;
  const weekly = mode !== "pnl" ? selectAvailable("weekly", () => selectWeeklySales(selection)) : null;
  const channels = sales && dataset.dimensions.channels.length ? selectBreakdown(selection, "channelId") : [];

  const money = (value: number) => formatCurrency(value, { scale: "units" });

  const pnlColumns: Column<StatementRow>[] = [
    { id: "measure", header: "Measure", align: "left", width: "40%", render: (row) => row.label },
    { id: "actual", header: "Actual", align: "right", render: (row) => money(row.actual) },
    ...(caps.hasBudget
      ? [{
          id: "budget",
          header: "Budget",
          align: "right" as const,
          groupStart: true,
          render: (row: StatementRow) =>
            row.budget === undefined ? <span className="text-tertiary">—</span> : money(row.budget),
        }]
      : []),
  ];

  const channelColumns: Column<DimensionBreakdown>[] = [
    { id: "channel", header: "Channel", align: "left", width: "50%", render: (row) => row.name },
    { id: "revenue", header: "Revenue", align: "right", render: (row) => money(row.revenue) },
  ];

  const weeklyColumns: Column<WeeklyPoint>[] = [
    { id: "week", header: "Week", align: "left", width: "40%", render: (row) => row.week.label },
    { id: "revenue", header: "Revenue", align: "right", render: (row) => money(row.revenue) },
    {
      id: "prior",
      header: "Prior year",
      align: "right",
      groupStart: true,
      render: (row) => (row.priorYear === undefined ? "Unavailable" : money(row.priorYear)),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={mode === "overview" ? "Executive Overview" : mode === "pnl" ? "Profit & Loss" : "Sales"}
        title={dataset.profile.companyName}
        subtitle="Reported results from the active company. Unconfigured comparisons and modules are omitted."
      />
      <PageSections>
        {pnl && (
          <Section
            number="01"
            title="Profit & Loss"
            meta={`${selection.basis} · ${dataset.profile.reportingCurrency}`}
          >
            <DataTable columns={pnlColumns} rows={pnl} rowKey={(row) => row.line} minWidth={520} />
          </Section>
        )}

        {sales && (
          <Section number={pnl ? "02" : "01"} title="Monthly sales" meta={dataset.profile.reportingCurrency}>
            <div className="type-kpi type-kpi-sm">{money(sales.revenue)}</div>
            {channels.length > 0 && (
              <div className="mt-5">
                <DataTable
                  columns={channelColumns}
                  rows={channels}
                  rowKey={(row) => row.id}
                  minWidth={420}
                />
              </div>
            )}
          </Section>
        )}

        {weekly && (
          <Section
            number={[pnl, sales].filter(Boolean).length === 2 ? "03" : [pnl, sales].some(Boolean) ? "02" : "01"}
            title="Weekly sales"
            meta="Reported calendar weeks through the selected month"
          >
            {weekly.length ? (
              <DataTable
                columns={weeklyColumns}
                rows={weekly}
                rowKey={(row) => row.week.id}
                minWidth={520}
              />
            ) : (
              <p className="type-body">No reported weeks fall within the selected reporting date.</p>
            )}
          </Section>
        )}

        {mode === "sales" && !caps.hasWeeklySales && (
          <ReportingUnavailable message="Weekly sales data has not been mapped." />
        )}
        {!pnl && !sales && !weekly && (
          <ReportingUnavailable message="Reporting data has not been configured for this company." />
        )}
        {mode === "overview" && (
          <p className="type-caption">
            Additional reporting modules can be configured in Data &amp; Mapping.
          </p>
        )}
      </PageSections>
    </>
  );
}
