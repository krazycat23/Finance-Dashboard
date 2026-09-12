import type { ReactNode } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { selectModuleAvailability, type ReportingModule } from "@/domain/selectors/availability";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

export function ReportingUnavailable({ message }: { message: string }) {
  return <Panel><PanelHeader title="Reporting unavailable"/><PanelBody><p role="status" className="text-sm text-secondary">{message}</p><p className="mt-2 text-xs text-tertiary">Review source configuration in Data & Mapping to enable this module.</p></PanelBody></Panel>;
}
export function ReportingAvailability({ module, children }: { module: ReportingModule; children: ReactNode }) {
  const state = selectModuleAvailability(module, useReportingDataset());
  return state.available ? <>{children}</> : <ReportingUnavailable message={state.message}/>;
}
