import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { numberedNavigation } from "@/config/navigation";
import {
  selectModuleAvailability, type ReportingModule,
} from "@/domain/selectors/availability";

/**
 * REPORTS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * A delivery centre, not a dashboard: what this pack can produce for the
 * current reporting position, and what is not configured to produce yet.
 *
 * Every row is a real reporting page with its real capability status. There is
 * no stored library of generated documents in the canonical model, so none is
 * invented here — no fabricated run dates, no file sizes, and no export action,
 * because the product has no export to offer.
 */

/**
 * Navigation entries that are reporting outputs, mapped to the capability that
 * decides whether they can be produced. Administration pages are tools, not
 * reports, so they are absent — and a route with no capability gate (the
 * Overview) is always produceable.
 */
const REPORT_MODULES: Record<string, ReportingModule | undefined> = {
  overview: "overview",
  sales: "sales",
  kpis: "kpis",
  pnl: "pnl",
  "balance-sheet": "balance",
  "cash-flow": "cashflow",
  forecasts: "forecast",
  variance: "variance",
};

interface ReportRow {
  id: string;
  ordinal: string;
  name: string;
  path: string;
  group: string;
  available: boolean;
  message: string;
}

export function ReportsPage() {
  const dataset = useReportingDataset();
  const { currentPeriod, basis } = useFilters();

  const rows = useMemo<ReportRow[]>(
    () =>
      numberedNavigation()
        .flatMap((group) =>
          group.items.map((item) => ({ item, group: group.label ?? "" })),
        )
        .filter(({ item }) => item.id in REPORT_MODULES)
        .map(({ item, group }) => {
          const module = REPORT_MODULES[item.id]!;
          const state = selectModuleAvailability(module, dataset);
          return {
            id: item.id,
            ordinal: item.ordinal ?? "",
            name: item.label,
            path: item.path,
            group,
            available: state.available,
            message: state.message,
          };
        }),
    [dataset],
  );

  const ready = rows.filter((row) => row.available).length;

  const columns: Column<ReportRow>[] = [
    {
      id: "report",
      header: "Report",
      align: "left",
      width: "34%",
      render: (row) => (
        <span className="flex items-baseline gap-3.5 min-w-0">
          <span aria-hidden className="type-section-number w-[16px] shrink-0">{row.ordinal}</span>
          <Link
            to={row.path}
            className="text-[13px] text-primary font-medium truncate hover:underline underline-offset-2"
          >
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      id: "group",
      header: "Section",
      align: "left",
      width: "16%",
      groupStart: true,
      render: (row) => <span className="text-secondary">{row.group}</span>,
    },
    {
      id: "period",
      header: "Reporting position",
      align: "left",
      width: "20%",
      render: () => (
        <span className="text-secondary tnum">
          {basis} · {currentPeriod.label}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "left",
      width: "18%",
      groupStart: true,
      render: (row) =>
        row.available ? (
          <Badge tone="positive">Ready</Badge>
        ) : (
          <Badge tone="neutral">Not configured</Badge>
        ),
    },
    {
      id: "open",
      header: "",
      align: "right",
      width: "12%",
      render: (row) => (
        <Link
          to={row.path}
          className="type-control text-secondary hover:text-primary underline-offset-2 hover:underline"
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      <Masthead
        eyebrow="Reporting library"
        titleClassName="max-w-[16ch]"
        title="Reports"
        standfirst="What this pack can produce."
        lede={`${dataset.profile.companyName} · ${basis} ${currentPeriod.label}. Each report is produced live from the active dataset; a report that is not configured says so rather than producing an empty document.`}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: "Ready", value: `${ready} of ${rows.length}` },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-10 flex flex-col gap-10">
        <Section
          number="01"
          title="Report library"
          meta={`${ready} of ${rows.length} available`}
          description="Availability is the active dataset's own capability gate — the same gate the reporting pages use."
        >
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            minWidth={760}
            rowClassName={(row) => (row.available ? undefined : "[&>td]:text-tertiary")}
            empty="No reporting modules are configured for this company."
          />
        </Section>

        <Section
          number="02"
          title="Not configured"
          meta={`${rows.length - ready} report${rows.length - ready === 1 ? "" : "s"}`}
          description="What each unavailable report is waiting for. Source configuration is reviewed in Data & Mapping."
        >
          {rows.filter((row) => !row.available).length === 0 ? (
            <p className="type-body">Every reporting module is configured for this company.</p>
          ) : (
            <ul className="flex flex-col max-w-[110ch]">
              {rows
                .filter((row) => !row.available)
                .map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-6 py-3.5 border-b border-subtle last:border-b-0 first:pt-0"
                  >
                    <span className="text-[12.5px] text-primary">{row.name}</span>
                    <span className="type-body">{row.message}</span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
