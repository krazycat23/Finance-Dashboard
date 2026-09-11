import { useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, Clock, Info, Link2Off, RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSections } from "@/components/layout/AppShell";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  selectDataHealth, selectDataIssues, selectMappingSummary, selectReconciliation,
  selectRefreshLog, selectUnmappedAccounts, selectUnmappedProducts,
  type DataIssue, type MappingSummary, type ReconciliationLine, type RefreshEvent,
} from "@/domain/selectors";
import { companyConfig } from "@/config/company";
import { formatCurrency, formatNumber, formatPercentage } from "@/utils/format";

/**
 * DATA QUALITY, MAPPING & RECONCILIATION
 * ---------------------------------------------------------------------------
 * The page that decides whether this engine can be deployed into a new company
 * at all, and the one an implementation team lives in during onboarding.
 *
 * The organising principle: an unmapped account is EXCLUDED from every
 * reported total, so it has to be visible. A reporting tool that silently
 * drops 3% of the cost base is worse than one that refuses to render.
 *
 * Two coverage measures are shown side by side and neither is sufficient
 * alone — count coverage overstates the problem (the unmapped tail is usually
 * small accounts), value coverage hides it (four unmapped accounts can be 0.4%
 * of value and still be the four that matter).
 */

type IssueFilter = "all" | "open" | "critical";

const SEVERITY_TONE: Record<DataIssue["severity"], BadgeTone> = {
  critical: "negative",
  warning: "caution",
  info: "neutral",
};

const STATUS_TONE: Record<DataIssue["status"], BadgeTone> = {
  Open: "negative",
  "In review": "caution",
  Resolved: "positive",
};

