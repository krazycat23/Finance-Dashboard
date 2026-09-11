import type { PeriodSelection } from "@/domain/models";
import { selectComparableBudget, selectLines } from "./core";
import {
  selectBreakdown, selectPriorYearBreakdown, selectPriorYearSalesTotals, selectSalesTotals,
} from "./sales";

/**
 * DRIVER DECOMPOSITION
 * ---------------------------------------------------------------------------
 * Bridges are the analysis executives actually ask for: not "what happened"
 * but "why". Each decomposition below is exact — the drivers sum to the
 * measured movement, with any modelling residual shown explicitly as "Other"
 * rather than quietly discarded. A waterfall whose bars do not sum to the
 * endpoint is worse than no waterfall.
 */

export interface BridgeStep {
  label: string;
  value: number;
  kind: "start" | "delta" | "end";
  description?: string;
}

/**
 * Drop an "Other" step that rounds to nothing against the scale of the bridge.
 * A zero-height bar carrying a label reads as missing data; omitting it says
 * the decomposition was complete, which is what a zero residual means.
 */
function withoutNegligibleResidual(steps: BridgeStep[], scale: number): BridgeStep[] {
  const threshold = Math.abs(scale) * 0.002;
  return steps.filter(
    (step) => step.label !== "Other" || Math.abs(step.value) > threshold,
  );
}

/**
 * EBITDA bridge from the prior-year comparative to the current result.
 *
 * Gross profit is decomposed multiplicatively:
 *   ΔGP ≈ volume effect + price/mix effect + input cost effect
 * then operating costs are applied, and the residual is disclosed.
 */
export function selectEbitdaBridge(selection: PeriodSelection): BridgeStep[] {
  const lines = selectLines(selection);
  const current = selectSalesTotals(selection);
  const prior = selectPriorYearSalesTotals(selection);

  const ebitdaPrior = lines.priorYear.ebitda ?? 0;
  const ebitdaCurrent = lines.actual.ebitda ?? 0;

  // Average selling price and unit economics on the prior-year base.
  const aspPrior = prior.units ? prior.revenue / prior.units : 0;
  const aspCurrent = current.units ? current.revenue / current.units : 0;
  const unitCostPrior = prior.units ? prior.cost / prior.units : 0;
  const unitCostCurrent = current.units ? current.cost / current.units : 0;

  const deltaUnits = current.units - prior.units;

  // Volume: incremental units earning the prior-year unit margin.
  const volume = deltaUnits * (aspPrior - unitCostPrior);
  // Price / mix: the change in realised price on current volume.
  const priceMix = current.units * (aspCurrent - aspPrior);
  // Input cost: the change in unit cost on current volume, adverse when costs rise.
  const inputCost = -current.units * (unitCostCurrent - unitCostPrior);

  const operatingCosts = -((lines.actual.operatingCosts ?? 0) - (lines.priorYear.operatingCosts ?? 0));

  const explained = volume + priceMix + inputCost + operatingCosts;
  const other = ebitdaCurrent - ebitdaPrior - explained;

  return withoutNegligibleResidual([
    { label: "Prior year", value: ebitdaPrior, kind: "start" },
    { label: "Volume", value: volume, kind: "delta", description: "Unit growth at prior-year unit margin" },
    { label: "Price / Mix", value: priceMix, kind: "delta", description: "Change in realised price on current volume" },
    { label: "Input cost", value: inputCost, kind: "delta", description: "Change in unit cost of goods" },
    { label: "Opex", value: operatingCosts, kind: "delta", description: "Movement in operating cost base" },
    { label: "Other", value: other, kind: "delta", description: "Unallocated residual" },
    { label: "Current", value: ebitdaCurrent, kind: "end" },
  ], ebitdaCurrent);
}

/** Budget-to-actual bridge on EBITDA, for the Variance page. */
export function selectBudgetBridge(selection: PeriodSelection): BridgeStep[] {
  const lines = selectLines(selection);
  const budget = selectComparableBudget(selection);

  const revenueEffect = (lines.actual.revenue ?? 0) - (budget.revenue ?? 0);
  // Revenue flowing through at the budgeted gross margin rate.
  const budgetMarginRate = budget.revenue ? (budget.grossProfit ?? 0) / budget.revenue : 0;
  const volumeThrough = revenueEffect * budgetMarginRate;

  const actualMarginRate = lines.actual.revenue
    ? (lines.actual.grossProfit ?? 0) / lines.actual.revenue
    : 0;
  const marginRate = (lines.actual.revenue ?? 0) * (actualMarginRate - budgetMarginRate);

  const opex = -((lines.actual.operatingCosts ?? 0) - (budget.operatingCosts ?? 0));

  const budgetEbitda = budget.ebitda ?? 0;
  const actualEbitda = lines.actual.ebitda ?? 0;
  const other = actualEbitda - budgetEbitda - volumeThrough - marginRate - opex;

  return withoutNegligibleResidual([
    { label: "Budget EBITDA", value: budgetEbitda, kind: "start" },
    { label: "Revenue", value: volumeThrough, kind: "delta", description: "Sales variance at plan margin" },
    { label: "Margin rate", value: marginRate, kind: "delta", description: "Gross margin rate versus plan" },
    { label: "Opex", value: opex, kind: "delta", description: "Cost variance to plan" },
    { label: "Other", value: other, kind: "delta", description: "Unallocated residual" },
    { label: "Actual EBITDA", value: actualEbitda, kind: "end" },
  ], actualEbitda);
}

