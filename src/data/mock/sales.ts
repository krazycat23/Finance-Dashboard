import type { Period, SalesRecord } from "@/domain/models";
import { stores } from "./dimensions";
import { createRandom, jitter, round, type Random } from "./random";

/**
 * SALES GENERATION
 * ---------------------------------------------------------------------------
 * Sales are generated FIRST and bottom-up. The P&L engine then derives revenue
 * and cost of sales by aggregating these records, which is what guarantees the
 * Sales page and the Profit & Loss page can never disagree about revenue.
 *
 * Grain:
 *   monthly  — entity x channel x product x location (full detail)
 *   weekly   — entity x channel, produced by splitting each month across its
 *              weeks with weights summing to exactly 1, so the weekly series
 *              re-aggregates to the monthly series without drift.
 */

interface Combo {
  entityId: string;
  channelId: string;
  locationId: string;
  /** Share of total group revenue, before seasonality and noise. */
  weight: number;
  /** Gross margin rate for this combination. */
  marginRate: number;
  /** Average transaction value, in currency units. */
  atv: number;
  /** Units per transaction. */
  upt: number;
  /** False for locations opened or closed mid-comparative (excluded from LFL). */
  comparable: boolean;
  /** Compound monthly growth specific to this combination, if any. */
  growthAdj?: number;
}

/**
 * Product mix weights, applied within every combination.
 *
 * `drift` is compound monthly growth specific to the category, and
 * `priceIndex` sets its relative price point. Both are needed for a
 * price/volume/mix decomposition to have anything to find: constant weights
 * make the mix effect zero, and a uniform price makes it zero again even when
 * the weights move.
 */
const PRODUCT_MIX: Record<
  string,
  { weight: number; marginAdj: number; drift: number; priceIndex: number }
> = {
  womenswear: { weight: 0.3, marginAdj: 0.035, drift: 0.0012, priceIndex: 1.0 },
  menswear: { weight: 0.22, marginAdj: -0.015, drift: -0.0016, priceIndex: 1.08 },
  footwear: { weight: 0.18, marginAdj: 0.02, drift: 0.0038, priceIndex: 1.52 },
  accessories: { weight: 0.12, marginAdj: 0.055, drift: 0.0024, priceIndex: 0.52 },
  home: { weight: 0.1, marginAdj: -0.005, drift: -0.0021, priceIndex: 0.88 },
  kids: { weight: 0.08, marginAdj: -0.045, drift: -0.0029, priceIndex: 0.6 },
};

/**
 * Store format moves both the basket and the margin: a flagship trades at
 * full price on a larger basket, an outlet does the opposite. Without this
 * every store in a region would be a scaled copy of every other one and a
 * store ranking would say nothing a regional ranking did not already say.
 */
const FORMAT_ATV_INDEX: Record<string, number> = {
  Flagship: 1.24, Metro: 1.05, Suburban: 0.93, Outlet: 0.71,
};
const FORMAT_MARGIN_ADJ: Record<string, number> = {
  Flagship: 0.028, Metro: 0.009, Suburban: -0.006, Outlet: -0.052,
};

const AU_REGIONS = ["nsw", "vic", "qld", "sa", "wa"] as const;
const AU_REGION_WEIGHT: Record<string, number> = {
  nsw: 0.34, vic: 0.27, qld: 0.19, sa: 0.09, wa: 0.11,
};

/**
 * The combination table. This is demonstration structure only — a real
 * deployment reads these from the client's dimension tables.
 */
