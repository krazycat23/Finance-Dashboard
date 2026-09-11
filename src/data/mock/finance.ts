import type { FinanceRecord, Period, StatementLine } from "@/domain/models";
import { accounts } from "./dimensions";
import { createRandom, jitter, round, type Random } from "./random";
import type { SalesGenerationResult } from "./sales";

/**
 * FINANCE ENGINE
 * ---------------------------------------------------------------------------
 * Produces a complete, self-consistent set of financials per entity per month.
 *
 * The ordering below is deliberate and mirrors how a real close works:
 *   1. Revenue and cost of sales are taken FROM the sales records.
 *   2. Operating costs, D&A, interest and tax are modelled on top.
 *   3. Working-capital balances are derived from trailing flows and day targets.
 *   4. Cash flow is built from EBITDA less working-capital movement, tax,
 *      interest, capex and financing.
 *   5. Closing cash is the OPENING balance plus that net movement — cash is
 *      never invented independently of the cash flow statement.
 *   6. Fixed assets and debt roll forward; retained earnings accumulate
 *      net profit less dividends.
 *   7. One liability line absorbs the residual so the balance sheet balances
 *      exactly. `validate.ts` asserts the residual stays economically small.
 *
 * The consequence that matters: DSO on the Balance Sheet page and DSO on the
 * Cash Flow page are the same number because both read these balances through
 * the same selector.
 */

/** A fully-resolved month of financials for one entity. */
export interface FinancialMonth {
  periodId: string;
  entityId: string;

  // P&L
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingCostsByCategory: Record<string, number>;
  operatingCosts: number;
  ebitda: number;
  depreciation: number;
  amortisation: number;
  depreciationAmortisation: number;
  ebit: number;
  interest: number;
  tax: number;
  netProfit: number;

  // Balance sheet
  cash: number;
  tradeReceivables: number;
  inventory: number;
  otherCurrentAssets: number;
  propertyPlantEquipment: number;
  intangibleAssets: number;
  rightOfUseAssets: number;
  otherNonCurrentAssets: number;
  tradePayables: number;
  borrowingsCurrent: number;
  leaseLiabilitiesCurrent: number;
  otherCurrentLiabilities: number;
  borrowingsNonCurrent: number;
  leaseLiabilitiesNonCurrent: number;
  otherNonCurrentLiabilities: number;
  shareCapital: number;
  retainedEarnings: number;

  // Cash flow
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashMovement: number;
  capex: number;
  workingCapitalMovement: number;
  dividends: number;
}

interface EntityProfile {
  entityId: string;
  /** Operating cost as a share of revenue, by category. */
  opexRates: Record<string, number>;
  /** Opening balances at the first generated period. */
  opening: {
    cash: number;
    ppe: number;
    intangibles: number;
    rightOfUse: number;
    otherNonCurrentAssets: number;
    borrowingsCurrent: number;
    borrowingsNonCurrent: number;
    leaseCurrent: number;
    leaseNonCurrent: number;
    otherNonCurrentLiabilities: number;
    shareCapital: number;
    retainedEarnings: number;
  };
  /** Target working-capital days. */
  days: { dso: number; dio: number; dpo: number };
  capexRate: number;
  taxRate: number;
  interestRate: number;
  /** Useful lives in months, used for the straight-line D&A charge. */
  lives: { ppe: number; intangibles: number; rightOfUse: number };
}

