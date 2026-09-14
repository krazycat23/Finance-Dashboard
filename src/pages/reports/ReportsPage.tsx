import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Database } from "lucide-react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { EditorialPlate } from "@/components/brand/EditorialPlate";
import { Section } from "@/components/layout/Section";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { TabBar } from "@/components/ui/TabBar";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { navigation, numberedNavigation, type NavItem } from "@/config/navigation";
import {
  capabilityLabels, reportingCapabilities, selectModuleAvailability,
  type ReportingModule,
} from "@/domain/selectors/availability";
import { cn } from "@/utils/cn";

/**
 * REPORTS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The delivery centre, and the page that carries the product's denser
 * composition: a wide masthead strip, a tab bar, a row of destination tiles,
 * then several differently-shaped tables. No section numerals — this is a
 * utility page, not a chapter of the pack, and the numerals belong to the
 * reporting narrative rather than to a library.
 *
 * Every row is a real reporting page with its real capability status. The
 * canonical model holds no library of generated documents, so none is
 * invented: no owners, no run dates, no file sizes, no formats, and no export
 * or "create report" action, because the product has none to offer.
 */

/**
 * Navigation entries that are reporting outputs, mapped to the capability that
 * decides whether they can be produced. Administration pages are tools, not
 * reports, so they are absent.
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
  groupId: string;
  group: string;
  icon: NavItem["icon"];
  available: boolean;
  message: string;
}

export function ReportsPage() {
  const dataset = useReportingDataset();
  const { currentPeriod, basis } = useFilters();
  const capabilities = reportingCapabilities(dataset);

  const rows = useMemo<ReportRow[]>(
    () =>
      numberedNavigation()
        .flatMap((group) => group.items.map((item) => ({ item, group })))
        .filter(({ item }) => item.id in REPORT_MODULES)
        .map(({ item, group }) => {
          const state = selectModuleAvailability(REPORT_MODULES[item.id]!, dataset);
          return {
            id: item.id,
            ordinal: item.ordinal ?? "",
            name: item.label,
            path: item.path,
            groupId: group.id,
            group: group.label ?? "",
            icon: item.icon,
            available: state.available,
            message: state.message,
          };
        }),
    [dataset],
  );

  const groups = useMemo(
    () =>
      navigation
        .filter((group) => group.items.some((item) => item.id in REPORT_MODULES))
        .map((group) => ({
          ...group,
          icon: group.items[0].icon,
          path: group.items[0].path,
          count: rows.filter((row) => row.groupId === group.id).length,
          ready: rows.filter((row) => row.groupId === group.id && row.available).length,
        })),
    [rows],
  );

  const tabs = useMemo(
    () => [
      { value: "all", label: "All reports", count: rows.length },
      ...groups.map((group) => ({
        value: group.id,
        label: group.label ?? group.id,
        count: group.count,
      })),
      {
        value: "unconfigured",
        label: "Not configured",
        count: rows.filter((row) => !row.available).length,
      },
    ],
    [rows, groups],
  );

  const [tab, setTab] = useState<string>("all");
  const visible = useMemo(
    () =>
      tab === "all" ? rows
        : tab === "unconfigured" ? rows.filter((row) => !row.available)
        : rows.filter((row) => row.groupId === tab),
    [rows, tab],
  );

  const ready = rows.filter((row) => row.available).length;

  const columns: Column<ReportRow>[] = [
    {
      id: "report",
      header: "Report",
      align: "left",
      width: "30%",
      render: (row) => (
        <Link to={row.path} className="flex items-center gap-3 min-w-0 group">
          <row.icon size={15} strokeWidth={1.6} className="shrink-0 text-tertiary" />
          <span className="text-[13px] text-primary font-medium truncate group-hover:underline underline-offset-2">
            {row.name}
          </span>
        </Link>
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
      render: (row) => <StatusChip available={row.available} />,
    },
    {
      id: "open",
      header: "",
      align: "right",
      width: "16%",
      render: (row) => (
        <Link
          to={row.path}
          className="type-control inline-flex items-center gap-1.5 border border-line px-2.5 py-[5px] text-secondary hover:text-primary hover:border-strong transition-colors"
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <>
      {/* MASTHEAD — a wide strip rather than a tall block. A library is opened
          to be used, so the header takes a band of the page, not a third. */}
      <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-x-10 gap-y-6 items-stretch">
        <div className="min-w-0 flex flex-col justify-center py-1">
          <div className="eyebrow">Reports</div>
          <h1 className="type-display mt-3 max-w-[16ch]">Clarity delivered.</h1>
          <p className="type-body-lead mt-3 max-w-[56ch]">
            Every report below is produced live from {dataset.profile.companyName}'s active
            dataset — {basis} to {currentPeriod.label}. A report that is not configured says
            so rather than producing an empty document.
          </p>
        </div>

        <EditorialPlate orientation="landscape" className="h-[168px] hidden lg:flex">
          <div className="text-[9px] font-semibold uppercase tracking-[0.2em] leading-[2.2] text-right">
            Better
            <br />
            insights
            <br />
            brighter
            <br />
            tomorrows
          </div>
        </EditorialPlate>
      </header>

      <div className="mt-8">
        <TabBar
          aria-label="Report view"
          options={tabs}
          value={tab}
          onChange={setTab}
          action={
            <Link
              to="/data-mapping"
              className="type-control inline-flex items-center gap-1.5 text-secondary hover:text-primary"
            >
              Configure sources
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>
          }
        />
      </div>

      {/* DESTINATION TILES — navigation affordances, not data containers, so a
          border is the right treatment here where it would be wrong on a
          figure. */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {groups.map((group) => (
          <Link
            key={group.id}
            to={group.path}
            className="group border border-subtle bg-panel p-4 flex flex-col gap-2.5 hover:border-strong transition-colors min-w-0"
          >
            <div className="flex items-center justify-between gap-3">
              <group.icon size={16} strokeWidth={1.6} className="text-tertiary" />
              <span className="type-caption tnum">
                {group.ready}/{group.count}
              </span>
            </div>
            <div className="text-[13px] text-primary font-medium group-hover:underline underline-offset-2">
              {group.label}
            </div>
            <p className="type-caption leading-snug">{group.description}</p>
          </Link>
        ))}

        <Link
          to="/data-mapping"
          className="group border border-subtle bg-panel p-4 flex flex-col gap-2.5 hover:border-strong transition-colors min-w-0"
        >
          <div className="flex items-center justify-between gap-3">
            <Database size={16} strokeWidth={1.6} className="text-tertiary" />
            <span className="type-caption tnum">
              {Object.values(capabilities).filter(Boolean).length}/
              {Object.keys(capabilities).length}
            </span>
          </div>
          <div className="text-[13px] text-primary font-medium group-hover:underline underline-offset-2">
            Source configuration
          </div>
          <p className="type-caption leading-snug">
            Mapping, reconciliation and activation of the source data.
          </p>
        </Link>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        <Section
          title="Report library"
          meta={`${ready} of ${rows.length} available`}
          description="Availability is the active dataset's own capability gate — the same gate the reporting pages use."
        >
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(row) => row.id}
            minWidth={780}
            rowClassName={(row) => (row.available ? undefined : "[&>td]:text-tertiary")}
            empty="No reports match this view."
          />
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-10 gap-y-9">
          <Section
            title="Reporting coverage"
            meta={`${Object.values(capabilities).filter(Boolean).length} of ${Object.keys(capabilities).length} configured`}
            description="What the active dataset can report. A capability that is off hides its module rather than filling it with zeroes."
          >
            <ul className="flex flex-col">
              {Object.entries(capabilityLabels).map(([key, label]) => {
                const on = capabilities[key as keyof typeof capabilities];
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-4 py-2.5 border-b border-subtle last:border-b-0 first:pt-0"
                  >
                    <span className={cn("text-[12.5px]", on ? "text-primary" : "text-tertiary")}>
                      {label}
                    </span>
                    <StatusChip available={on} readyLabel="Configured" />
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section
            title="By section"
            meta={`${groups.length} sections`}
            description="How the library divides across the pack."
          >
            <ul className="flex flex-col">
              {groups.map((group) => (
                <li key={group.id} className="py-3 border-b border-subtle last:border-b-0 first:pt-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[12.5px] text-primary">{group.label}</span>
                    <span className="type-caption tnum">
                      {group.ready} of {group.count} ready
                    </span>
                  </div>
                  <Meter value={group.ready} max={group.count} className="mt-2.5" />
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {rows.some((row) => !row.available) && (
          <Section
            title="Waiting on configuration"
            meta={`${rows.length - ready} report${rows.length - ready === 1 ? "" : "s"}`}
            description="What each unavailable report needs. Source configuration is reviewed in Data & Mapping."
          >
            <ul className="flex flex-col max-w-[110ch]">
              {rows
                .filter((row) => !row.available)
                .map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-6 py-3.5 border-b border-subtle last:border-b-0 first:pt-0"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <row.icon size={14} strokeWidth={1.6} className="shrink-0 text-tertiary" />
                      <span className="text-[12.5px] text-primary truncate">{row.name}</span>
                    </span>
                    <span className="type-body">{row.message}</span>
                  </li>
                ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}

/** A dot and a word: the status never rests on the colour alone. */
function StatusChip({
  available, readyLabel = "Ready",
}: { available: boolean; readyLabel?: string }) {
  return (
    <Badge tone={available ? "positive" : "neutral"}>
      <span
        aria-hidden
        className={cn(
          "w-[5px] h-[5px] rounded-full shrink-0",
          available ? "bg-positive" : "bg-[var(--text-tertiary)]",
        )}
      />
      {available ? readyLabel : "Not configured"}
    </Badge>
  );
}
