/**
 * BUNDLED SOURCE WORKBOOKS
 * ---------------------------------------------------------------------------
 * Vite resolves each workbook to an asset URL at build time, so they are
 * fetched on demand rather than inlined: three megabytes of trial balance has
 * no business in the initial payload of a page that may never open this
 * company.
 *
 * `import.meta.glob` is a Vite feature and does not exist in the Node
 * validation harness, so this module is imported dynamically from `prepare()`
 * and is never evaluated outside a browser build. The harness supplies the
 * same workbooks by reading the same directory from disk.
 */
export const SOURCE_URLS = import.meta.glob("./sources/*.xlsx", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