const ENTITY_PROFILES: EntityProfile[] = [
  {
    entityId: "retail-au",
    opexRates: {
      // Occupancy covers outgoings and variable rent only: base rent sits in
      // the right-of-use amortisation and lease interest below, so charging a
      // full rental rate here would double-count it.
      "People Costs": 0.139, Marketing: 0.038, Occupancy: 0.041,
      Technology: 0.017, Logistics: 0.029, "Professional Fees": 0.006, Other: 0.014,
    },
    opening: {
      cash: 9_400_000, ppe: 48_000_000, intangibles: 7_200_000, rightOfUse: 33_000_000,
      otherNonCurrentAssets: 2_600_000, borrowingsCurrent: 3_900_000,
      borrowingsNonCurrent: 15_200_000, leaseCurrent: 7_900_000, leaseNonCurrent: 26_800_000,
      otherNonCurrentLiabilities: 3_800_000, shareCapital: 28_000_000, retainedEarnings: 15_400_000,
    },
    days: { dso: 11, dio: 96, dpo: 52 },
    capexRate: 0.026, taxRate: 0.30, interestRate: 0.0062,
    lives: { ppe: 110, intangibles: 72, rightOfUse: 68 },
  },
  {
    entityId: "retail-nz",
    opexRates: {
      "People Costs": 0.146, Marketing: 0.034, Occupancy: 0.044,
      Technology: 0.013, Logistics: 0.031, "Professional Fees": 0.005, Other: 0.016,
    },
    opening: {
      cash: 2_100_000, ppe: 9_600_000, intangibles: 1_100_000, rightOfUse: 6_700_000,
      otherNonCurrentAssets: 520_000, borrowingsCurrent: 900_000,
      borrowingsNonCurrent: 3_400_000, leaseCurrent: 1_700_000, leaseNonCurrent: 5_300_000,
      otherNonCurrentLiabilities: 780_000, shareCapital: 6_000_000, retainedEarnings: 2_900_000,
    },
    days: { dso: 13, dio: 104, dpo: 49 },
    capexRate: 0.024, taxRate: 0.28, interestRate: 0.0068,
    lives: { ppe: 108, intangibles: 72, rightOfUse: 66 },
  },
  {
    entityId: "wholesale",
    opexRates: {
      "People Costs": 0.062, Marketing: 0.011, Occupancy: 0.018,
      Technology: 0.008, Logistics: 0.042, "Professional Fees": 0.004, Other: 0.009,
    },
    opening: {
      cash: 3_300_000, ppe: 6_400_000, intangibles: 900_000, rightOfUse: 3_400_000,
      otherNonCurrentAssets: 410_000, borrowingsCurrent: 1_400_000,
      borrowingsNonCurrent: 5_800_000, leaseCurrent: 900_000, leaseNonCurrent: 2_700_000,
      otherNonCurrentLiabilities: 640_000, shareCapital: 9_000_000, retainedEarnings: 4_100_000,
    },
    // Wholesale carries real receivables — this is what moves group DSO.
    days: { dso: 58, dio: 72, dpo: 44 },
    capexRate: 0.009, taxRate: 0.30, interestRate: 0.0065,
    lives: { ppe: 120, intangibles: 84, rightOfUse: 72 },
  },
  {
    entityId: "digital",
    opexRates: {
      "People Costs": 0.094, Marketing: 0.098, Occupancy: 0.012,
      Technology: 0.041, Logistics: 0.064, "Professional Fees": 0.005, Other: 0.012,
    },
    opening: {
      cash: 4_200_000, ppe: 5_100_000, intangibles: 9_800_000, rightOfUse: 2_500_000,
      otherNonCurrentAssets: 360_000, borrowingsCurrent: 700_000,
      borrowingsNonCurrent: 2_900_000, leaseCurrent: 650_000, leaseNonCurrent: 1_950_000,
      otherNonCurrentLiabilities: 470_000, shareCapital: 11_000_000, retainedEarnings: 3_200_000,
    },
    days: { dso: 6, dio: 58, dpo: 61 },
    capexRate: 0.031, taxRate: 0.30, interestRate: 0.0060,
    lives: { ppe: 96, intangibles: 60, rightOfUse: 60 },
  },
];

export const entityProfiles = ENTITY_PROFILES;

const DAYS_IN_MONTH = 30.4;

/** Dividends are paid twice a year, in the fiscal first and third quarters. */
function dividendFor(period: Period, netProfitTrailing: number): number {
  const payoutMonths = [9, 3]; // September and March
  if (!payoutMonths.includes(period.calendarMonth)) return 0;
  return Math.max(0, netProfitTrailing * 0.34);
}