function buildCombos(): Combo[] {
  const combos: Combo[] = [];

  // Retail Australia — the store estate, carried store by store, plus online.
  // The regional weight is unchanged; it is simply distributed across the
  // stores that make up the region, so a regional view is a roll-up.
  for (const region of AU_REGIONS) {
    for (const store of stores.filter((s) => s.regionId === region)) {
      combos.push({
        entityId: "retail-au",
        channelId: "stores",
        locationId: store.id,
        weight: 0.4 * AU_REGION_WEIGHT[region] * store.share,
        marginRate: 0.455 + FORMAT_MARGIN_ADJ[store.format],
        atv: 92 * FORMAT_ATV_INDEX[store.format],
        upt: 2.1,
        comparable: store.comparable,
        growthAdj: store.growthAdj,
      });
    }
  }
  combos.push({
    entityId: "retail-au", channelId: "online", locationId: "nsw",
    weight: 0.07, marginRate: 0.492, atv: 118, upt: 1.8, comparable: true,
  });

  // Retail New Zealand — the same estate treatment.
  for (const store of stores.filter((s) => s.regionId === "nz")) {
    combos.push({
      entityId: "retail-nz",
      channelId: "stores",
      locationId: store.id,
      weight: 0.09 * store.share,
      marginRate: 0.438 + FORMAT_MARGIN_ADJ[store.format],
      atv: 86 * FORMAT_ATV_INDEX[store.format],
      upt: 2.0,
      comparable: store.comparable,
      growthAdj: store.growthAdj,
    });
  }
  combos.push({
    entityId: "retail-nz", channelId: "online", locationId: "nz",
    weight: 0.025, marginRate: 0.478, atv: 109, upt: 1.7, comparable: true,
  });

  // Digital — the growth engine, higher margin, higher basket.
  combos.push({
    entityId: "digital", channelId: "online", locationId: "nsw",
    weight: 0.13, marginRate: 0.515, atv: 126, upt: 1.9, comparable: true,
  });
  combos.push({
    entityId: "digital", channelId: "marketplace", locationId: "vic",
    weight: 0.045, marginRate: 0.372, atv: 97, upt: 1.6, comparable: true,
  });

  // Wholesale — lower margin, larger orders, fewer transactions.
  combos.push({
    entityId: "wholesale", channelId: "wholesale", locationId: "nsw",
    weight: 0.14, marginRate: 0.318, atv: 4200, upt: 64, comparable: true,
  });
  combos.push({
    entityId: "wholesale", channelId: "wholesale", locationId: "nz",
    weight: 0.035, marginRate: 0.302, atv: 3800, upt: 58, comparable: true,
  });

  return combos;
}

export const combos = buildCombos();

/**
 * Seasonal index by calendar month (1-12). Southern-hemisphere retail: a
 * December peak, a June end-of-financial-year event, a February trough.
 */
const SEASONALITY = [
  0.86, 0.79, 0.93, 0.95, 0.98, 1.06,
  0.97, 0.92, 0.99, 1.04, 1.09, 1.42,
];

interface ScenarioParams {
  seed: number;
  /** Compound monthly growth applied from the series origin. */
  monthlyGrowth: number;
  /** Multiplier on the base margin rate. */
  marginFactor: number;
  /** Noise amplitude; plan scenarios are smooth, actuals are not. */
  noise: number;
  /** Channel-level growth overlay, e.g. online outperforming. */
  channelGrowth: Record<string, number>;
}

const BASE_MONTHLY_REVENUE = 13_900_000;

function comboRevenue(
  combo: Combo,
  productId: string,
  monthIndex: number,
  calendarMonth: number,
  params: ScenarioParams,
  rng: Random,
): number {
  const productMix = PRODUCT_MIX[productId];
  const channelOverlay = (1 + (params.channelGrowth[combo.channelId] ?? 0)) ** monthIndex;
  const trend = (1 + params.monthlyGrowth) ** monthIndex;
  const seasonal = SEASONALITY[calendarMonth - 1];

  // Category drift is damped on plan scenarios: a budget rarely anticipates
  // the full extent of a mix shift.
  const mixDrift = (1 + productMix.drift * (params.noise > 0.02 ? 1 : 0.6)) ** monthIndex;

  // A store's own trajectory, damped on plan scenarios for the same reason as
  // category drift: a budget is set on the group's growth, not on each store
  // out-running or falling behind it.
  const comboDrift =
    (1 + (combo.growthAdj ?? 0) * (params.noise > 0.02 ? 1 : 0.35)) ** monthIndex;

  return (
    BASE_MONTHLY_REVENUE *
    combo.weight *
    productMix.weight *
    trend *
    channelOverlay *
    seasonal *
    mixDrift *
    comboDrift *
    jitter(rng, params.noise)
  );
}

