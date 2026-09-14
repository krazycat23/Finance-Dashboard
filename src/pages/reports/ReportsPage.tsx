import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock, Download, FileStack, LayoutTemplate } from "lucide-react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { EditorialPlate } from "@/components/brand/EditorialPlate";
import { Section } from "@/components/layout/Section";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { TabBar } from "@/components/ui/TabBar";
import { DataTable, type Column } from "@/components/tables/DataTable";
import { ReportingUnavailable } from "@/components/finance/ReportingAvailability";
import {
  hasReportLibrary, selectReportCategories, selectReportLibrary,
} from "@/domain/selectors";
import type {
  BoardPack, ReportExport, ReportStatus, ReportTemplate, ScheduledReport,
} from "@/domain/data/reportingDataset";
import { cn } from "@/utils/cn";

/**
 * REPORTS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The delivery centre: what is scheduled, what has been exported, what is
 * packed for a board, and what can be produced from a template.
 *
 * The library is carried on the dataset, so a company that has not had one
 * wired in shows the unavailable state rather than another company's packs.
 * Every row that has an underlying reporting page opens it.
 *
 * No section numerals — a library is a set of collections, not a chapter of
 * the pack.
 */

type Tab = "all" | "scheduled" | "exports" | "packs" | "templates";

const STATUS_TONE: Record<ReportStatus, BadgeTone> = {
  Scheduled: "positive",
  Ready: "positive",
  Shared: "accent",
  "In progress": "caution",
  Draft: "neutral",
  Paused: "neutral",
};