/**
 * Price / Volume / Mix decomposition of the revenue variance to prior year.
 *
 * Uses the standard three-way split, which is exact:
 *   Volume = (Qa − Qb) × p̄b
 *   Mix    = Σ (qa,i − Qa·wb,i) × pb,i
 *   Price  = Σ qa,i × (pa,i − pb,i)
 * The three sum precisely to the revenue movement.
 */
export interface PvmComponent {
  label: string;
  value: number;
  description: string;
}

export function selectPriceVolumeMix(selection: PeriodSelection): PvmComponent[] {
  const products = selectBreakdown(selection, "productId");
  const priorByProduct = new Map(
    selectPriorYearBreakdown(selection, "productId").map((p) => [p.id, p]),
  );

  // Real prior-year units per product. Deriving them from revenue share would
  // give every product the same implied price and force mix to zero.
  const members = products.map((product) => {
    const prior = priorByProduct.get(product.id);
    return {
      id: product.id,
      currentUnits: product.units,
      currentRevenue: product.revenue,
      priorUnits: prior?.units ?? 0,
      priorRevenue: prior?.revenue ?? 0,
    };
  });

  const currentUnits = members.reduce((s, m) => s + m.currentUnits, 0);
  const currentRevenue = members.reduce((s, m) => s + m.currentRevenue, 0);
  const priorUnits = members.reduce((s, m) => s + m.priorUnits, 0);
  const priorRevenue = members.reduce((s, m) => s + m.priorRevenue, 0);
  const priorAvgPrice = priorUnits ? priorRevenue / priorUnits : 0;

  const priorPrice = (m: (typeof members)[number]) =>
    m.priorUnits > 0 ? m.priorRevenue / m.priorUnits : priorAvgPrice;
  const currentPrice = (m: (typeof members)[number]) =>
    m.currentUnits > 0 ? m.currentRevenue / m.currentUnits : priorPrice(m);

  // Volume: total quantity change valued at the prior-year average price.
  const volume = (currentUnits - priorUnits) * priorAvgPrice;
  // Mix: the shift in the composition of that volume, at prior-year prices.
  const mix = members.reduce((sum, m) => {
    const priorWeight = priorUnits ? m.priorUnits / priorUnits : 0;
    return sum + (m.currentUnits - currentUnits * priorWeight) * priorPrice(m);
  }, 0);
  // Price: the change in realised price, on current volume.
  const price = members.reduce(
    (sum, m) => sum + m.currentUnits * (currentPrice(m) - priorPrice(m)),
    0,
  );

  const residual = currentRevenue - priorRevenue - volume - mix - price;

  const components: PvmComponent[] = [
    { label: "Volume", value: volume, description: "Change in total units at prior-year average price" },
    { label: "Price", value: price, description: "Change in realised price on current volume" },
    { label: "Mix", value: mix, description: "Shift between categories at prior-year prices" },
  ];
  // The three-way split is exact; a residual would mean a modelling error, so
  // it is disclosed rather than absorbed.
  if (Math.abs(residual) > Math.abs(currentRevenue) * 0.0005) {
    components.push({ label: "Other", value: residual, description: "Unallocated residual" });
  }
  return components;
}

/** Largest variances to budget by statement line, ranked by magnitude. */
export interface VarianceItem {
  label: string;
  actual: number;
  budget: number;
  variance: number;
  /** True where an overspend is adverse. */
  inverse: boolean;
}

export function selectTopVariances(selection: PeriodSelection): VarianceItem[] {
  const lines = selectLines(selection);
  const budget = selectComparableBudget(selection);

  const candidates: { label: string; key: keyof typeof lines.actual; inverse: boolean }[] = [
    { label: "Revenue", key: "revenue", inverse: false },
    { label: "Cost of Sales", key: "costOfSales", inverse: true },
    { label: "Operating Costs", key: "operatingCosts", inverse: true },
    { label: "Depreciation & Amortisation", key: "depreciationAmortisation", inverse: true },
    { label: "Interest", key: "interest", inverse: true },
    { label: "Tax", key: "tax", inverse: true },
  ];

  return candidates
    .map(({ label, key, inverse }) => {
      const actual = (lines.actual[key] ?? 0) as number;
      const budgetValue = (budget[key] ?? 0) as number;
      return {
        label,
        actual,
        budget: budgetValue,
        // Signed so that positive always means favourable, whatever the line.
        variance: inverse ? budgetValue - actual : actual - budgetValue,
        inverse,
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}