interface EngineOptions {
  /** Scenario label, used to vary noise between actual / budget / forecast. */
  scenario: "actual" | "budget" | "forecast";
  seed: number;
  /** Multiplier on modelled operating cost rates. */
  opexFactor: number;
  noise: number;
}

/**
 * Run the engine for one entity across all periods.
 * `revenueFor` supplies revenue and cost of sales for the scenario.
 */
function runEntity(
  profile: EntityProfile,
  periods: Period[],
  revenueFor: (entityId: string, periodId: string) => { revenue: number; cost: number },
  options: EngineOptions,
  rng: Random,
): FinancialMonth[] {
  const months: FinancialMonth[] = [];

  let cash = profile.opening.cash;
  let ppe = profile.opening.ppe;
  let intangibles = profile.opening.intangibles;
  let rightOfUse = profile.opening.rightOfUse;
  let borrowingsCurrent = profile.opening.borrowingsCurrent;
  let borrowingsNonCurrent = profile.opening.borrowingsNonCurrent;
  let leaseCurrent = profile.opening.leaseCurrent;
  let leaseNonCurrent = profile.opening.leaseNonCurrent;
  let retainedEarnings = profile.opening.retainedEarnings;

  let prevReceivables: number | null = null;
  let prevInventory: number | null = null;
  let prevPayables: number | null = null;

  const trailingNetProfit: number[] = [];

  periods.forEach((period, index) => {
    const { revenue, cost: costOfSales } = revenueFor(profile.entityId, period.id);
    const grossProfit = revenue - costOfSales;

    // --- Operating costs -------------------------------------------------
    const operatingCostsByCategory: Record<string, number> = {};
    let operatingCosts = 0;
    for (const [category, rate] of Object.entries(profile.opexRates)) {
      // Costs carry a mild scale benefit as revenue grows, plus noise.
      const scaleBenefit = 1 - Math.min(index * 0.0006, 0.06);
      const amount =
        revenue * rate * options.opexFactor * scaleBenefit * jitter(rng, options.noise);
      operatingCostsByCategory[category] = round(amount, 2);
      operatingCosts += amount;
    }

    const ebitda = grossProfit - operatingCosts;

    // --- Depreciation and amortisation ------------------------------------
    // Straight-line on opening balances; the roll-forward below keeps the
    // asset base and the charge consistent with each other.
    const depreciation = ppe / profile.lives.ppe + rightOfUse / profile.lives.rightOfUse;
    const amortisation = intangibles / profile.lives.intangibles;
    const depreciationAmortisation = depreciation + amortisation;
    const ebit = ebitda - depreciationAmortisation;

    // --- Interest and tax --------------------------------------------------
    const grossDebt = borrowingsCurrent + borrowingsNonCurrent + leaseCurrent + leaseNonCurrent;
    const interest = grossDebt * profile.interestRate;
    const profitBeforeTax = ebit - interest;
    // No floor at zero: a loss month books a deferred tax benefit. Flooring
    // monthly tax would inflate the year-to-date charge on a seasonal business.
    const tax = profitBeforeTax * profile.taxRate;
    const netProfit = profitBeforeTax - tax;

    trailingNetProfit.push(netProfit);
    if (trailingNetProfit.length > 6) trailingNetProfit.shift();

    // --- Working capital ---------------------------------------------------
    // Day targets drift so that DSO/DIO/DPO actually move period to period.
    const dsoTarget = profile.days.dso * (1 - index * 0.0022) * jitter(rng, options.noise * 0.4);
    const dioTarget = profile.days.dio * (1 - index * 0.0018) * jitter(rng, options.noise * 0.4);
    const dpoTarget = profile.days.dpo * (1 + index * 0.0016) * jitter(rng, options.noise * 0.4);

    const tradeReceivables = (revenue / DAYS_IN_MONTH) * dsoTarget;
    const inventory = (costOfSales / DAYS_IN_MONTH) * dioTarget;
    const tradePayables = (costOfSales / DAYS_IN_MONTH) * dpoTarget;

    const workingCapitalMovement =
      prevReceivables === null
        ? 0
        : (tradeReceivables - prevReceivables) +
          (inventory - prevInventory!) -
          (tradePayables - prevPayables!);

    const otherCurrentAssets = revenue * 0.048 * jitter(rng, options.noise * 0.5);
    const otherCurrentLiabilitiesBase = revenue * 0.071 * jitter(rng, options.noise * 0.5);

    // --- Cash flow ---------------------------------------------------------
    // Operating cash flow is EBITDA converted to cash: the working-capital
    // movement is the bridge, and interest and tax are paid in cash.
    const operatingCashFlow = ebitda - workingCapitalMovement - interest - tax;

    const capex = revenue * profile.capexRate * jitter(rng, options.noise * 1.5);
    const investingCashFlow = -capex;

    const debtRepayment = Math.min(borrowingsCurrent * 0.031, borrowingsCurrent);
    const leaseRepayment = Math.min(leaseCurrent * 0.042, leaseCurrent);
    const dividends = dividendFor(
      period,
      trailingNetProfit.reduce((a, b) => a + b, 0),
    );
    const financingCashFlow = -(debtRepayment + leaseRepayment + dividends);

    const netCashMovement = operatingCashFlow + investingCashFlow + financingCashFlow;

    // Closing cash is opening plus movement. This is the identity that makes
    // the cash flow bridge on the Cash Flow page tie to the Balance Sheet.
    cash = cash + netCashMovement;

    // --- Roll forward non-current items ------------------------------------
    // Capex is split between tangible and intangible investment.
    const capexPpe = capex * 0.72;
    const capexIntangible = capex * 0.28;
    ppe = ppe + capexPpe - ppe / profile.lives.ppe;
    intangibles = intangibles + capexIntangible - amortisation;
    // Lease additions roughly replace amortisation of the right-of-use asset.
    const rouAmortisation = rightOfUse / profile.lives.rightOfUse;
    const leaseAdditions = rouAmortisation * (0.94 + rng() * 0.18);
    rightOfUse = rightOfUse - rouAmortisation + leaseAdditions;

    borrowingsCurrent = borrowingsCurrent - debtRepayment + borrowingsNonCurrent * 0.006;
    borrowingsNonCurrent = borrowingsNonCurrent * 0.994;
    leaseCurrent = leaseCurrent - leaseRepayment + leaseNonCurrent * 0.011 + leaseAdditions * 0.24;
    leaseNonCurrent = leaseNonCurrent * 0.989 + leaseAdditions * 0.76;

    retainedEarnings = retainedEarnings + netProfit - dividends;

    // --- Balance the sheet --------------------------------------------------
    // Everything above is modelled independently, so a residual remains. It is
    // absorbed into other non-current liabilities (deferred tax, provisions,
    // accruals), which is where such a residual genuinely sits in practice.
    const totalAssets =
      cash + tradeReceivables + inventory + otherCurrentAssets +
      ppe + intangibles + rightOfUse + profile.opening.otherNonCurrentAssets;

    const knownLiabilitiesAndEquity =
      tradePayables + borrowingsCurrent + leaseCurrent + otherCurrentLiabilitiesBase +
      borrowingsNonCurrent + leaseNonCurrent +
      profile.opening.shareCapital + retainedEarnings;

    const otherNonCurrentLiabilities = totalAssets - knownLiabilitiesAndEquity;

    months.push({
      periodId: period.id,
      entityId: profile.entityId,
      revenue: round(revenue, 2),
      costOfSales: round(costOfSales, 2),
      grossProfit: round(grossProfit, 2),
      operatingCostsByCategory,
      operatingCosts: round(operatingCosts, 2),
      ebitda: round(ebitda, 2),
      depreciation: round(depreciation, 2),
      amortisation: round(amortisation, 2),
      depreciationAmortisation: round(depreciationAmortisation, 2),
      ebit: round(ebit, 2),
      interest: round(interest, 2),
      tax: round(tax, 2),
      netProfit: round(netProfit, 2),

      cash: round(cash, 2),
      tradeReceivables: round(tradeReceivables, 2),
      inventory: round(inventory, 2),
      otherCurrentAssets: round(otherCurrentAssets, 2),
      propertyPlantEquipment: round(ppe, 2),
      intangibleAssets: round(intangibles, 2),
      rightOfUseAssets: round(rightOfUse, 2),
      otherNonCurrentAssets: round(profile.opening.otherNonCurrentAssets, 2),
      tradePayables: round(tradePayables, 2),
      borrowingsCurrent: round(borrowingsCurrent, 2),
      leaseLiabilitiesCurrent: round(leaseCurrent, 2),
      otherCurrentLiabilities: round(otherCurrentLiabilitiesBase, 2),
      borrowingsNonCurrent: round(borrowingsNonCurrent, 2),
      leaseLiabilitiesNonCurrent: round(leaseNonCurrent, 2),
      otherNonCurrentLiabilities: round(otherNonCurrentLiabilities, 2),
      shareCapital: round(profile.opening.shareCapital, 2),
      retainedEarnings: round(retainedEarnings, 2),

      operatingCashFlow: round(operatingCashFlow, 2),
      investingCashFlow: round(investingCashFlow, 2),
      financingCashFlow: round(financingCashFlow, 2),
      netCashMovement: round(netCashMovement, 2),
      capex: round(capex, 2),
      workingCapitalMovement: round(workingCapitalMovement, 2),
      dividends: round(dividends, 2),
    });

    prevReceivables = tradeReceivables;
    prevInventory = inventory;
    prevPayables = tradePayables;
  });

  return months;
}

