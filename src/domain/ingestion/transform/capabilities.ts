import type { DatasetCapabilities } from "@/domain/data";
import type { FinanceRecord, SalesRecord } from "@/domain/models";
export function deriveDatasetCapabilities(records:FinanceRecord[],sales:SalesRecord[]=[],weeklySales:SalesRecord[]=[]):DatasetCapabilities{return{hasPnl:records.length>0,hasBalanceSheet:false,hasCashFlow:false,hasSales:sales.length>0,hasWeeklySales:weeklySales.length>0,hasBudget:records.some(record=>record.budget!==undefined),hasForecast:records.some(record=>record.forecast!==undefined),hasOperationalKpis:false};}
