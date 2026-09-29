import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ADMIN_MASTER_DEFAULT_RATES,
  DEFAULT_CURRENCY_CONFIG,
  DEFAULT_FX_RATE_USD_VND,
  aggregateTelemetryBuckets,
  calculateMeetingEconomics,
  formatCreditWithFiat,
  type CurrencyRateConfig,
} from "../workspace-telemetry.ts";

describe("workspace-telemetry", () => {
  it("defaults to USD currency with standard rate", () => {
    assert.equal(DEFAULT_CURRENCY_CONFIG.currency, "USD");
    assert.equal(DEFAULT_CURRENCY_CONFIG.ratePerCredit, 0.0039);
  });

  it("formats credits with USD primary and converted VND secondary", () => {
    const output = formatCreditWithFiat(1000, DEFAULT_CURRENCY_CONFIG, 25000);
    // 1,000 * 0.0039 = 3.9 USD; 3.9 * 25,000 = 97,500 VND
    assert.match(output, /1,000 cr/);
    assert.match(output, /3\.9 USD/);
    assert.match(output, /97,500 VND/);
  });

  it("formats credits with VND primary and converted USD secondary when configured", () => {
    const vndConfig: CurrencyRateConfig = { currency: "VND", ratePerCredit: 100 };
    const output = formatCreditWithFiat(1000, vndConfig, 25000);
    // 1,000 * 100 = 100,000 VND; 100,000 / 25,000 = 4 USD
    assert.match(output, /1,000 cr/);
    assert.match(output, /100,000 VND/);
    assert.match(output, /4 USD/);
  });

  it("calculates unit economics per meeting accurately in USD", () => {
    const summary = calculateMeetingEconomics(12000, 10, 8, DEFAULT_CURRENCY_CONFIG);
    assert.equal(summary.totalCredits, 12000);
    assert.equal(summary.completedMeetingsCount, 10);
    assert.equal(summary.avgCreditsPerMeeting, 1200);
    assert.equal(summary.currency, "USD");
    assert.equal(summary.avgCostPerMeeting, 1200 * 0.0039);
    assert.equal(summary.totalCost, 12000 * 0.0039);
  });

  it("aggregates daily, monthly and quarterly telemetry buckets", () => {
    const rawDays = [
      { date: "2026-09-01", credits: 1000, meetings: 2 },
      { date: "2026-09-02", credits: 2000, meetings: 3 },
      { date: "2026-10-01", credits: 3000, meetings: 4 },
    ];

    // Day aggregation
    const dayBuckets = aggregateTelemetryBuckets("day", rawDays, DEFAULT_CURRENCY_CONFIG);
    assert.equal(dayBuckets.length, 3);
    assert.equal(dayBuckets[0].credits, 1000);
    assert.equal(dayBuckets[0].currency, "USD");

    // Month aggregation
    const monthBuckets = aggregateTelemetryBuckets("month", rawDays, DEFAULT_CURRENCY_CONFIG);
    assert.equal(monthBuckets.length, 2);
    const sep = monthBuckets.find((b) => b.key === "2026-09");
    assert.ok(sep);
    assert.equal(sep.credits, 3000);
    assert.equal(sep.meetings, 5);

    // Quarter aggregation
    const qBuckets = aggregateTelemetryBuckets("quarter", rawDays, DEFAULT_CURRENCY_CONFIG);
    assert.equal(qBuckets.length, 2); // Q3 and Q4
  });
});