export interface FinanceScenarios {
  actual: FinancialMonth[];
  budget: FinancialMonth[];
  forecast: FinancialMonth[];
}

export function generateFinancials(
  periods: Period[],
  sales: SalesGenerationResult,
): FinanceScenarios {
  const lookup = (
    field: "revenue" | "budgetRevenue",
    costRatioFrom: SalesGenerationResult,
  ) => (entityId: string, periodId: string) => {
    const totals = costRatioFrom.monthlyTotals.get(`${entityId}|${periodId}`);
    if (!totals) return { revenue: 0, cost: 0 };
    if (field === "revenue") return { revenue: totals.revenue, cost: totals.cost };
    // The plan carries the same cost ratio as the actual mix implies.
    const ratio = totals.revenue === 0 ? 0.55 : totals.cost / totals.revenue;
    return { revenue: totals.budgetRevenue, cost: totals.budgetRevenue * ratio };
  };

  const run = (
    options: EngineOptions,
    revenueFor: (entityId: string, periodId: string) => { revenue: number; cost: number },
  ) => {
    const rng = createRandom(options.seed);
    return ENTITY_PROFILES.flatMap((profile) =>
      runEntity(profile, periods, revenueFor, options, rng),
    );
  };

  const actual = run(
    { scenario: "actual", seed: 4242, opexFactor: 1, noise: 0.035 },
    lookup("revenue", sales),
  );
  const budget = run(
    { scenario: "budget", seed: 8080, opexFactor: 1.018, noise: 0.003 },
    lookup("budgetRevenue", sales),
  );
  // The forecast is the latest reforecast: closer to actual than plan was,
  // with a modest cost-out assumption in the remaining periods.
  const forecast = run(
    { scenario: "forecast", seed: 1357, opexFactor: 0.994, noise: 0.012 },
    lookup("revenue", sales),
  );

  return { actual, budget, forecast };
}

