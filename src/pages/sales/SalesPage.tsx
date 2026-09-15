import { useMemo, useState } from "react";
import { useReportingDataset } from "@/app/providers/ReportingDataProvider";
import { ConfiguredReporting } from "@/components/finance/ConfiguredReporting";
import { useFilters } from "@/app/providers/FilterProvider";
import { Masthead } from "@/components/layout/Masthead";
import { Section, SectionRow } from "@/components/layout/Section";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Meter } from "@/components/ui/Meter";
import { KpiBand } from "@/components/finance/KpiBand";
import { buildPerformanceHeadline } from "@/components/finance/performanceHeadline";
import { NumberedInsightList } from "@/components/finance/InsightList";
import { ReportingUnavailable } from "@/components/finance/ReportingAvailability";
import { VarianceValue } from "@/components/finance/VarianceValue";
import { WeeklyTrendChart } from "@/components/charts/WeeklyTrendChart";
import { OrderFlowChart } from "@/components/charts/OrderFlowChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { CompositionChart, type CompositionSlice } from "@/components/charts/CompositionChart";
import { DataTable, type Column } from "@/components/tables/DataTable";
import {
  periodsForBasis, selectBreakdown, selectInsights, selectKpis, selectMetricSeries,
  selectOrderBook, selectOrderFlow, selectSalesTotals, selectWeeklySales,
  type DimensionBreakdown, type OrderBook, type WeeklyPoint,
} from "@/domain/selectors";
import {
  reportingCapabilities, selectModuleAvailability,
} from "@/domain/selectors/availability";
import type { KpiDatum } from "@/domain/selectors/kpi";
import type { Location } from "@/domain/models";
import { calculateVariance } from "@/domain/metrics/variance";
import { getMetric } from "@/domain/metrics";
import { formatCurrency, formatMetric, formatMetricDelta, formatPercentage } from "@/utils/format";
import { cn } from "@/utils/cn";

/**
 * SALES — NORTH HOUSE
 * ---------------------------------------------------------------------------
 * The commercial reading of the same revenue the P&L reports — both read the
 * same sales facts, so the two pages cannot disagree about the top line.
 *
 *   masthead    the period's trading statement and its commentary
 *   band        four headline commercial measures, then the trading ratios
 *   01 | 02     the trading series against the channel mix        (65/35)
 *   03 | 04     regional performance against the drivers          (55/45)
 *   05          category performance, best and worst, side by side
 *   06          recent trading weeks, where weekly facts exist
 *
 * More energetic than the P&L — a wider spread, a denser series, paired
 * rankings — but the same rules: nothing is boxed, charts sit on the canvas,
 * and no metric, selector or arithmetic is added here.
 */

/** The headline commercial measures. All are registry metrics. */
const SALES_KPIS = ["totalSales", "likeForLikeSales", "transactions", "averageTransactionValue"];

/** The trading ratios behind them, shown as a rail rather than a second band. */
const TRADING_RATIOS = ["traffic", "conversion", "unitsPerTransaction", "grossMargin"];

/**
 * Trading windows the weekly selector already supports. This is a real control:
 * the week count is the selector's own argument, not a filter invented here.
 */
const WEEK_WINDOWS = [
  { value: "13", label: "13 weeks" },
  { value: "26", label: "26 weeks" },
  { value: "52", label: "52 weeks" },
] as const;
type WeekWindow = (typeof WEEK_WINDOWS)[number]["value"];

/** Grains the breakdown selector supports for a "where did it come from" read. */
const GRAINS = [
  { value: "regionId", label: "Region" },
  { value: "storeId", label: "Store" },
  { value: "entityId", label: "Entity" },
] as const;
type Grain = (typeof GRAINS)[number]["value"];

export function SalesPage() {
  return useReportingDataset().source === "demo" ? <DemoSalesPage /> : <ConfiguredReporting mode="sales" />;
}

