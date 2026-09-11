import type { TableRange, WideUnpivotConfiguration } from "./types";

const text = (value: unknown) => String(value ?? "").trim();
const likelyHeader = (value: unknown) => /account|entity|cost.?centre|period|date|revenue|sales|week|gl|channel|customer|product/i.test(text(value));
export function detectTableRange(grid: unknown[][]): TableRange | undefined {
  const candidates = grid.slice(0, 40).map((row, index) => { const populated=row.filter((cell)=>text(cell)).length; const named=row.filter(likelyHeader).length; return { index, populated, named, score:named*4+Math.min(populated,12) }; }).filter((candidate)=>candidate.populated>=2).sort((a,b)=>b.score-a.score);
  const best=candidates[0]; if(!best) return undefined;
  const end=grid.slice(best.index+1).findIndex((row)=>row.filter((cell)=>text(cell)).length===0);
  const confidence=Math.min(.98,best.score/22);
  return { headerRow:best.index+1,startRow:best.index+2,endRow:end<0?grid.length:best.index+1+end,confidence,requiresConfirmation:confidence<.72 };
}
export function unpivotWideRows(rows: ReadonlyArray<Record<string, unknown>>, config: WideUnpivotConfiguration): Record<string, unknown>[] {
  const valueField=config.valueField??"amount";
  return rows.flatMap((row)=>config.valueColumns.map((column):Record<string,unknown>=>({ ...Object.fromEntries(config.identifierColumns.map((key)=>[key,row[key]])), [valueField]:row[column], period:config.periodFromColumn?column:row.period, ...(config.scenarioFromColumn?{scenario:column}: {}) })).filter((row)=>row[valueField]!==null&&row[valueField]!==""));
}
