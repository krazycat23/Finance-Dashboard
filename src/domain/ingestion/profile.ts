import type { Classification, ColumnProfile, DatasetType, InferredValueType } from "./types";

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const keywords: Record<Exclude<DatasetType, "unknown">, string[]> = {
  finance_actual: ["account", "gl", "debit", "credit", "cost centre", "department", "amount"], budget: ["budget", "plan", "target"], forecast: ["forecast", "estimate", "outlook"], sales: ["order", "product", "sku", "quantity", "revenue", "sales", "store", "customer"], operational_kpi: ["metric", "kpi", "target", "value"], account_master: ["account", "account name"], gl_mapping: ["gl", "p1", "p2", "p3"], entity_master: ["entity", "legal entity"], product_master: ["product", "sku"], customer_master: ["customer"], location_master: ["location", "branch", "store"], financial_calendar: ["fiscal year", "fiscal period", "period start", "period end"], ignored: [],
};

export function profileColumn(name: string, rows: ReadonlyArray<Record<string, unknown>>): ColumnProfile {
  const values = rows.map((row) => row[name]).filter((value) => value !== null && value !== undefined && value !== "");
  const text = values.map(String); const numeric = values.filter((value) => Number.isFinite(Number(value))).length;
  const dates = values.filter((value) => !Number.isNaN(Date.parse(String(value)))).length;
  const tokenName = /(^|\s)(period|fin period|fiscal period|fiscal week|week)(\s|$)/i.test(name);
  const identifierName = /(^|\s)(id|code|number|entity|gl|account|cost centre|cost center|department)(\s|$)/i.test(name);
  const tokenValues = values.length > 0 && text.every(value => /^\d{6}$|^\d{4}[-/]\d{2}$|^w\d{1,2}$/i.test(value.trim()));
  // Name semantics outrank numeric-looking content: 0040 is an identifier,
  // 202701 is a fiscal token, and Amount is a measure.
  const type: InferredValueType = tokenName && tokenValues ? "fiscal-period-token" : identifierName ? "identifier" : /%|percent|margin/i.test(name) ? "percentage-like" : /amount|revenue|sales|cost|price/i.test(name) ? "currency-like" : values.length && dates / values.length > .9 ? "date" : values.length && numeric / values.length > .9 ? "number" : "string";
  const unique = [...new Set(text)]; const ordered = numeric / Math.max(1, values.length) > .9 ? values.map(Number).sort((a,b)=>a-b) : text.sort();
  return { name, inferredType: type, nonNullCount: values.length, nullPercent: rows.length ? (rows.length - values.length) / rows.length : 0, distinctCount: unique.length, samples: values.slice(0, 5), min: ordered[0], max: ordered[ordered.length - 1] };
}
export function classifyDataset(columns: string[]): Classification {
  const names = columns.map(normalise); const scored = Object.entries(keywords).map(([type, terms]) => ({ type: type as DatasetType, matches: terms.filter((term) => names.some((name) => name.includes(term))).length, terms }));
  const winner = scored.sort((a,b)=>b.matches-a.matches)[0];
  if (!winner || winner.matches === 0) return { type: "unknown", confidence: 0, reasons: ["No recognised field combinations"] };
  const confidence = Math.min(.99, .45 + winner.matches / Math.max(3, winner.terms.length));
  return { type: winner.type, confidence, reasons: winner.terms.filter((term) => names.some((name) => name.includes(term))).map((term) => `Detected “${term}”`) };
}