function DemoSalesPage() {
  const dataset = useReportingDataset();
  const { selection, currentPeriod, basis } = useFilters();
  const capabilities = reportingCapabilities(dataset);

  const [weekWindow, setWeekWindow] = useState<WeekWindow>("26");
  const [grain, setGrain] = useState<Grain>("regionId");

  const kpis = useMemo(() => selectKpis(SALES_KPIS, selection), [selection]);
  const ratios = useMemo(() => selectKpis(TRADING_RATIOS, selection), [selection]);
  const headline = useMemo(
    () => buildPerformanceHeadline(kpis, ["likeForLikeSales", "transactions", "averageTransactionValue"]),
    [kpis],
  );
  const insights = useMemo(() => selectInsights(selection, "sales"), [selection]);
  const totals = useMemo(() => selectSalesTotals(selection), [selection]);
  const channels = useMemo(() => selectBreakdown(selection, "channelId"), [selection]);
  const products = useMemo(() => selectBreakdown(selection, "productId"), [selection]);
  const members = useMemo(() => selectBreakdown(selection, grain), [selection, grain]);

  // The store estate. Sales for the store channel are carried store by store,
  // so this is the same fact table read at its own grain — not a second one.
  const storeRows = useMemo(() => selectBreakdown(selection, "storeId"), [selection]);
  const storeIndex = useMemo(
    () => new Map(dataset.dimensions.locations.map((location) => [location.id, location])),
    [dataset],
  );
  // Written against delivered, and the bank of orders between the two.
  const orderBook = useMemo(() => selectOrderBook(selection), [selection]);
  const orderFlow = useMemo(() => selectOrderFlow(selection), [selection]);

  const rankedStores = useMemo(
    () => [...storeRows].sort((a, b) => (b.growth ?? -1) - (a.growth ?? -1)),
    [storeRows],
  );
  const pairedStores = rankedStores.length >= 6;
  const storeHalf = Math.min(6, Math.floor(rankedStores.length / 2));
  const bestStores = pairedStores ? rankedStores.slice(0, storeHalf) : rankedStores;
  const worstStores = pairedStores ? rankedStores.slice(-storeHalf).reverse() : [];

  const weekly = useMemo(
    () => (capabilities.hasWeeklySales ? selectWeeklySales(selection, Number(weekWindow)) : []),
    [selection, weekWindow, capabilities],
  );

  // Where weekly facts do not exist the section still has to say something
  // truthful, so it falls back to the monthly series rather than synthesising
  // weeks out of monthly totals.
  const monthly = useMemo(() => {
    if (capabilities.hasWeeklySales) return [];
    const periods = periodsForBasis("R12", selection.periodId);
    return selectMetricSeries("revenue", periods, selection.entityId);
  }, [selection, capabilities]);

  const channelSlices = useMemo<CompositionSlice[]>(
    () =>
      channels.map((channel) => ({
        id: channel.id,
        label: channel.name,
        value: channel.revenue,
        comparison:
          channel.growth === undefined
            ? undefined
            : formatPercentage(channel.growth, { showSign: true }),
        comparisonTone:
          channel.growth === undefined ? "neutral" : channel.growth >= 0 ? "positive" : "negative",
      })),
    [channels],
  );

  // Ranked on growth, then split at the middle so the two ends never share a
  // member. With six categories that is three and three; a shallow dimension
  // falls back to a single ranking rather than printing each row twice.
  const ranked = useMemo(
    () => [...products].sort((a, b) => (b.growth ?? -1) - (a.growth ?? -1)),
    [products],
  );
  const paired = ranked.length >= 4;
  const half = Math.min(5, Math.floor(ranked.length / 2));
  const leaders = paired ? ranked.slice(0, half) : ranked;
  const laggards = paired ? ranked.slice(-half).reverse() : [];

  const grainLabel = GRAINS.find((option) => option.value === grain)?.label ?? "Region";

  return (
    <>
      <Masthead
        eyebrow="Commercial performance"
        titleClassName="max-w-[24ch]"
        title={headline.text ?? `${currentPeriod.label} trading reported.`}
        lede={`${dataset.profile.companyName} · ${basis} ${currentPeriod.label}. Channel, category and regional trading against plan and last year.`}
        commentary={insights[0]?.text}
        context={[
          { label: "Period", value: currentPeriod.label },
          { label: "Basis", value: basis },
          { label: storeRows.length > 0 ? "Stores" : "Channels", value: String(storeRows.length > 0 ? storeRows.length : channels.length) },
          { label: "Currency", value: dataset.profile.reportingCurrency },
        ]}
      />

      <div className="mt-9">
        <KpiBand data={kpis} emphasiseFirst />
      </div>

      <TradingRatioRail data={ratios} />

      <div className="mt-10 flex flex-col gap-10">
        {/* 01 | 02 — the trading series against where it came from ------------ */}
        <SectionRow split="65/35">
          <Section
            flushTop
            number="01"
            title="Sales performance"
            meta={capabilities.hasWeeklySales ? `Rolling ${weekWindow} trading weeks` : "Rolling 12 months"}
            description="Closed periods only, against last year and plan."
            actions={
              capabilities.hasWeeklySales ? (
                <SegmentedControl
                  aria-label="Trading window"
                  value={weekWindow}
                  onChange={setWeekWindow}
                  options={WEEK_WINDOWS.map((option) => ({ ...option }))}
                />
              ) : undefined
            }
          >
            {capabilities.hasWeeklySales ? (
              <WeeklyTrendChart data={weekly} height={330} />
            ) : (
              <TrendChart data={monthly} height={330} actualLabel="Sales — actual" />
            )}
          </Section>

          <Section
            flushTop
            number="02"
            title="Channel mix"
            meta={`${basis} ${currentPeriod.label}`}
          >
            {channels.length > 0 ? (
              <>
                <CompositionChart
                  slices={channelSlices}
                  // Ranked by revenue, so the mix reads as one hue light to dark
                  // rather than as unrelated colours competing for meaning.
                  mode="sequential"
                  surface="canvas"
                  comparisonLabel="vs LY"
                  height={196}
                  centreValue={formatCurrency(totals.revenue)}
                  centreLabel="Total sales"
                />
                <ChannelGrowthRail rows={channels} />
              </>
            ) : (
              <ReportingUnavailable message={selectModuleAvailability("sales", dataset).message} />
            )}
          </Section>
        </SectionRow>

        {/* 03 | 04 — where it traded, and why --------------------------------- */}
        <SectionRow split="55/45">
          <Section
            flushTop
            number="03"
            title={`Sales by ${grainLabel.toLowerCase()}`}
            meta={`${basis} ${currentPeriod.label}`}
            description="Members come from the active dataset's own dimension; nothing is hard-coded."
            actions={
              <SegmentedControl
                aria-label="Reporting grain"
                value={grain}
                onChange={setGrain}
                options={GRAINS.map((option) => ({ ...option }))}
              />
            }
          >
            <MemberPerformanceTable rows={members} label={grainLabel} />
          </Section>

          <Section
            flushTop
            number="04"
            title="Key commercial drivers"
            meta="Derived from reported results"
          >
            {insights.length > 0 ? (
              <NumberedInsightList insights={insights} />
            ) : (
              <p className="type-body">No movements of note in the reported trading.</p>
            )}
          </Section>
        </SectionRow>

        {/* 05 — the estate, best and worst ----------------------------------- */}
        {storeRows.length > 0 && (
          <Section
            number="05"
            title="Store performance"
            meta={`${storeRows.length} trading stores`}
            description="Every store the estate reports, ranked on growth against last year. Stores outside the like-for-like base are marked."
          >
            {pairedStores ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
                <StoreTable rows={bestStores} index={storeIndex} heading="Strongest stores" />
                <StoreTable rows={worstStores} index={storeIndex} heading="Weakest stores" />
              </div>
            ) : (
              <StoreTable rows={bestStores} index={storeIndex} heading="All trading stores" />
            )}
            <StoreFormatRail rows={storeRows} index={storeIndex} />
          </Section>
        )}

        {/* 06 — what was ordered against what was delivered ------------------- */}
        {orderBook.available && (
          <SectionRow split="65/35">
            <Section
              flushTop
              number="06"
              title="Written against delivered"
              meta="Rolling 18 months"
              description="Orders written in the month against what was delivered and recognised, and the bank of orders between them."
            >
              <OrderFlowChart data={orderFlow} height={300} />
            </Section>

            <Section flushTop number="07" title="Order bank" meta={`At ${currentPeriod.label}`}>
              <OrderBookSummary book={orderBook} />
            </Section>
          </SectionRow>
        )}

        {/* the two ends of the category ranking, side by side ----------------- */}
        <Section
          number={orderBook.available ? "08" : "06"}
          title="Category performance"
          meta="Ranked on growth vs last year"
          description="Ranked on growth against last year, across the categories the dataset defines."
        >
          {paired ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
              <CategoryTable rows={leaders} heading="Strongest categories" tone="positive" />
              <CategoryTable rows={laggards} heading="Weakest categories" tone="negative" />
            </div>
          ) : (
            <CategoryTable rows={leaders} heading="All reported categories" tone="positive" />
          )}
        </Section>

        {/* the trading weeks themselves --------------------------------------- */}
        <Section
          number={orderBook.available ? "09" : "07"}
          title="Recent trading weeks"
          meta={capabilities.hasWeeklySales ? "Last 13 closed weeks" : undefined}
          description="Peaks and troughs of the window are marked, so a scan finds the weeks that moved the period."
        >
          {capabilities.hasWeeklySales ? (
            <WeeklyDetailTable rows={weekly.slice(-13)} />
          ) : (
            <ReportingUnavailable message={selectModuleAvailability("weekly", dataset).message} />
          )}
        </Section>
      </div>
    </>
  );
}

