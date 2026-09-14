import type { ReactNode } from "react";

/**
 * PAGE HEADER
 * ---------------------------------------------------------------------------
 * Eyebrow, editorial title, standfirst — the masthead of a report section.
 *
 * The title uses the display serif. It is sized to read as a section opening in
 * a board pack rather than a hero banner: an analytical page cannot afford to
 * spend a third of the fold on a sentence that carries no data.
 *
 * Global filters are NOT here. They belong to the application, not the page,
 * and live once on the top control bar.
 */

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Page-specific controls, aligned to the baseline of the title block. */
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-8 flex-wrap pb-4 border-b border-strong">
      <div className="min-w-0 max-w-[780px]">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="type-heading mt-1.5">{title}</h1>
        <p className="type-body mt-2">{subtitle}</p>
      </div>
      {actions && <div className="shrink-0 flex items-end gap-2">{actions}</div>}
    </header>
  );
}
