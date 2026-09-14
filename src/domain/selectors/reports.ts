import { getReportingDataset, type ReportingDataset } from "@/domain/data";
import type { ReportLibrary } from "@/domain/data/reportingDataset";

/**
 * REPORT LIBRARY SELECTION
 * ---------------------------------------------------------------------------
 * The library is carried on the dataset rather than derived from the ledger, so
 * these selectors only read and summarise it.
 *
 * An adapter that supplies no library gets empty collections, never the demo
 * one: an imported company showing another company's board packs would be the
 * worst failure this product could have.
 */

const EMPTY: ReportLibrary = { scheduled: [], exports: [], boardPacks: [], templates: [] };

export function selectReportLibrary(
  dataset: ReportingDataset = getReportingDataset(),
): ReportLibrary {
  return dataset.reportLibrary ?? EMPTY;
}

export function hasReportLibrary(dataset: ReportingDataset = getReportingDataset()): boolean {
  const library = selectReportLibrary(dataset);
  return (
    library.scheduled.length > 0 ||
    library.exports.length > 0 ||
    library.boardPacks.length > 0 ||
    library.templates.length > 0
  );
}

export interface ReportCategoryTotal {
  id: string;
  name: string;
  count: number;
  /** Route of a representative report in the category, for navigation. */
  route?: string;
}

/**
 * Categories and their counts, derived from the library's own `type` values
 * rather than from a fixed list — a client whose reports are categorised
 * differently gets their own categories with no code change.
 */
export function selectReportCategories(
  dataset: ReportingDataset = getReportingDataset(),
): ReportCategoryTotal[] {
  const library = selectReportLibrary(dataset);
  const items = [
    ...library.scheduled,
    ...library.exports,
    ...library.boardPacks,
    ...library.templates,
  ];

  const byType = new Map<string, ReportCategoryTotal>();
  for (const item of items) {
    const existing = byType.get(item.type);
    if (existing) {
      existing.count += 1;
      existing.route ??= item.route;
    } else {
      byType.set(item.type, { id: item.type, name: item.type, count: 1, route: item.route });
    }
  }

  return [...byType.values()].sort((a, b) => b.count - a.count);
}