export interface SalesGenerationResult {
  monthly: SalesRecord[];
  /** Lookup of monthly revenue and cost by `${entityId}|${periodId}`. */
  monthlyTotals: Map<string, { revenue: number; cost: number; budgetRevenue: number }>;
}

/**
 * Generate monthly sales for every period in `periods`.
 *
 * Actual, budget and prior-year all come from the same generator with
 * different parameters, so the budget's own gross margin arithmetic holds
 * exactly as the actual's does.
 */
export function generateSales(periods: Period[]): SalesGenerationResult {
  const actualParams: ScenarioParams = {
    seed: 20260301,
    monthlyGrowth: 0.0058,
    marginFactor: 1,
    noise: 0.042,
    channelGrowth: { online: 0.0055, marketplace: 0.004, stores: -0.0012, wholesale: -0.0006 },
  };
  const budgetParams: ScenarioParams = {
    seed: 90210,
    monthlyGrowth: 0.0049,
    marginFactor: 0.995,
    // Plans are smooth by nature; they do not contain week-to-week noise.
    noise: 0.004,
    channelGrowth: { online: 0.0042, marketplace: 0.003, stores: -0.0005, wholesale: 0 },
  };

  const actualRng = createRandom(actualParams.seed);
  const budgetRng = createRandom(budgetParams.seed);

  const monthly: SalesRecord[] = [];
  const monthlyTotals = new Map<string, { revenue: number; cost: number; budgetRevenue: number }>();

  periods.forEach((period, monthIndex) => {
    for (const combo of combos) {
      for (const productId of Object.keys(PRODUCT_MIX)) {
        const productMix = PRODUCT_MIX[productId];

        const revenue = comboRevenue(
          combo, productId, monthIndex, period.calendarMonth, actualParams, actualRng,
        );
        const budgetRevenue = comboRevenue(
          combo, productId, monthIndex, period.calendarMonth, budgetParams, budgetRng,
        );

        // Margin drifts slowly with mix and promotional intensity.
        const marginRate =
          (combo.marginRate + productMix.marginAdj) *
          actualParams.marginFactor *
          jitter(actualRng, 0.02) +
          monthIndex * 0.00045;

        const cost = revenue * (1 - marginRate);
        const transactions = revenue / (combo.atv * jitter(actualRng, 0.03));
        // Categories sell at genuinely different price points. Without this,
        // every product would carry the same implied unit price and a mix
        // effect could never be anything but zero.
        const units = (transactions * combo.upt) / productMix.priceIndex;

        const record: SalesRecord = {
          periodId: period.id,
          entityId: combo.entityId,
          channelId: combo.channelId,
          productId,
          locationId: combo.locationId,
          revenue: round(revenue, 2),
          cost: round(cost, 2),
          units: round(units),
          transactions: round(transactions),
          orders: round(transactions * (combo.channelId === "wholesale" ? 1 : 0.94)),
          traffic: round(transactions / (0.031 * jitter(actualRng, 0.08))),
          budgetRevenue: round(budgetRevenue, 2),
          comparable: combo.comparable,
        };

        monthly.push(record);

        const key = `${combo.entityId}|${period.id}`;
        const totals = monthlyTotals.get(key) ?? { revenue: 0, cost: 0, budgetRevenue: 0 };
        totals.revenue += record.revenue;
        totals.cost += record.cost ?? 0;
        totals.budgetRevenue += record.budgetRevenue ?? 0;
        monthlyTotals.set(key, totals);
      }
    }
  });

  // Prior year is the same series twelve months earlier — read back from what
  // was generated rather than invented, so vs-LY always reconciles.
  const byKey = new Map<string, SalesRecord>();
  for (const r of monthly) {
    byKey.set(`${r.periodId}|${r.entityId}|${r.channelId}|${r.productId}|${r.locationId}`, r);
  }
  for (const r of monthly) {
    const [year, month] = r.periodId.split("-").map(Number);
    const priorId = `${year - 1}-${String(month).padStart(2, "0")}`;
    const prior = byKey.get(
      `${priorId}|${r.entityId}|${r.channelId}|${r.productId}|${r.locationId}`,
    );
    if (prior) r.priorYearRevenue = prior.revenue;
  }

  return { monthly, monthlyTotals };
}

