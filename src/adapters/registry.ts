import type { CompanyAdapter } from "./contract";
import { FreedomCompanyAdapter } from "./freedom";
import { ReferenceCompanyAdapter } from "./reference";

export type CompanyAdapterFactory = () => CompanyAdapter;
const factories = new Map<string, CompanyAdapterFactory>();
export function registerCompanyAdapter(id: string, factory: CompanyAdapterFactory): void { if (!id.trim()) throw new Error("Adapter id must be non-empty."); if (factories.has(id)) throw new Error("Adapter already registered: " + id); factories.set(id, factory); }
export function resolveCompanyAdapter(id = "reference-demo"): CompanyAdapter { const factory = factories.get(id); if (!factory) throw new Error("Unknown company adapter " + id + ". Registered adapters: " + listCompanyAdapters().join(", ")); const adapter = factory(); if (adapter.id !== id || adapter.manifest.id !== id) throw new Error("Adapter registry id and manifest id must match for " + id); return adapter; }
export function listCompanyAdapters(): string[] { return [...factories.keys()].sort(); }
registerCompanyAdapter("reference-demo", () => new ReferenceCompanyAdapter());
registerCompanyAdapter("freedom-furniture", () => new FreedomCompanyAdapter());