export function ReportsPage() {
  const dataset = useReportingDataset();
  const { currentPeriod, basis } = useFilters();

  const library = useMemo(() => selectReportLibrary(dataset), [dataset]);
  const categories = useMemo(() => selectReportCategories(dataset), [dataset]);
  const available = hasReportLibrary(dataset);

  const [tab, setTab] = useState<Tab>("all");

  const tabs = [
    {
      value: "all" as const,
      label: "All reports",
      count:
        library.scheduled.length + library.exports.length +
        library.boardPacks.length + library.templates.length,
    },
    { value: "scheduled" as const, label: "Scheduled", count: library.scheduled.length },
    { value: "exports" as const, label: "Recent exports", count: library.exports.length },
    { value: "packs" as const, label: "Board packs", count: library.boardPacks.length },
    { value: "templates" as const, label: "Templates", count: library.templates.length },
  ];

  const tiles = [
    {
      id: "scheduled",
      icon: CalendarClock,
      title: "Scheduled reports",
      copy: "Automated delivery on your schedule.",
      count: library.scheduled.length,
      tab: "scheduled" as const,
    },
    {
      id: "packs",
      icon: FileStack,
      title: "Board packs",
      copy: "Curated reports for key meetings.",
      count: library.boardPacks.length,
      tab: "packs" as const,
    },
    {
      id: "exports",
      icon: Download,
      title: "Recent exports",
      copy: "Your latest downloads.",
      count: library.exports.length,
      tab: "exports" as const,
    },
    {
      id: "templates",
      icon: LayoutTemplate,
      title: "Report templates",
      copy: "Reusable formats to save time.",
      count: library.templates.length,
      tab: "templates" as const,
    },
  ];

  const show = (section: Tab) => tab === "all" || tab === section;

  return (
    <>
      <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-x-10 gap-y-6 items-stretch">
        <div className="min-w-0 flex flex-col justify-center py-1">
          <div className="eyebrow">Reports</div>
          <h1 className="type-display mt-3 max-w-[16ch]">Clarity delivered.</h1>
          <p className="type-body-lead mt-3 max-w-[58ch]">
            Access, schedule and share the insights that matter — produced live from{" "}
            {dataset.profile.companyName}'s active dataset, {basis} to {currentPeriod.label}.
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

      {!available ? (
        <div className="mt-8">
          <ReportingUnavailable message="A report library has not been configured for this company." />
        </div>
      ) : (
        <>
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

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => setTab(tile.tab)}
                className={cn(
                  "group border bg-panel p-4 flex flex-col gap-2.5 text-left transition-colors min-w-0",
                  tab === tile.tab ? "border-strong" : "border-subtle hover:border-strong",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <tile.icon size={16} strokeWidth={1.6} className="text-tertiary" />
                  <span className="type-caption tnum">{tile.count}</span>
                </div>
                <div className="text-[13px] text-primary font-medium">{tile.title}</div>
                <p className="type-caption leading-snug">{tile.copy}</p>
              </button>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-10">
            {show("scheduled") && (
              <Section
                title="Scheduled reports"
                meta={`${library.scheduled.length} schedules`}
                description="Automated delivery. Opening a row opens the report it delivers."
              >
                <ScheduledTable rows={library.scheduled} />
              </Section>
            )}

            {show("exports") && (
              <Section
                title="Recent exports"
                meta={`${library.exports.length} files`}
                description="What has been produced from this pack, and by whom."
              >
                <ExportTable rows={library.exports} />
              </Section>
            )}

            {(show("packs") || show("templates")) && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-x-10 gap-y-9">
                {show("packs") && (
                  <Section
                    title="Board packs"
                    meta={`${library.boardPacks.length} packs`}
                    description="Curated collections assembled for a meeting."
                  >
                    <PackTable rows={library.boardPacks} />
                  </Section>
                )}

                {show("templates") && tab !== "packs" && (
                  <Section
                    title="Report categories"
                    meta={`${categories.length} categories`}
                    description="Derived from the library's own categories."
                  >
                    <CategoryList rows={categories} />
                  </Section>
                )}
              </div>
            )}

            {show("templates") && (
              <Section
                title="Report templates"
                meta={`${library.templates.length} templates`}
                description="Reusable formats. Opening a template opens the report it produces."
              >
                <TemplateTable rows={library.templates} />
              </Section>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** The row action: opens the underlying report where the library names one. */
function OpenAction({ route }: { route?: string }) {
  if (!route) return <span className="type-caption">—</span>;
  return (
    <Link
      to={route}
      className="type-control inline-flex items-center border border-line px-2.5 py-[5px] text-secondary hover:text-primary hover:border-strong transition-colors"
    >
      View
    </Link>
  );
}

function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span
        aria-hidden
        className={cn(
          "w-[5px] h-[5px] rounded-full shrink-0",
          STATUS_TONE[status] === "positive" ? "bg-positive"
            : STATUS_TONE[status] === "caution" ? "bg-caution"
            : STATUS_TONE[status] === "accent" ? "bg-accent"
            : "bg-[var(--text-tertiary)]",
        )}
      />
      {status}
    </Badge>
  );
}

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const timeOf = (iso: string) =>
  `${dateOf(iso)} ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

function ScheduledTable({ rows }: { rows: ScheduledReport[] }) {
  const columns: Column<ScheduledReport>[] = [
    {
      id: "title",
      header: "Report title",
      align: "left",
      width: "28%",
      render: (row) => <span className="text-[13px] text-primary font-medium">{row.title}</span>,
    },
    { id: "type", header: "Type", align: "left", width: "13%", groupStart: true, render: (row) => <span className="text-secondary">{row.type}</span> },
    { id: "cadence", header: "Period", align: "left", width: "11%", render: (row) => <span className="text-secondary">{row.cadence}</span> },
    { id: "owner", header: "Owner", align: "left", width: "13%", render: (row) => <span className="text-secondary">{row.owner}</span> },
    { id: "status", header: "Status", align: "left", width: "13%", groupStart: true, render: (row) => <StatusBadge status={row.status} /> },
    {
      id: "next",
      header: "Next delivery",
      align: "left",
      width: "14%",
      render: (row) => <span className="text-secondary tnum">{dateOf(row.nextDelivery)}</span>,
    },
    { id: "actions", header: "", align: "right", width: "8%", render: (row) => <OpenAction route={row.route} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} minWidth={860} empty="No reports are scheduled." />;
}

function ExportTable({ rows }: { rows: ReportExport[] }) {
  const columns: Column<ReportExport>[] = [
    {
      id: "title",
      header: "Report title",
      align: "left",
      width: "30%",
      render: (row) => <span className="text-[13px] text-primary font-medium">{row.title}</span>,
    },
    { id: "type", header: "Type", align: "left", width: "12%", groupStart: true, render: (row) => <span className="text-secondary">{row.type}</span> },
    { id: "period", header: "Period", align: "left", width: "11%", render: (row) => <span className="text-secondary tnum">{row.period}</span> },
    { id: "by", header: "Exported by", align: "left", width: "13%", render: (row) => <span className="text-secondary">{row.exportedBy}</span> },
    {
      id: "at",
      header: "Last updated",
      align: "left",
      width: "17%",
      groupStart: true,
      render: (row) => <span className="text-secondary tnum">{timeOf(row.exportedAt)}</span>,
    },
    { id: "format", header: "Format", align: "left", width: "9%", render: (row) => <span className="text-secondary">{row.format}</span> },
    { id: "actions", header: "", align: "right", width: "8%", render: (row) => <OpenAction route={row.route} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} minWidth={900} empty="Nothing has been exported yet." />;
}

function PackTable({ rows }: { rows: BoardPack[] }) {
  const columns: Column<BoardPack>[] = [
    {
      id: "name",
      header: "Name",
      align: "left",
      width: "36%",
      render: (row) => <span className="text-[13px] text-primary font-medium">{row.title}</span>,
    },
    { id: "period", header: "Period", align: "left", width: "14%", groupStart: true, render: (row) => <span className="text-secondary tnum">{row.period}</span> },
    { id: "owner", header: "Owner", align: "left", width: "16%", render: (row) => <span className="text-secondary">{row.owner}</span> },
    { id: "sections", header: "Sections", align: "right", width: "10%", render: (row) => row.sections },
    { id: "status", header: "Status", align: "left", width: "15%", groupStart: true, render: (row) => <StatusBadge status={row.status} /> },
    { id: "actions", header: "", align: "right", width: "9%", render: (row) => <OpenAction route={row.route} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} minWidth={640} empty="No board packs have been assembled." />;
}

function TemplateTable({ rows }: { rows: ReportTemplate[] }) {
  const columns: Column<ReportTemplate>[] = [
    {
      id: "name",
      header: "Template",
      align: "left",
      width: "26%",
      render: (row) => <span className="text-[13px] text-primary font-medium">{row.title}</span>,
    },
    {
      id: "description",
      header: "Produces",
      align: "left",
      width: "42%",
      groupStart: true,
      render: (row) => <span className="text-secondary">{row.description}</span>,
    },
    { id: "type", header: "Category", align: "left", width: "13%", render: (row) => <span className="text-secondary">{row.type}</span> },
    { id: "cadence", header: "Cadence", align: "left", width: "11%", groupStart: true, render: (row) => <span className="text-secondary">{row.cadence}</span> },
    { id: "actions", header: "", align: "right", width: "8%", render: (row) => <OpenAction route={row.route} /> },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} minWidth={780} empty="No templates are configured." />;
}

function CategoryList({ rows }: { rows: { id: string; name: string; count: number; route?: string }[] }) {
  const max = Math.max(...rows.map((row) => row.count), 0);
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li key={row.id} className="py-3 border-b border-subtle last:border-b-0 first:pt-0">
          <div className="flex items-baseline justify-between gap-4">
            {row.route ? (
              <Link to={row.route} className="text-[12.5px] text-primary hover:underline underline-offset-2">
                {row.name}
              </Link>
            ) : (
              <span className="text-[12.5px] text-primary">{row.name}</span>
            )}
            <span className="type-caption tnum">{row.count}</span>
          </div>
          <Meter value={row.count} max={max} className="mt-2.5" />
        </li>
      ))}
    </ul>
  );
}