/**
 * Split monthly sales into weeks at entity x channel grain.
 *
 * The split weights are normalised to sum to 1, so summing the weekly series
 * over a month reproduces the monthly figure exactly. Charts that mix the two
 * grains therefore never show a reconciliation gap.
 */
export function generateWeeklySales(
  periods: Period[],
  monthly: SalesRecord[],
): { weeks: Period[]; records: SalesRecord[] } {
  const rng = createRandom(77711);
  const weeks: Period[] = [];
  const records: SalesRecord[] = [];

  // Aggregate monthly detail to entity x channel.
  const byMonthChannel = new Map<string, SalesRecord[]>();
  for (const r of monthly) {
    const key = `${r.periodId}|${r.entityId}|${r.channelId}`;
    const list = byMonthChannel.get(key);
    if (list) list.push(r);
    else byMonthChannel.set(key, [r]);
  }

  // Fiscal week numbering resets each year. A running counter across the whole
  // generated history would label the current year's weeks W92-W144.
  let weekCounter = 0;
  let currentFiscalYear = "";
  for (const period of periods) {
    if (period.fiscalYear !== currentFiscalYear) {
      currentFiscalYear = period.fiscalYear;
      weekCounter = 0;
    }
    // Four or five weeks per month on a 4-4-5 style rhythm.
    const weekCount = period.calendarMonth % 3 === 0 ? 5 : 4;
    const rawWeights = Array.from({ length: weekCount }, () => 0.8 + rng() * 0.4);
    const weightSum = rawWeights.reduce((a, b) => a + b, 0);
    const weights = rawWeights.map((w) => w / weightSum);

    for (let w = 0; w < weekCount; w++) {
      weekCounter += 1;
      const weekPeriod: Period = {
        id: `${period.id}-W${w + 1}`,
        date: period.date,
        grain: "week",
        label: `Week ${weekCounter}`,
        shortLabel: `W${weekCounter}`,
        fiscalYear: period.fiscalYear,
        fiscalPeriod: period.fiscalPeriod,
        fiscalWeek: weekCounter,
        calendarYear: period.calendarYear,
        calendarMonth: period.calendarMonth,
        isActual: period.isActual,
      };
      weeks.push(weekPeriod);

      for (const [key, group] of byMonthChannel) {
        const [periodId, entityId, channelId] = key.split("|");
        if (periodId !== period.id) continue;

        const revenue = group.reduce((sum, r) => sum + r.revenue, 0) * weights[w];
        const cost = group.reduce((sum, r) => sum + (r.cost ?? 0), 0) * weights[w];
        const units = group.reduce((sum, r) => sum + (r.units ?? 0), 0) * weights[w];
        const transactions = group.reduce((sum, r) => sum + (r.transactions ?? 0), 0) * weights[w];
        const budgetRevenue =
          group.reduce((sum, r) => sum + (r.budgetRevenue ?? 0), 0) * weights[w];
        const priorYearRevenue =
          group.reduce((sum, r) => sum + (r.priorYearRevenue ?? 0), 0) * weights[w];

        records.push({
          periodId: weekPeriod.id,
          entityId,
          channelId,
          revenue: round(revenue, 2),
          cost: round(cost, 2),
          units: round(units),
          transactions: round(transactions),
          orders: round(transactions * 0.94),
          budgetRevenue: round(budgetRevenue, 2),
          priorYearRevenue: priorYearRevenue > 0 ? round(priorYearRevenue, 2) : undefined,
          comparable: true,
        });
      }
    }
  }

  return { weeks, records };
}
