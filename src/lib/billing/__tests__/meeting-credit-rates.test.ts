import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  creditsPerMinute,
  meetingCreditRates,
  parseCreditUnitPrice,
  type MeetingRateCardLike,
} from "../meeting-credit-rates.ts";

const card = (overrides: Partial<MeetingRateCardLike> = {}): MeetingRateCardLike => ({
  id: "card",
  chargeType: "TRANSLATION",
  unit: "second",
  currency: "CRD",
  unitPrice: 0.5,
  sourceLanguageCode: null,
  targetLanguageCode: null,
  effectiveTo: null,
  isActive: true,
  ...overrides,
});

describe("meetingCreditRates", () => {
  it("returns the three billed charge types in pipeline order", () => {
    const rates = meetingCreditRates([
      card({ id: "clone", chargeType: "AUDIO_DUBBING_VOICE_CLONE" }),
      card({ id: "tr" }),
      card({ id: "std", chargeType: "AUDIO_DUBBING_STANDARD" }),
    ]);

    assert.deepEqual(
      rates.map((rate) => [rate.chargeType, rate.card?.id]),
      [
        ["TRANSLATION", "tr"],
        ["AUDIO_DUBBING_STANDARD", "std"],
        ["AUDIO_DUBBING_VOICE_CLONE", "clone"],
      ],
    );
  });

  it("ignores the provider-cost card of the same charge type", () => {
    const [translation] = meetingCreditRates([card({ id: "usd", currency: "USD", unit: "token_in" })]);

    assert.equal(translation.card, null);
  });

  it("ignores a superseded card", () => {
    const [translation] = meetingCreditRates([
      card({ id: "old", isActive: false, effectiveTo: "2026-10-02T00:00:00Z" }),
      card({ id: "new" }),
    ]);

    assert.equal(translation.card?.id, "new");
  });

  it("does not offer free pipelines", () => {
    const rates = meetingCreditRates([card({ chargeType: "STT" })]);

    assert.ok(rates.every((rate) => rate.card === null));
  });

  it("reads the CRD label however the database padded it", () => {
    const [translation] = meetingCreditRates([card({ currency: "crd " })]);

    assert.equal(translation.card?.id, "card");
  });
});

describe("parseCreditUnitPrice", () => {
  it("accepts a positive decimal", () => {
    assert.equal(parseCreditUnitPrice(" 1.333334 "), 1.333334);
  });

  it("refuses zero, negatives, words and more precision than the column holds", () => {
    for (const raw of ["0", "-1", "abc", "", "0.1234567", "1e2"]) {
      assert.equal(parseCreditUnitPrice(raw), null, raw);
    }
  });

  it("refuses a price above the server ceiling", () => {
    assert.equal(parseCreditUnitPrice("100"), 100);
    assert.equal(parseCreditUnitPrice("100.5"), null);
  });
});

describe("creditsPerMinute", () => {
  it("is sixty seconds at the per-second price", () => {
    assert.equal(creditsPerMinute(0.5), 30);
    assert.equal(creditsPerMinute(1.333334), 80);
  });
});
