import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  THIN_SAMPLE_THRESHOLD,
  distributionShares,
  dimensionLabel,
  formatAverage,
  formatResponseRate,
  isThinSample,
  ratingTone,
} from "../admin-feedback-view.ts";
import type { AdminFeedbackDimensionDto } from "../../../types/admin-feedback.ts";

function dimension(
  overrides: Partial<AdminFeedbackDimensionDto> = {},
): AdminFeedbackDimensionDto {
  return {
    dimension: "overallRating",
    responseCount: 40,
    averageRating: 4.2,
    distribution: [1, 2, 5, 12, 20],
    ...overrides,
  };
}

describe("formatAverage", () => {
  it("prints one decimal place", () => {
    assert.equal(formatAverage(4.25), "4.3");
    assert.equal(formatAverage(4), "4.0");
  });

  it("prints a dash when nobody rated it, never 0.0", () => {
    // Zero out of five is the worst score the scale has. Nobody answering is not a score, and
    // the two must not render as the same thing.
    assert.equal(formatAverage(null), "—");
  });

  it("still prints a genuine low score", () => {
    // The mirror of the case above: an actual 1.0 has to survive.
    assert.equal(formatAverage(1), "1.0");
  });
});

describe("formatResponseRate", () => {
  it("prints a whole percent", () => {
    assert.equal(formatResponseRate(0.42), "42%");
    assert.equal(formatResponseRate(1), "100%");
  });

  it("prints a dash when no meeting was ever eligible", () => {
    // Null means nothing ended in the window. "0%" would claim every eligible meeting went
    // unrated when none was eligible.
    assert.equal(formatResponseRate(null), "—");
  });

  it("distinguishes that from a real zero", () => {
    assert.equal(formatResponseRate(0), "0%");
  });
});

describe("isThinSample", () => {
  it("flags a confident-looking average from a handful of people", () => {
    assert.equal(isThinSample(dimension({ responseCount: 4, averageRating: 4.8 })), true);
  });

  it("does not flag a dimension nobody answered", () => {
    // That one already shows a dash. Labelling it "thin" as well would say there is a number
    // here worth doubting, when there is no number at all.
    assert.equal(
      isThinSample(dimension({ responseCount: 0, averageRating: null, distribution: [0, 0, 0, 0, 0] })),
      false,
    );
  });

  it("stops flagging at the threshold, not above it", () => {
    assert.equal(isThinSample(dimension({ responseCount: THIN_SAMPLE_THRESHOLD - 1 })), true);
    assert.equal(isThinSample(dimension({ responseCount: THIN_SAMPLE_THRESHOLD })), false);
  });
});

describe("distributionShares", () => {
  it("divides by this dimension's own total, not the report's", () => {
    // Each dimension has its own respondents — four of the five are optional. Sharing one
    // denominator would shrink every optional dimension's bars against a total they never had.
    const shares = distributionShares(dimension({ distribution: [0, 0, 0, 1, 3] }));
    assert.deepEqual(shares, [0, 0, 0, 0.25, 0.75]);
  });

  it("returns zeroes rather than dividing by zero", () => {
    const shares = distributionShares(dimension({ distribution: [0, 0, 0, 0, 0] }));
    assert.deepEqual(shares, [0, 0, 0, 0, 0]);
  });
});

describe("ratingTone", () => {
  it("treats a 3 as neutral, not as a warning", () => {
    assert.equal(ratingTone(1), "bad");
    assert.equal(ratingTone(2), "bad");
    assert.equal(ratingTone(3), "neutral");
    assert.equal(ratingTone(4), "good");
    assert.equal(ratingTone(5), "good");
  });
});

describe("dimensionLabel", () => {
  it("names every dimension the API sends", () => {
    assert.equal(dimensionLabel("overallRating"), "Overall");
    assert.equal(dimensionLabel("voiceCloneQuality"), "Voice clone quality");
    assert.equal(dimensionLabel("aiSummaryQuality"), "AI summary quality");
  });

  it("falls back to the raw key rather than dropping an unknown dimension", () => {
    // A dimension added on the server should appear as something, not vanish from the report.
    assert.equal(dimensionLabel("prosodyNaturalness"), "prosodyNaturalness");
  });
});
