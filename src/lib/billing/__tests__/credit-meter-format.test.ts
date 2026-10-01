import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { IntlMessageFormat } from "intl-messageformat";

import { paceProjectionMessage, usedPercentLabel } from "../credit-meter-format.ts";

type Catalog = { meter: Record<string, unknown> };
const catalog = (locale: string): Catalog =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}/settingsBilling.json`, import.meta.url), "utf8"));

const en = catalog("en");
const say = (key: string, values: Record<string, unknown>) =>
  new IntlMessageFormat(String(en.meter[key]), "en").format(values) as string;

test("exactly zero used reads 0", () => {
  assert.equal(usedPercentLabel(0, 2_087_377), 0);
  assert.equal(say("usedPercent", { percent: usedPercentLabel(0, 2_087_377) }), "0% used");
});

test("any use under 1% reads <1, never 0", () => {
  assert.equal(usedPercentLabel(863, 2_087_377), "<1");
  assert.equal(usedPercentLabel(1, 10_000), "<1");
  assert.equal(usedPercentLabel(99, 10_000), "<1");
  assert.equal(say("usedPercent", { percent: usedPercentLabel(863, 2_087_377) }), "<1% used");
  assert.equal(
    say("ariaValueText", { percent: "<1", level: "On track" }),
    "<1% of this cycle's credits used, On track",
  );
});

test("1% and above floor to one decimal and cap at 100", () => {
  assert.equal(usedPercentLabel(100, 10_000), 1);
  assert.equal(usedPercentLabel(1_239, 10_000), 12.3);
  assert.equal(usedPercentLabel(9_999, 10_000), 99.9);
  assert.equal(usedPercentLabel(12_000, 10_000), 100);
});

test("no allowance or bad input reads 0", () => {
  assert.equal(usedPercentLabel(50, 0), 0);
  assert.equal(usedPercentLabel(Number.NaN, 100), 0);
  assert.equal(usedPercentLabel(-5, 100), 0);
});

test("under one day: 'within a day', not 'about 0 days'", () => {
  // Critical fixture: 11,377 left on day 20 of 31 — the projection is a fraction of a day.
  const m = paceProjectionMessage(0.4, 11);
  assert.deepEqual(m, { key: "paceRunsOutWithinDay", values: { early: 11 } });
  assert.equal(
    say(m.key, m.values),
    "At this pace it runs out within a day, 11 days before the cycle ends.",
  );
  const atEnd = paceProjectionMessage(0.4, 0);
  assert.equal(atEnd.key, "paceRunsOutWithinDayAtEnd");
  assert.equal(say(atEnd.key, atEnd.values), "At this pace it runs out within a day, right as the cycle ends.");
});

test("singular and plural days read right in English", () => {
  const one = paceProjectionMessage(1.7, 2);
  assert.deepEqual(one, { key: "paceRunsOut", values: { days: 1, early: 1 } });
  assert.equal(say(one.key, one.values), "At this pace it runs out in about 1 day, 1 day before the cycle ends.");
  const many = paceProjectionMessage(5.2, 9);
  assert.equal(say(many.key, many.values), "At this pace it runs out in about 5 days, 4 days before the cycle ends.");
  const end = paceProjectionMessage(3.9, 3);
  assert.deepEqual(end, { key: "paceRunsOutAtEnd", values: { days: 3 } });
  assert.equal(say(end.key, end.values), "At this pace it runs out in about 3 days, right as the cycle ends.");
});

test("every locale has the within-a-day sentences", () => {
  for (const locale of ["en", "vi", "ja"]) {
    const meter = catalog(locale).meter;
    for (const key of ["paceRunsOutWithinDay", "paceRunsOutWithinDayAtEnd"]) {
      assert.equal(typeof meter[key], "string", `${locale}: meter.${key}`);
    }
    const text = new IntlMessageFormat(String(meter.paceRunsOutWithinDay), locale).format({ early: 11 });
    assert.match(String(text), /11/);
  }
});
