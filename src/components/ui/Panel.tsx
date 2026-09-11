import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * PANEL
 * ---------------------------------------------------------------------------
 * The one container in the product. It reads as a report section — a hairline
 * border, a 4px radius, no shadow — rather than a floating card. Elevation is
 * reserved for true overlays.
 */

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Removes internal padding for panels whose child manages its own edges. */
  flush?: boolean;
}

export function Panel({ children, className, flush }: PanelProps) {
  return (
    <section
      className={cn(
        "bg-panel border border-subtle rounded-[4px] flex flex-col min-w-0",
        className,
      )}
    >
      {flush ? children : <div className="p-4 flex flex-col flex-1 min-h-0">{children}</div>}
    </section>
  );
}

interface PanelHeaderProps {
  title: string;
  /** Short qualifier shown after the title, e.g. the basis or unit. */
  meta?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PanelHeader({
  title, meta, description, actions, className,
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 px-4 pt-3.5 pb-3 border-b border-subtle",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h2 className="panel-title truncate">{title}</h2>
          {meta && (
            <span className="text-[11px] text-tertiary tnum whitespace-nowrap">{meta}</span>
          )}
        </div>
        {description && (
          <p className="text-[11.5px] text-secondary mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** Body wrapper for a panel that uses PanelHeader. */
export function PanelBody({
  children, className, flush,
}: { children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <div className={cn(flush ? "" : "p-4", "flex-1 min-h-0 min-w-0", className)}>
      {children}
    </div>
  );
}
