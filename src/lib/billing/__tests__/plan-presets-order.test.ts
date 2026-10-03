import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  INVOICE_GRACE_PRESETS,
  matchPreset,
  overageCapPresets,
  overagePricePresets,
} from "../plan-presets.ts";
import { moveId, nextSortOrder, sortOrderUpdates } from "../plan-order.ts";

describe("plan editor presets", () => {
  test("shares of the plan's credits are worked out from the plan", () => {
    assert.deepEqual(overageCapPresets(700).map((o) => o.value), [0, 70, 175, 350, 700]);
    assert.deepEqual(overageCapPresets(0).map((o) => o.value), [0]);
  });

  test("overage price is offered as multiples of the in-plan credit price", () => {
    const options = overagePricePresets(500, 700);
    assert.equal(options[0].labelKey, "overagePriceSame");
    assert.equal(options[0].value, Number((500 / 700).toPrecision(6)));
    assert.equal(options.length, 4);
    assert.deepEqual(overagePricePresets(0, 700), []);
  });

  test("a stored value that matches nothing is Custom, so saving never changes it", () => {
    assert.equal(matchPreset(INVOICE_GRACE_PRESETS, 360)?.labelKey, "graceDays");
    assert.equal(matchPreset(INVOICE_GRACE_PRESETS, 359), null);
  });
});

describe("drag-and-drop ordering", () => {
  const plans = [
    { id: "a", sortOrder: 10 },
    { id: "b", sortOrder: 20 },
    { id: "c", sortOrder: 30 },
  ];

  test("moving c before a renumbers only what changed", () => {
    const order = moveId(["a", "b", "c"], "c", "a");
    assert.deepEqual(order, ["c", "a", "b"]);
    assert.deepEqual(sortOrderUpdates(plans, order), [
      { id: "c", sortOrder: 10 },
      { id: "a", sortOrder: 20 },
      { id: "b", sortOrder: 30 },
    ]);
  });

  test("no move, no writes", () => {
    assert.deepEqual(sortOrderUpdates(plans, ["a", "b", "c"]), []);
  });

  test("production's ties (several plans at 0 or 1) are spread out on the first drag", () => {
    const tied = [{ id: "x", sortOrder: 0 }, { id: "y", sortOrder: 0 }];
    assert.deepEqual(sortOrderUpdates(tied, moveId(["x", "y"], "y", "x")), [
      { id: "y", sortOrder: 10 },
      { id: "x", sortOrder: 20 },
    ]);
  });

  test("a new plan goes after the last one", () => {
    assert.equal(nextSortOrder(plans), 40);
    assert.equal(nextSortOrder([]), 10);
  });
});