/**
 * Flatten the scenario engines into canonical FinanceRecords, one per
 * account x entity x period.
 *
 * Line totals are allocated across the accounts that map to each line using
 * fixed shares. Because the statement tables re-aggregate by `line`, the
 * allocation is invisible downstream but exercises the same mapping path a
 * real chart of accounts would take.
 */
export function toFinanceRecords(
  periods: Period[],
  scenarios: FinanceScenarios,
): FinanceRecord[] {
  const index = (months: FinancialMonth[]) => {
    const map = new Map<string, FinancialMonth>();
    for (const m of months) map.set(`${m.entityId}|${m.periodId}`, m);
    return map;
  };
  const actualIdx = index(scenarios.actual);
  const budgetIdx = index(scenarios.budget);
  const forecastIdx = index(scenarios.forecast);

  /** Share of a statement line taken by each account mapped to it. */
  const ACCOUNT_SHARE: Record<string, number> = {
    "a-4000": 0.974, "a-4100": 0.026,
    "a-5000": 0.935, "a-5100": 0.049, "a-5200": 0.016,
    "a-7000": 0.83, "a-7100": 0.17,
  };

  const lineValue = (m: FinancialMonth, line: StatementLine): number | undefined => {
    switch (line) {
      case "revenue": return m.revenue;
      case "costOfSales": return m.costOfSales;
      case "operatingCosts": return m.operatingCosts;
      case "depreciationAmortisation": return m.depreciationAmortisation;
      case "interest": return m.interest;
      case "tax": return m.tax;
      case "cash": return m.cash;
      case "tradeReceivables": return m.tradeReceivables;
      case "inventory": return m.inventory;
      case "otherCurrentAssets": return m.otherCurrentAssets;
      case "propertyPlantEquipment": return m.propertyPlantEquipment;
      case "intangibleAssets": return m.intangibleAssets;
      case "rightOfUseAssets": return m.rightOfUseAssets;
      case "otherNonCurrentAssets": return m.otherNonCurrentAssets;
      case "tradePayables": return m.tradePayables;
      case "borrowingsCurrent": return m.borrowingsCurrent;
      case "leaseLiabilitiesCurrent": return m.leaseLiabilitiesCurrent;
      case "otherCurrentLiabilities": return m.otherCurrentLiabilities;
      case "borrowingsNonCurrent": return m.borrowingsNonCurrent;
      case "leaseLiabilitiesNonCurrent": return m.leaseLiabilitiesNonCurrent;
      case "otherNonCurrentLiabilities": return m.otherNonCurrentLiabilities;
      case "shareCapital": return m.shareCapital;
      case "retainedEarnings": return m.retainedEarnings;
      default: return undefined;
    }
  };

  const records: FinanceRecord[] = [];

  for (const period of periods) {
    for (const profile of ENTITY_PROFILES) {
      const key = `${profile.entityId}|${period.id}`;
      const a = actualIdx.get(key);
      const b = budgetIdx.get(key);
      const f = forecastIdx.get(key);
      if (!a) continue;

      const priorKey = (() => {
        const [year, month] = period.id.split("-").map(Number);
        return `${profile.entityId}|${year - 1}-${String(month).padStart(2, "0")}`;
      })();
      const py = actualIdx.get(priorKey);

      for (const account of accounts) {
        // Operating cost accounts take their own modelled category value
        // rather than a share of the line total.
        const isOpexAccount = account.line === "operatingCosts" && account.costCategory;
        const share = ACCOUNT_SHARE[account.id] ?? 1;

        const valueFor = (m: FinancialMonth | undefined): number | undefined => {
          if (!m) return undefined;
          if (isOpexAccount) return m.operatingCostsByCategory[account.costCategory!] ?? 0;
          const raw = lineValue(m, account.line);
          return raw === undefined ? undefined : raw * share;
        };

        const actualValue = period.isActual ? valueFor(a) : undefined;

        records.push({
          periodId: period.id,
          entityId: profile.entityId,
          accountId: account.id,
          actual: actualValue === undefined ? undefined : round(actualValue, 2),
          budget: round(valueFor(b) ?? 0, 2),
          forecast: round(valueFor(f) ?? 0, 2),
          priorYear: py ? round(valueFor(py) ?? 0, 2) : undefined,
        });
      }
    }
  }

  return records;
}
