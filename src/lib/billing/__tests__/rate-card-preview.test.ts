import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canSaveRateCard,
  formatMarginRatio,
  previewableInputs,
} from "../rate-card-preview.ts";

const stored = { providerUnitCostUsd: 0.006, markupMultiplier: 3 };

describe("previewableInputs", () => {
  it("needs both inputs, and ones the calculator will accept", () => {
    assert.deepEqual(previewableInputs(stored), stored);
    assert.equal(previewableInputs({ providerUnitCostUsd: null, markupMultiplier: 3 }), null);
    assert.equal(previewableInputs({ providerUnitCostUsd: 0.006, markupMultiplier: 0 }), null);
    assert.equal(previewableInputs({ providerUnitCostUsd: Number.NaN, markupMultiplier: 3 }), null);
  });
});

describe("canSaveRateCard", () => {
  it("needs no preview when neither pricing input moved", () => {
    assert.deepEqual(canSaveRateCard(stored, { ...stored }, null), { ok: true });
  });

  it("requires a preview when cost or markup moved", () => {
    const draft = { ...stored, markupMultiplier: 1.2 };
    assert.deepEqual(canSaveRateCard(stored, draft, null), { ok: false, reason: "preview-required" });
  });

  it("accepts a preview of exactly the draft", () => {
    const draft = { ...stored, markupMultiplier: 1.2 };
    assert.deepEqual(canSaveRateCard(stored, draft, { ...draft }), { ok: true });
  });

  it("rejects a preview of different numbers than the ones being saved", () => {
    const draft = { ...stored, markupMultiplier: 1.2 };
    assert.deepEqual(canSaveRateCard(stored, draft, { ...stored, markupMultiplier: 1.5 }), {
      ok: false,
      reason: "preview-stale",
    });
  });

  it("lets an input be cleared to 'not recorded' without a preview it could never get", () => {
    assert.deepEqual(canSaveRateCard(stored, { ...stored, providerUnitCostUsd: null }, null), { ok: true });
  });
});

describe("formatMarginRatio", () => {
  it("makes a loss impossible to misread", () => {
    assert.equal(formatMarginRatio(0.667), "66.7%");
    assert.equal(formatMarginRatio(-0.25), "−25.0%");
  });
});