export function DataMappingPage() {
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");

  const health = useMemo(() => selectDataHealth(), []);
  const mapping = useMemo(() => selectMappingSummary(), []);
  const reconciliation = useMemo(() => selectReconciliation(), []);
  const issues = useMemo(() => selectDataIssues(), []);
  const refresh = useMemo(() => selectRefreshLog(), []);
  const unmappedAccounts = useMemo(() => selectUnmappedAccounts(), []);
  const unmappedProducts = useMemo(() => selectUnmappedProducts(), []);

  const filteredIssues = useMemo(() => {
    if (issueFilter === "open") return issues.filter((i) => i.status !== "Resolved");
    if (issueFilter === "critical") return issues.filter((i) => i.severity === "critical");
    return issues;
  }, [issues, issueFilter]);

  const mappingColumns: Column<MappingSummary>[] = [
    { id: "dimension", header: "Dimension", align: "left", render: (row) => row.dimension },
    { id: "total", header: "Members", align: "right", groupStart: true, render: (row) => formatNumber(row.total) },
    { id: "mapped", header: "Mapped", align: "right", render: (row) => formatNumber(row.mapped) },
    {
      id: "unmapped",
      header: "Unmapped",
      align: "right",
      render: (row) =>
        row.unmapped === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          <span className="text-negative font-medium">{formatNumber(row.unmapped)}</span>
        ),
    },
    {
      id: "coverage",
      header: "Coverage by count",
      align: "right",
      groupStart: true,
      render: (row) => formatPercentage(row.coverage),
    },
    {
      id: "value-coverage",
      header: "Coverage by value",
      align: "left",
      width: "22%",
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <Meter
            value={row.valueCoverage}
            max={1}
            tone={row.valueCoverage >= 0.995 ? "positive" : "neutral"}
            className="flex-1 min-w-[60px]"
          />
          <span className="text-[11.5px] tnum text-secondary w-[44px] text-right">
            {formatPercentage(row.valueCoverage)}
          </span>
        </div>
      ),
    },
  ];

  const reconciliationColumns: Column<ReconciliationLine>[] = [
    { id: "statement", header: "Reconciliation", align: "left", render: (row) => row.statement },
    { id: "source", header: "Source total", align: "right", groupStart: true, render: (row) => formatCurrency(row.sourceTotal) },
    { id: "mapped", header: "Mapped total", align: "right", render: (row) => formatCurrency(row.mappedTotal) },
    {
      id: "difference",
      header: "Difference",
      align: "right",
      render: (row) =>
        row.difference === 0 ? (
          <span className="text-tertiary">—</span>
        ) : (
          <span className={row.status === "Exception" ? "text-negative font-medium" : "text-secondary"}>
            {formatCurrency(row.difference)}
          </span>
        ),
    },
    { id: "tolerance", header: "Tolerance", align: "right", render: (row) => formatCurrency(row.tolerance) },
    {
      id: "status",
      header: "Status",
      align: "left",
      groupStart: true,
      render: (row) => (
        <Badge
          tone={
            row.status === "Reconciled" ? "positive"
            : row.status === "Within tolerance" ? "caution"
            : "negative"
          }
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  const issueColumns: Column<DataIssue>[] = [
    {
      id: "severity",
      header: "Severity",
      align: "left",
      render: (row) => <Badge tone={SEVERITY_TONE[row.severity]}>{row.severity}</Badge>,
    },
    {
      id: "title",
      header: "Issue",
      align: "left",
      render: (row) => (
        <div className="min-w-0">
          <div className="text-primary">{row.title}</div>
          <div className="text-[11px] text-tertiary mt-0.5 leading-snug">{row.detail}</div>
        </div>
      ),
    },
    { id: "category", header: "Category", align: "left", groupStart: true, render: (row) => <span className="text-secondary">{row.category}</span> },
    { id: "source", header: "Source", align: "left", render: (row) => <span className="text-secondary">{row.source}</span> },
    { id: "records", header: "Records", align: "right", render: (row) => (row.affectedRecords === 0 ? "—" : formatNumber(row.affectedRecords)) },
    { id: "seen", header: "First seen", align: "left", render: (row) => <span className="text-secondary tnum">{row.firstSeen}</span> },
    {
      id: "status",
      header: "Status",
      align: "left",
      groupStart: true,
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    },
  ];

  const refreshColumns: Column<RefreshEvent>[] = [
    { id: "feed", header: "Feed", align: "left", render: (row) => row.feed },
    { id: "records", header: "Records", align: "right", groupStart: true, render: (row) => formatNumber(row.records) },
    { id: "duration", header: "Duration", align: "right", render: (row) => `${row.durationSeconds}s` },
    {
      id: "completed",
      header: "Completed",
      align: "left",
      render: (row) => (
        <span className="text-secondary tnum">
          {new Date(row.completedAt).toLocaleString(companyConfig.locale, {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      align: "left",
      groupStart: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge tone={row.status === "Success" ? "positive" : row.status === "Warning" ? "caution" : "negative"}>
            {row.status}
          </Badge>
          {row.detail && <span className="text-[11px] text-tertiary">{row.detail}</span>}
        </div>
      ),
    },
  ];

  const suggestionColumns = [
    { id: "code", header: "Source code", align: "left" as const, render: (row: { externalId: string }) => <span className="tnum text-primary">{row.externalId}</span> },
    { id: "name", header: "Description", align: "left" as const, render: (row: { name: string }) => row.name },
    {
      id: "suggestion",
      header: "Suggested mapping",
      align: "left" as const,
      groupStart: true,
      render: (row: { suggestedLine?: string; suggestedCategory?: string }) => (
        <span className="text-secondary">{row.suggestedLine ?? row.suggestedCategory}</span>
      ),
    },
    {
      id: "confidence",
      header: "Confidence",
      align: "left" as const,
      width: "22%",
      render: (row: { confidence: number }) => (
        <div className="flex items-center gap-2.5">
          <Meter
            value={row.confidence}
            max={1}
            tone={row.confidence >= 0.85 ? "positive" : row.confidence >= 0.7 ? "neutral" : "negative"}
            className="flex-1 min-w-[48px]"
          />
          <span className="text-[11.5px] tnum text-secondary w-[38px] text-right">
            {formatPercentage(row.confidence, { precision: 0 })}
          </span>
        </div>
      ),
    },
  ];

  const lastRefresh = new Date(health.lastRefresh);

  return (
    <>
      <PageHeader
        eyebrow="Data Quality, Mapping & Reconciliation"
        title="Data health, mapping and reconciliation."
        subtitle="Mapping coverage, reconciliation status and data exceptions. Unmapped members are excluded from every reported total, so they are surfaced here rather than absorbed silently."
      />

      <PageSections>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.6fr] gap-5">
          <Panel flush>
            <PanelHeader title="Data health score" meta={health.grade} />
            <PanelBody className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className="text-[38px] leading-none font-semibold text-primary tnum tracking-[-0.02em]">
                  {health.score.toFixed(1)}
                </span>
                <Badge tone={health.grade === "Strong" ? "positive" : health.grade === "Adequate" ? "caution" : "negative"}>
                  {health.grade}
                </Badge>
              </div>
              <div className="flex flex-col gap-2.5">
                {health.components.map((component) => (
                  <div key={component.id} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[11.5px] text-secondary">
                        {component.label}
                        <span className="text-tertiary ml-1.5">
                          weight {formatPercentage(component.weight, { precision: 0 })}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-primary tnum">
                        {component.score.toFixed(1)}
                      </span>
                    </div>
                    <Meter
                      value={component.score}
                      max={100}
                      tone={component.score >= 95 ? "positive" : component.score >= 80 ? "neutral" : "negative"}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-tertiary leading-snug border-t border-subtle pt-3">
                Mapping carries the heaviest weight because an unmapped account
                silently changes a reported total, whereas a late feed is visible
                and recoverable.
              </p>
            </PanelBody>
          </Panel>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 content-start">
            <StatTile
              icon={Link2Off}
              label="Unmapped accounts"
              value={formatNumber(health.unmappedAccounts)}
              tone={health.unmappedAccounts > 0 ? "negative" : "positive"}
              note="Excluded from all totals"
            />
            <StatTile
              icon={Link2Off}
              label="Unmapped products"
              value={formatNumber(health.unmappedProducts)}
              tone={health.unmappedProducts > 0 ? "caution" : "positive"}
              note="Excluded from category analysis"
            />
            <StatTile
              icon={AlertCircle}
              label="Duplicate records"
              value={formatNumber(health.duplicateRecords)}
              tone={health.duplicateRecords > 0 ? "caution" : "positive"}
              note="Deduplicated on load"
            />
            <StatTile
              icon={AlertCircle}
              label="Reconciliation exceptions"
              value={formatNumber(health.reconciliationExceptions)}
              tone={health.reconciliationExceptions > 0 ? "negative" : "positive"}
              note="Outside tolerance"
            />
            <StatTile
              icon={CheckCircle2}
              label="Feeds succeeded"
              value={`${refresh.filter((r) => r.status === "Success").length} of ${refresh.length}`}
              tone="neutral"
              note="Most recent load"
            />
            <StatTile
              icon={Clock}
              label="Last refresh"
              value={lastRefresh.toLocaleString(companyConfig.locale, {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
              })}
              tone="neutral"
              note="All feeds"
            />
          </div>
        </div>

        <Panel flush>
          <PanelHeader
            title="Mapping coverage by dimension"
            description="Coverage by count and by value are both shown: neither alone tells you whether the mapping is safe to report from."
          />
          <PanelBody>
            <DataTable
              columns={mappingColumns}
              rows={mapping}
              rowKey={(row) => row.dimension}
              minWidth={720}
            />
          </PanelBody>
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel flush>
            <PanelHeader
              title="Unmapped GL accounts"
              meta={`${unmappedAccounts.length} requiring attention`}
              description="Suggested mappings are proposals for review, not applied automatically."
            />
            <PanelBody>
              <DataTable
                columns={suggestionColumns}
                rows={unmappedAccounts}
                rowKey={(row) => row.id}
                minWidth={520}
              />
            </PanelBody>
          </Panel>

          <Panel flush>
            <PanelHeader
              title="Unmapped product codes"
              meta={`${unmappedProducts.length} requiring attention`}
              description="Revenue is reported in total but excluded from category analysis."
            />
            <PanelBody>
              <DataTable
                columns={suggestionColumns}
                rows={unmappedProducts}
                rowKey={(row) => row.id}
                minWidth={520}
              />
            </PanelBody>
          </Panel>
        </div>

        <Panel flush>
          <PanelHeader
            title="Reconciliation status"
            meta={`${reconciliation.filter((r) => r.status === "Exception").length} exception(s)`}
            description="Mapped totals compared against the source systems they came from."
          />
          <PanelBody>
            <DataTable
              columns={reconciliationColumns}
              rows={reconciliation}
              rowKey={(row) => row.id}
              minWidth={760}
              rowClassName={(row) => (row.status === "Exception" ? "bg-negative-soft/40" : undefined)}
            />
          </PanelBody>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Data issues"
            meta={`${issues.filter((i) => i.status !== "Resolved").length} open`}
            actions={
              <SegmentedControl
                aria-label="Issue filter"
                value={issueFilter}
                onChange={setIssueFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "critical", label: "Critical" },
                ]}
              />
            }
          />
          <PanelBody>
            <DataTable
              columns={issueColumns}
              rows={filteredIssues}
              rowKey={(row) => row.id}
              minWidth={900}
              empty="No issues match this filter."
            />
          </PanelBody>
        </Panel>

        <Panel flush>
          <PanelHeader
            title="Refresh and activity log"
            meta="Most recent load per feed"
            actions={
              <span className="flex items-center gap-1.5 text-[11px] text-tertiary">
                <RefreshCw size={12} strokeWidth={1.9} />
                Scheduled daily at 06:00
              </span>
            }
          />
          <PanelBody>
            <DataTable
              columns={refreshColumns}
              rows={refresh}
              rowKey={(row) => row.id}
              minWidth={700}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <div className="flex items-start gap-2.5">
            <Info size={15} className="text-tertiary mt-[1px] shrink-0" strokeWidth={1.9} />
            <p className="text-[12px] text-secondary leading-relaxed">
              In this phase the exceptions above are generated from the demonstration
              dataset. The shapes are the ones the ingestion layer will populate: the
              reconciliation engine diffs mapped totals against source extracts, and
              the mapping suggestions are the attachment point for AI-assisted account
              and dimension mapping in a later phase.
            </p>
          </div>
        </Panel>
      </PageSections>
    </>
  );
}

function StatTile({
  icon: Icon, label, value, tone, note,
}: {
  icon: typeof AlertCircle;
  label: string;
  value: string;
  tone: "positive" | "negative" | "caution" | "neutral";
  note: string;
}) {
  const toneClass = {
    positive: "text-positive",
    negative: "text-negative",
    caution: "text-caution",
    neutral: "text-tertiary",
  }[tone];

  return (
    <div className="bg-panel border border-subtle rounded-[4px] px-3.5 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={1.9} className={`${toneClass} shrink-0`} />
        <span className="text-[11px] text-secondary leading-tight">{label}</span>
      </div>
      <span className="text-[19px] font-semibold text-primary tnum leading-none tracking-[-0.01em]">
        {value}
      </span>
      <span className="text-[10.5px] text-tertiary leading-tight">{note}</span>
    </div>
  );
}
