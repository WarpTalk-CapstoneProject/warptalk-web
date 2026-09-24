import test from "node:test";
import assert from "node:assert/strict";

import {
  costPerMeetingHour,
  costPerMeetingHourByDay,
  fxLineView,
  pnlCards,
  providerColors,
  providerCostSeries,
} from "../insights-pnl.ts";
import type { FxRateStatusDto, MeetingsInsightsDto, PnlPeriodDto, ProfitAndLossDto } from "../../../types/admin-insights.ts";

const day = (key: string, aiCost: number | null, providers: PnlPeriodDto["providers"] = []): PnlPeriodDto => ({
  key, revenue: 0, aiCost, aiCostUsd: 0, grossMargin: null, marginPercent: null, credits: 0,
  costCoveragePercent: 100, activeWorkspaces: 0, arpa: null, fxRate: 25_990, providers,
});

const metric = (id: string, value: number | null, previous: number | null, unit = "money" as const, higherIsBetter = true) =>
  ({ id, value, previous, unit, higherIsBetter, note: null });

test("cost per meeting-hour is cost ÷ hours, and null with a reason rather than 0", () => {
  assert.deepEqual(costPerMeetingHour(1_000_000, 4), { value: 250_000, note: "AI provider cost ÷ hours translated" });
  assert.equal(costPerMeetingHour(null, 4).value, null);
  assert.equal(costPerMeetingHour(1_000, 0).value, null);
  assert.match(costPerMeetingHour(1_000, 0).note ?? "", /no meeting hours/);
  assert.equal(costPerMeetingHour(1_000, undefined).value, null);
});

test("per-day cost per meeting-hour joins on the local day key", () => {
  const meetings = [{ date: "2026-09-01", meetings: 2, hours: 2 }, { date: "2026-09-02", meetings: 0, hours: 0 }];
  assert.deepEqual(costPerMeetingHourByDay([day("2026-09-01", 100), day("2026-09-02", 50), day("2026-09-03", null)], meetings), [50, null, null]);
});

test("the P&L cards: six figures, the derived one unavailable when either source is", () => {
  const pnl = {
    metrics: [
      metric("revenue", 10_000_000, 8_000_000),
      metric("aiProviderCost", 2_000_000, 1_000_000, "money", false),
      metric("grossMargin", 8_000_000, 7_000_000),
      metric("grossMarginPercent", 80, 87.5, "percent" as never),
      metric("arpa", 1_000_000, null),
    ],
  } as unknown as ProfitAndLossDto;
  const meetings = { metrics: [metric("hoursTranslated", 40, 10, "hours" as never)] } as unknown as MeetingsInsightsDto;

  const cards = pnlCards(pnl, meetings);
  assert.deepEqual(cards.map((c) => c.id), ["revenue", "aiProviderCost", "grossMargin", "grossMarginPercent", "arpa", "costPerMeetingHour"]);
  const perHour = cards.find((c) => c.id === "costPerMeetingHour")!;
  assert.match(perHour.value, /50[.,]000/);
  assert.equal(perHour.available, true);
  // 2,000,000 / 40 = 50,000 now vs 1,000,000 / 10 = 100,000 before: cheaper is better, so green.
  assert.equal(perHour.deltaTone, "success");
  assert.equal(cards.find((c) => c.id === "aiProviderCost")!.deltaTone, "danger");
  assert.equal(pnlCards(pnl, undefined).find((c) => c.id === "costPerMeetingHour")!.available, false);
  assert.equal(pnlCards(undefined, meetings)[0].value, "—");
});

test("provider colours follow the provider, never its rank", () => {
  assert.deepEqual(providerColors(["cartesia", "openai"]), { openai: "var(--viz-1)", cartesia: "var(--viz-2)" });
  const withOthers = providerColors(["unknown", "cartesia", "deepgram", "openai"]);
  assert.equal(withOthers.openai, "var(--viz-1)");
  assert.equal(withOthers.cartesia, "var(--viz-2)");
  assert.equal(withOthers.deepgram, "var(--viz-3)");
  assert.equal(withOthers.unknown, "var(--viz-4)");
});

test("provider cost series: a day without a rate is a gap in VND, never 0; USD always has a figure", () => {
  const days = [
    day("2026-09-01", 0, [{ provider: "openai", credits: 10, costUsd: 1, costVnd: 26_000 }]),
    day("2026-09-02", 0, [{ provider: "openai", credits: 10, costUsd: 2, costVnd: null }, { provider: "cartesia", credits: 5, costUsd: 3, costVnd: 78_000 }]),
  ];
  const vnd = providerCostSeries(days, "VND");
  assert.deepEqual(vnd.map((s) => s.key), ["cartesia", "openai"]);
  assert.deepEqual(vnd.find((s) => s.key === "openai")!.values, [26_000, null]);
  assert.deepEqual(vnd.find((s) => s.key === "cartesia")!.values, [0, 78_000]);
  assert.deepEqual(providerCostSeries(days, "USD").find((s) => s.key === "openai")!.values, [1, 2]);
});

test("the FX line says where the rate came from, and warns when it is stale", () => {
  const fx: FxRateStatusDto = {
    baseCurrency: "USD", quoteCurrency: "VND", rate: 25_989.9, source: "stripe_fx_quote", sourceLabel: "Stripe FX quote",
    rateDate: "2026-09-24", asOf: "2026-09-24T10:00:00Z", basis: "exact", mode: "stripe", manualRate: null,
    latestStripe: null, stale: false, warning: null, history: [],
  };
  const fresh = fxLineView(fx, () => "Sep 24, 17:00")!;
  assert.equal(fresh.rate, "25,989.9 VND/USD");
  assert.equal(fresh.source, "Stripe FX quote");
  assert.equal(fresh.asOf, "Sep 24, 17:00");
  assert.equal(fresh.tone, "neutral");

  const stale = fxLineView({ ...fx, stale: true, basis: "carriedForward", warning: "Stripe has not returned a rate since 2026-09-21" }, () => "x")!;
  assert.equal(stale.tone, "warning");
  assert.match(stale.warning ?? "", /since 2026-09-21/);
  assert.equal(fxLineView({ ...fx, mode: "manual", source: "manual" }, () => "x")!.source, "Manual override");
  assert.equal(fxLineView(null, () => "x"), null);
});