/**
 * TRADING RATIO RAIL
 * ---------------------------------------------------------------------------
 * The ratios behind the headline figures, on one rule hung off the KPI band.
 * They are KPI data like any other — unit, precision and favourability come
 * from the registry — but they are supporting evidence, so they are set at a
 * fraction of the band's weight rather than given a second band of their own.
 */
function TradingRatioRail({ data }: { data: KpiDatum[] }) {
  if (data.length === 0) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3 py-3.5 border-b border-subtle">
      {data.map((datum) => (
        <div key={datum.metric.id} className="flex items-baseline gap-2.5">
          <span className="type-label">{datum.metric.shortName ?? datum.metric.name}</span>
          <span className="text-[14px] font-semibold text-primary tnum">
            {formatMetric(datum.value, datum.metric)}
          </span>
          {datum.variance && (
            <VarianceValue variance={datum.variance} label={datum.comparisonLabel} size="sm">
              {formatMetricDelta(datum.variance.absolute, datum.variance.relative, datum.metric)}
            </VarianceValue>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * CHANNEL GROWTH RAIL
 * ---------------------------------------------------------------------------
 * The mix answers "where are sales coming from"; this answers "and which of
 * them are growing", which the ring cannot show. Same rows, same selector.
 */
function ChannelGrowthRail({ rows }: { rows: DimensionBreakdown[] }) {
  return (
    <div className="mt-6 border-t border-subtle pt-4">
      <div className="eyebrow">Growth vs last year</div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-3 mt-3">
        {rows.map((row) => (
          <div key={row.id} className="min-w-0">
            <div className="text-[11.5px] text-secondary truncate">{row.name}</div>
            <div
              className={cn(
                "text-[15px] font-semibold tnum mt-1",
                row.growth === undefined ? "text-tertiary"
                  : row.growth >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {row.growth === undefined
                ? "—"
                : formatPercentage(row.growth, { showSign: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * MEMBER PERFORMANCE
 * ---------------------------------------------------------------------------
 * A ranked read of whichever dimension the reader selected. There is no map:
 * the dataset carries no geometry, and a drawn map of invented shapes would be
 * a decoration that implies data the product does not have.
 */
function MemberPerformanceTable({ rows, label }: { rows: DimensionBreakdown[]; label: string }) {
  const ranked = [...rows].sort((a, b) => b.revenue - a.revenue);
  const max = Math.max(...ranked.map((row) => row.revenue), 0);
  const revenueMetric = getMetric("totalSales");

  const columns: Column<DimensionBreakdown>[] = [
    {
      id: "member",
      header: label,
      align: "left",
      width: "24%",
      render: (row, index) => (
        <span className="flex items-baseline gap-3 min-w-0">
          <span aria-hidden className="type-section-number w-[14px] shrink-0">
            {index + 1}
          </span>
          <span
            className={cn(
              "truncate text-primary",
              index === 0 ? "text-[13px] font-semibold" : "text-[12.5px]",
            )}
          >
            {row.name}
          </span>
        </span>
      ),
    },
    {
      id: "revenue",
      header: "Sales",
      align: "right",
      width: "16%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.revenue)}</span>,
    },
    {
      id: "share",
      header: "Share",
      align: "right",
      width: "24%",
      render: (row, index) => (
        <div className="flex flex-col items-end gap-[5px]">
          <span>{formatPercentage(row.share)}</span>
          <Meter
            value={row.revenue}
            max={max}
            className={cn("w-full max-w-[150px]", index > 0 && "opacity-75")}
          />
        </div>
      ),
    },
    {
      id: "growth",
      header: "vs LY",
      align: "right",
      width: "18%",
      groupStart: true,
      render: (row) => {
        const variance = calculateVariance(row.revenue, row.priorYearRevenue, revenueMetric);
        if (!variance || row.growth === undefined) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.growth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
    {
      id: "margin",
      header: "Gross margin",
      align: "right",
      width: "18%",
      render: (row) => formatPercentage(row.grossMargin),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={ranked}
      rowKey={(row) => row.id}
      minWidth={560}
      empty="No members are reported for this dimension."
    />
  );
}

/**
 * CATEGORY TABLE
 * ---------------------------------------------------------------------------
 * One end of the category ranking. Both ends are the same component, so the
 * strongest and the weakest are read on identical terms.
 */
/**
 * ORDER BOOK SUMMARY
 * ---------------------------------------------------------------------------
 * The three numbers the chart cannot state exactly: what was written, what
 * was delivered, and the balance left standing — each against last year.
 *
 * The bank is given the weight, because it is the one figure here that is a
 * balance rather than a flow, and the one a reader carries away.
 */
function OrderBookSummary({ book }: { book: OrderBook }) {
  const bankMetric = getMetric("orderBank");
  const writtenMetric = getMetric("writtenSales");
  const salesMetric = getMetric("totalSales");

  const bankVariance = calculateVariance(book.bank, book.bankPriorYear, bankMetric);
  const rows = [
    {
      id: "written",
      label: writtenMetric.name,
      value: book.written,
      variance: calculateVariance(book.written, book.writtenPriorYear, writtenMetric),
    },
    {
      id: "delivered",
      label: "Delivered",
      value: book.delivered,
      variance: calculateVariance(book.delivered, book.deliveredPriorYear, salesMetric),
    },
    // Over a window of any length the two flows very nearly cancel, which is
    // why they read as the same number above. The difference between them is
    // the movement in the bank, and is the figure worth stating outright.
    {
      id: "movement",
      label: "Movement in the bank",
      value: book.written - book.delivered,
      variance: undefined,
    },
  ];

  return (
    <div>
      <div className="pb-5 border-b border-subtle">
        <div className="eyebrow">{bankMetric.name}</div>
        <div className="type-kpi-lead tnum mt-1.5">{formatCurrency(book.bank)}</div>
        <div className="flex items-baseline gap-3 mt-2">
          {bankVariance && (
            <VarianceValue variance={bankVariance} label="vs LY" size="sm">
              {formatMetricDelta(bankVariance.absolute, bankVariance.relative, bankMetric)}
            </VarianceValue>
          )}
        </div>
        {book.coverWeeks !== undefined && (
          <p className="type-caption mt-2.5">
            {book.coverWeeks.toFixed(1)} weeks of delivery at the period&rsquo;s run rate.
          </p>
        )}
      </div>

      <dl className="flex flex-col">
        {rows.map((row) => (
          <div key={row.id} className="flex items-baseline justify-between gap-4 py-3.5 border-b border-subtle last:border-b-0">
            <dt className="text-[12.5px] text-secondary">{row.label}</dt>
            <dd className="flex items-baseline gap-3">
              <span className="text-[14px] font-semibold text-primary tnum">
                {row.id === "movement"
                  ? formatCurrency(row.value, { showSign: true })
                  : formatCurrency(row.value)}
              </span>
              {row.variance && (
                <VarianceValue variance={row.variance} size="sm" showGlyph={false}>
                  {formatPercentage(row.variance.relative ?? 0, { showSign: true })}
                </VarianceValue>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p className="type-caption mt-4 leading-relaxed">
        Channels that settle at the till write and deliver in one event, so they
        net to nothing in the bank. What stands here is wholesale and online.
      </p>
    </div>
  );
}

/**
 * STORE TABLE
 * ---------------------------------------------------------------------------
 * The estate read store by store. Region and format come from the location
 * dimension itself, so a dataset whose stores carry neither simply shows
 * fewer columns of context rather than an invented one.
 */
function StoreTable({
  rows, index, heading,
}: { rows: DimensionBreakdown[]; index: Map<string, Location>; heading: string }) {
  const revenueMetric = getMetric("totalSales");
  const hasFormat = rows.some((row) => index.get(row.id)?.format);

  const columns: Column<DimensionBreakdown>[] = [
    {
      id: "name",
      header: "Store",
      align: "left",
      width: hasFormat ? "30%" : "42%",
      render: (row) => (
        <span className="text-[12.5px] text-primary">
          {row.name}
          {!row.comparable && <span className="type-caption ml-1.5">excl. LFL</span>}
        </span>
      ),
    },
    {
      id: "region",
      header: "Region",
      align: "left",
      width: "16%",
      render: (row) => {
        const parentId = index.get(row.id)?.parentId;
        const region = parentId ? index.get(parentId) : undefined;
        return <span className="text-secondary">{region?.name ?? index.get(row.id)?.region ?? "—"}</span>;
      },
    },
    ...(hasFormat
      ? [
          {
            id: "format",
            header: "Format",
            align: "left" as const,
            width: "14%",
            render: (row: DimensionBreakdown) => (
              <span className="text-secondary">{index.get(row.id)?.format ?? "—"}</span>
            ),
          },
        ]
      : []),
    {
      id: "revenue",
      header: "Sales",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.revenue)}</span>,
    },
    {
      id: "growth",
      header: "vs LY",
      align: "right",
      width: "18%",
      render: (row) => {
        const variance = calculateVariance(row.revenue, row.priorYearRevenue, revenueMetric);
        if (!variance || row.growth === undefined) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.growth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
  ];

  return (
    <div>
      <div className="eyebrow mb-3">{heading}</div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={460}
        empty="No stores traded in the reported period."
      />
    </div>
  );
}

/**
 * STORE FORMAT RAIL
 * ---------------------------------------------------------------------------
 * The estate summarised by the format each store trades in. The formats are
 * whatever the location dimension carries; nothing here assumes a particular
 * set of them.
 */
function StoreFormatRail({
  rows, index,
}: { rows: DimensionBreakdown[]; index: Map<string, Location> }) {
  const byFormat = new Map<string, { revenue: number; count: number }>();
  for (const row of rows) {
    const format = index.get(row.id)?.format;
    if (!format) continue;
    const entry = byFormat.get(format) ?? { revenue: 0, count: 0 };
    entry.revenue += row.revenue;
    entry.count += 1;
    byFormat.set(format, entry);
  }
  if (byFormat.size === 0) return null;

  const total = [...byFormat.values()].reduce((sum, entry) => sum + entry.revenue, 0);
  const formats = [...byFormat.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

  return (
    <div className="mt-8 border-t border-subtle pt-5">
      <div className="eyebrow">Estate by format</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4 mt-3.5">
        {formats.map(([format, entry]) => (
          <div key={format} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-primary truncate">{format}</span>
              <span className="type-caption tnum">{entry.count}</span>
            </div>
            <div className="text-[14px] font-semibold text-primary tnum mt-1">
              {formatCurrency(entry.revenue)}
            </div>
            <Meter value={entry.revenue} max={total} className="mt-2" />
            <div className="type-caption mt-1.5">
              {formatPercentage(total ? entry.revenue / total : 0)} of estate sales
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryTable({
  rows, heading, tone,
}: { rows: DimensionBreakdown[]; heading: string; tone: "positive" | "negative" }) {
  const revenueMetric = getMetric("totalSales");

  const columns: Column<DimensionBreakdown>[] = [
    {
      id: "name",
      header: "Category",
      align: "left",
      width: "36%",
      render: (row) => <span className="text-[12.5px] text-primary">{row.name}</span>,
    },
    {
      id: "revenue",
      header: "Sales",
      align: "right",
      width: "22%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.revenue)}</span>,
    },
    {
      id: "growth",
      header: "vs LY",
      align: "right",
      width: "21%",
      render: (row) => {
        const variance = calculateVariance(row.revenue, row.priorYearRevenue, revenueMetric);
        if (!variance || row.growth === undefined) return <span className="text-tertiary">—</span>;
        return (
          <VarianceValue variance={variance} size="sm" showGlyph={false}>
            {formatPercentage(row.growth, { showSign: true })}
          </VarianceValue>
        );
      },
    },
    {
      id: "margin",
      header: "GM %",
      align: "right",
      width: "21%",
      render: (row) => formatPercentage(row.grossMargin),
    },
  ];

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2.5 pb-2.5">
        <span
          aria-hidden
          className={cn("w-[18px] h-[2px]", tone === "positive" ? "bg-positive" : "bg-negative")}
        />
        <span className="type-label">{heading}</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={420}
        empty="No categories are reported for this selection."
      />
    </div>
  );
}

/**
 * WEEKLY DETAIL
 * ---------------------------------------------------------------------------
 * The trading weeks themselves. The best and worst weeks of the window are
 * marked so a scan finds them without reading every row — the mark is derived
 * from the rows on screen, and no week is synthesised from a monthly total.
 */
function WeeklyDetailTable({ rows }: { rows: WeeklyPoint[] }) {
  const revenueMetric = getMetric("totalSales");
  const revenues = rows.map((row) => row.revenue);
  const peak = Math.max(...revenues, Number.NEGATIVE_INFINITY);
  const trough = Math.min(...revenues, Number.POSITIVE_INFINITY);

  const comparison = (value: number, against: number | undefined) => {
    const variance = calculateVariance(value, against, revenueMetric);
    if (!variance || variance.relative === undefined) return <span className="text-tertiary">—</span>;
    return (
      <VarianceValue variance={variance} size="sm" showGlyph={false}>
        {formatPercentage(variance.relative, { showSign: true })}
      </VarianceValue>
    );
  };

  const columns: Column<WeeklyPoint>[] = [
    {
      id: "week",
      header: "Week",
      align: "left",
      width: "16%",
      render: (row) => <span className="text-[12.5px] text-primary">{row.week.label}</span>,
    },
    {
      id: "marker",
      header: "",
      align: "left",
      width: "12%",
      render: (row) => (
        <span className="type-caption">
          {row.revenue === peak ? "Peak" : row.revenue === trough ? "Trough" : ""}
        </span>
      ),
    },
    {
      id: "revenue",
      header: "Sales",
      align: "right",
      width: "16%",
      groupStart: true,
      render: (row) => <span className="font-medium">{formatCurrency(row.revenue)}</span>,
    },
    {
      id: "shape",
      header: "",
      align: "left",
      width: "20%",
      render: (row) => (
        <Meter
          value={row.revenue}
          max={peak}
          className={cn("max-w-[190px]", row.revenue !== peak && "opacity-75")}
        />
      ),
    },
    {
      id: "ly",
      header: "Last year",
      align: "right",
      width: "12%",
      groupStart: true,
      render: (row) =>
        row.priorYear === undefined
          ? <span className="text-tertiary">—</span>
          : formatCurrency(row.priorYear),
    },
    {
      id: "vs-ly",
      header: "vs LY",
      align: "right",
      width: "12%",
      render: (row) => comparison(row.revenue, row.priorYear),
    },
    {
      id: "vs-budget",
      header: "vs Budget",
      align: "right",
      width: "12%",
      groupStart: true,
      render: (row) => comparison(row.revenue, row.budget || undefined),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.week.id}
      minWidth={840}
      empty="No closed trading weeks fall within the selected reporting date."
    />
  );
}
