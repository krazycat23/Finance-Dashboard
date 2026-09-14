import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { useFilters } from "@/app/providers/FilterProvider";
import { THEME_LABELS, useTheme } from "@/app/providers/ThemeProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow } from "@/components/layout/Section";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { ReactNode } from "react";
import { reportingCapabilities, capabilityLabels } from "@/domain/selectors/availability";
import { cn } from "@/utils/cn";

/**
 * SETTINGS — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The configuration the product is actually running on, grouped and readable.
 *
 * Values are read from the active dataset's profile and capability flags, and
 * the only interactive control is the one that genuinely exists — the theme.
 * A settings page of toggles that change nothing is worse than a short one:
 * source configuration is edited in Data & Mapping, and this page says so.
 */

export function SettingsPage() {
  const dataset = useReportingDataset();
  const { currentPeriod, basis } = useFilters();
  const { theme } = useTheme();
  const capabilities = reportingCapabilities(dataset);
  const { profile } = dataset;

  const calendar = profile.fiscalCalendar;
  const monthName = (month: number) =>
    new Date(Date.UTC(2000, Math.max(0, month - 1), 1)).toLocaleString(profile.locale ?? "en", {
      month: "long",
      timeZone: "UTC",
    });

  return (
    <>
      <Masthead
        eyebrow="Configuration"
        titleClassName="max-w-[16ch]"
        title="Settings"
        standfirst="What this pack is running on."
        lede={`${profile.companyName} · reporting in ${profile.reportingCurrency}. Source mapping and activation are reviewed in Data & Mapping; this page reports the configuration in force.`}
        context={[
          { label: "Company", value: profile.shortName ?? profile.companyName },
          { label: "Theme", value: THEME_LABELS[theme] },
          { label: "Period", value: currentPeriod.label },
          { label: "Currency", value: profile.reportingCurrency },
        ]}
      />

      <div className="mt-10 flex flex-col gap-10">
        <SectionRow split="50/50">
          <Section
            flushTop
            number="01"
            title="Reporting company"
            meta="From the active dataset"
          >
            <SettingList
              rows={[
                { label: "Company name", value: profile.companyName },
                { label: "Short name", value: profile.shortName ?? "—" },
                { label: "Tagline", value: profile.tagline ?? "—" },
                { label: "Reporting currency", value: profile.reportingCurrency },
                { label: "Locale", value: profile.locale ?? "—" },
                { label: "Default scale", value: profile.defaultScale ?? "—" },
              ]}
            />
          </Section>

          <Section
            flushTop
            number="02"
            title="Fiscal calendar"
            meta="Drives every period in the pack"
          >
            <SettingList
              rows={[
                { label: "Periodicity", value: calendar?.periodicity ?? "—" },
                {
                  label: "Year starts",
                  value: calendar ? monthName(calendar.fiscalYearStartMonth) : "—",
                },
                {
                  label: "Year labelled by",
                  value:
                    calendar?.fiscalYearLabel === "endYear"
                      ? "Year of close"
                      : calendar?.fiscalYearLabel === "startYear"
                        ? "Year of open"
                        : "—",
                },
                { label: "Reporting position", value: `${basis} · ${currentPeriod.label}` },
                {
                  label: "Fiscal position",
                  value: `${currentPeriod.fiscalYear} · period ${currentPeriod.fiscalPeriod}`,
                },
              ]}
            />
          </Section>
        </SectionRow>

        <SectionRow split="50/50">
          <Section
            flushTop
            number="03"
            title="Appearance"
            meta="Stored for this browser"
            description="Sand is the default. The choice persists locally and applies to every page, including the charts."
          >
            <div className="flex items-center justify-between gap-6 py-3.5 border-b border-subtle">
              <div className="min-w-0">
                <div className="text-[12.5px] text-primary">Theme</div>
                <div className="type-caption mt-1">
                  North House — {THEME_LABELS[theme]}
                </div>
              </div>
              <ThemeToggle />
            </div>
          </Section>

          <Section
            flushTop
            number="04"
            title="Reporting capabilities"
            meta={`${Object.values(capabilities).filter(Boolean).length} of ${Object.keys(capabilities).length} configured`}
            description="What the active dataset can report. A capability that is off hides its module rather than filling it with zeroes."
          >
            <SettingList
              rows={Object.entries(capabilityLabels).map(([key, label]) => ({
                label,
                value: capabilities[key as keyof typeof capabilities] ? "Configured" : "Not configured",
                muted: !capabilities[key as keyof typeof capabilities],
              }))}
            />
          </Section>
        </SectionRow>
      </div>
    </>
  );
}

interface SettingRow {
  label: string;
  value: ReactNode;
  muted?: boolean;
}

/** A ruled list of label/value pairs. No control unless one genuinely exists. */
function SettingList({ rows }: { rows: SettingRow[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-6 py-3 border-b border-subtle last:border-b-0 first:pt-0"
        >
          <dt className="text-[12.5px] text-secondary">{row.label}</dt>
          <dd
            className={cn(
              "text-[12.5px] text-right tnum",
              row.muted ? "text-tertiary" : "text-primary font-medium",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
